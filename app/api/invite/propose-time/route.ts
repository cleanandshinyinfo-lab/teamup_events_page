import { NextRequest, NextResponse } from 'next/server';
import { getInvitationByToken, getPool, recordProposedTime } from '@/lib/db';

interface EnrichRow {
  client_name: string | null;
  city: string | null;
  start_date_es: string | null;
}

// Mensaje a #servicio-al-cliente: la cleaner puede tomar el servicio cancelado
// pero llegando a otra hora. El equipo coordina con el cliente desde ahí.
function buildSlackText(params: {
  cleanerName: string;
  proposedTime: string;
  eventId: string;
  db: EnrichRow;
}): string {
  const { cleanerName, proposedTime, eventId, db } = params;
  const city = (db.city || '').replace(/_/g, ' ');
  const lines = [
    `*Propuesta de otro horario para un servicio cancelado de último minuto* 🕐`,
    '---',
    `La cleaner *${cleanerName}* puede realizar el servicio cancelado de la cliente *${db.client_name || ''}*, pero podría llegar a las *${proposedTime}*.`,
    ...(city ? [`*Ciudad:* ${city}`] : []),
    ...(db.start_date_es ? [`*Fecha del servicio:* ${db.start_date_es}`] : []),
    `*ID del servicio:* ${eventId}`,
  ];
  return lines.join('\n');
}

async function notifyServicioAlCliente(params: {
  eventId: string;
  cleanerName: string;
  proposedTime: string;
}): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_SERVICIO_AL_CLIENTE_CHANNEL_ID;
  if (!token || !channel) {
    console.warn('[SLACK_SERVICIO_AL_CLIENTE] SLACK_BOT_TOKEN o SLACK_SERVICIO_AL_CLIENTE_CHANNEL_ID no configurados');
    return;
  }
  try {
    const enrich = await getPool().query<EnrichRow>(
      `SELECT
         rc.client_name,
         rc.city,
         "Glide".format_spanish_date(rc.start_teamup_local::timestamptz) AS start_date_es
       FROM "Glide".recent_contracts rc
       WHERE rc.teamup_event_id = $1
       LIMIT 1`,
      [params.eventId],
    );
    const db = enrich.rows[0] ?? ({} as EnrichRow);
    const text = buildSlackText({
      cleanerName: params.cleanerName,
      proposedTime: params.proposedTime,
      eventId: params.eventId,
      db,
    });

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, text }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!data.ok) {
      console.error('[SLACK_SERVICIO_AL_CLIENTE] chat.postMessage error:', res.status, data.error || 'unknown_error');
    }
  } catch (err) {
    console.error('[SLACK_SERVICIO_AL_CLIENTE] error:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { token, proposed_time } = (await req.json()) as {
      token?: string;
      proposed_time?: string;
    };

    const proposedTime = (proposed_time || '').trim();
    if (!token || !proposedTime) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }
    if (proposedTime.length > 100) {
      return NextResponse.json({ error: 'El horario propuesto es demasiado largo' }, { status: 400 });
    }

    const invitation = await getInvitationByToken(token);
    if (!invitation) {
      return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: 'Ya respondiste esta invitación', status: invitation.status },
        { status: 409 },
      );
    }

    await recordProposedTime(token, proposedTime);

    await notifyServicioAlCliente({
      eventId: invitation.teamup_event_id,
      cleanerName: invitation.cleaner_name,
      proposedTime,
    });

    return NextResponse.json({
      ok: true,
      status: 'time_proposed',
      message: 'Hemos enviado tu propuesta de horario al equipo. ¡Gracias!',
    });
  } catch (error) {
    console.error('[INVITE_PROPOSE_TIME] error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
