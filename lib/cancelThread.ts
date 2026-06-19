import { getPool } from './db';

// Persona a taggear en los avisos de cancelación (Alan Gómez Herrera).
export const CANCELACION_TAG = '<@U097VJN0WRH>';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

interface CancelRow {
  client_name: string | null;
  city: string | null;
  start_teamup_local: string | null;
  fecha_es: string | null;
}
interface SlackMsg {
  ts: string;
  text?: string;
}

/**
 * Publica `text` como reply en el hilo del mensaje que Zapier mandó a
 * #cancelacion-de-ultimo-minuto para ese servicio. Empareja por cliente + fecha
 * + hora (el texto de Zapier: "...al servicio de <cliente> el dia <Día DD de mes
 * a las HH:MM ...>"). Si no encuentra el hilo, publica el mensaje suelto en el
 * canal (no se pierde la info).
 */
export async function replyInCancellationThread(eventId: string, text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CANCELACION_CHANNEL_ID;
  if (!token || !channel) {
    console.warn('[SLACK_CANCELACION] SLACK_BOT_TOKEN o SLACK_CANCELACION_CHANNEL_ID no configurados');
    return;
  }
  try {
    const { rows } = await getPool().query<CancelRow>(
      `SELECT client_name, city,
              to_char(start_teamup_local, 'YYYY-MM-DD HH24:MI') AS start_teamup_local,
              "Glide".format_spanish_date(start_teamup_local::timestamptz) AS fecha_es
       FROM "Glide".recent_contracts WHERE teamup_event_id = $1 LIMIT 1`,
      [eventId],
    );
    const r = rows[0];

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
      const hist = (await histRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        messages?: SlackMsg[];
      };
      if (hist.ok && Array.isArray(hist.messages)) {
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

    // Si no se encontró el hilo de Zapier, el mensaje va suelto -> incluir los
    // datos del servicio para que el equipo tenga el contexto.
    let finalText = text;
    if (!threadTs) {
      const cityLabel = (r?.city || '').replace(/_/g, ' ');
      finalText = [
        text,
        '',
        '_(No se encontró el aviso original de Zapier para enlazar — datos del servicio:)_',
        `*Cliente:* ${r?.client_name || '—'}`,
        ...(cityLabel ? [`*Ciudad:* ${cityLabel}`] : []),
        ...(r?.fecha_es ? [`*Fecha del servicio:* ${r.fecha_es}`] : []),
        `*ID del servicio:* ${eventId}`,
      ].join('\n');
    }

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text: finalText, ...(threadTs ? { thread_ts: threadTs } : {}) }),
    });
    const pd = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!pd.ok) console.error('[SLACK_CANCELACION] chat.postMessage error:', pd.error || 'unknown');
  } catch (err) {
    console.error('[SLACK_CANCELACION] error:', err);
  }
}
