import { NextRequest, NextResponse } from 'next/server';
import { getBrowseCleanerByToken, getPool, requestServiceForCleaner } from '@/lib/db';

type AssignOutcome = 'success' | 'already_assigned' | 'failed';

function classifyAssignResult(row: { ok?: boolean; message?: string | null }): {
  outcome: AssignOutcome;
  message: string;
} {
  const message = row.message ?? '';
  if (row.ok) return { outcome: 'success', message };
  if (message.toLowerCase().includes('asignado')) {
    return { outcome: 'already_assigned', message };
  }
  return { outcome: 'failed', message };
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

interface CancelRow {
  client_name: string | null;
  start_teamup_local: string | null;
}
interface SlackMsg {
  ts: string;
  text?: string;
}

// Al aceptarse un servicio cancelado, publica un reply en el hilo del mensaje que
// Zapier mandó a #cancelacion-de-ultimo-minuto. Empareja por cliente + fecha + hora
// (el texto de Zapier: "...al servicio de <cliente> el dia <Día DD de mes a las HH:MM ...>").
// Si no encuentra el hilo, publica el aviso suelto en el canal (no se pierde la info).
async function notifyAcceptedInThread(params: { eventId: string; cleanerName: string }): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CANCELACION_CHANNEL_ID;
  if (!token || !channel) {
    console.warn('[SLACK_CANCELACION] SLACK_BOT_TOKEN o SLACK_CANCELACION_CHANNEL_ID no configurados');
    return;
  }
  try {
    const { rows } = await getPool().query<CancelRow>(
      `SELECT client_name, to_char(start_teamup_local, 'YYYY-MM-DD HH24:MI') AS start_teamup_local
       FROM "Glide".recent_contracts WHERE teamup_event_id = $1 LIMIT 1`,
      [params.eventId],
    );
    const r = rows[0];
    const text = `✅ La cleaner *${params.cleanerName}* tomó este servicio cancelado (vía la página de servicios).`;

    let threadTs: string | undefined;
    const m = r?.start_teamup_local?.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (m) {
      const day = parseInt(m[3], 10);
      const month = MESES[parseInt(m[2], 10) - 1];
      const h24 = parseInt(m[4], 10);
      const minutes = m[5];
      const h12 = h24 % 12 || 12;
      const dayMonth = normalize(`${day} de ${month}`); // ej "18 de junio"
      const timeStr = `${h12}:${minutes}`; // ej "9:00"
      const clientFirst =
        normalize((r?.client_name || '').replace(/\([^)]*\)/g, '')).trim().split(/\s+/)[0] || '';

      const histRes = await fetch(
        `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const hist = (await histRes.json().catch(() => ({}))) as { ok?: boolean; error?: string; messages?: SlackMsg[] };
      if (hist.ok && Array.isArray(hist.messages)) {
        // candidatos por fecha + hora; si hay varios, se desempata por nombre de cliente
        let matches = hist.messages.filter((msg) => {
          const t = normalize(msg.text || '');
          return t.includes(dayMonth) && t.includes(timeStr);
        });
        if (matches.length > 1 && clientFirst) {
          const narrowed = matches.filter((msg) => normalize(msg.text || '').includes(clientFirst));
          if (narrowed.length) matches = narrowed;
        }
        threadTs = matches[0]?.ts; // conversations.history viene de más nuevo a más viejo
      } else {
        console.warn('[SLACK_CANCELACION] conversations.history error:', hist.error || 'unknown');
      }
    }

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text, ...(threadTs ? { thread_ts: threadTs } : {}) }),
    });
    const pd = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!pd.ok) console.error('[SLACK_CANCELACION] chat.postMessage error:', pd.error || 'unknown');
  } catch (err) {
    console.error('[SLACK_CANCELACION] error:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { token, teamup_event_id } = (await req.json()) as {
      token?: string;
      teamup_event_id?: string;
    };

    if (!token || !teamup_event_id) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const cleaner = await getBrowseCleanerByToken(token);
    if (!cleaner) {
      return NextResponse.json({ error: 'Link no válido o expirado' }, { status: 404 });
    }

    const row = await requestServiceForCleaner(cleaner, String(teamup_event_id));
    const { outcome, message } = classifyAssignResult(row);

    if (outcome === 'success') {
      await notifyAcceptedInThread({
        eventId: String(teamup_event_id),
        cleanerName: cleaner.cleaner_name || 'Una cleaner',
      });
    }

    return NextResponse.json({
      ok: outcome === 'success',
      outcome,
      message:
        message ||
        (outcome === 'success'
          ? '¡Servicio solicitado!'
          : 'No se pudo solicitar este servicio.'),
    });
  } catch (error) {
    console.error('[SERVICIOS_SOLICITAR] error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
