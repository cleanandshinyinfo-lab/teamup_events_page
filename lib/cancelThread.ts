import { getPool } from './db';

// IDs de Slack a etiquetar
const ALAN = 'U097VJN0WRH';
const ALEXIS = 'U0614UUFAH4';
const EUGENIA = 'U0BAVN4D52R';

interface InfoRow {
  client_name: string | null;
  city: string | null;
  fecha_es: string | null;
  slack_message_id: string | null;
  is_last_min: boolean;
}

// Fin de semana según el día en que se solicita (hora de Toronto).
function isWeekendNow(): boolean {
  const wd = new Date().toLocaleDateString('en-US', { timeZone: 'America/Toronto', weekday: 'short' });
  return wd === 'Sat' || wd === 'Sun';
}

// Etiquetas para una solicitud de cambio de horario: entre semana Alexis+Alan, finde Eugenia.
function proposeTags(): string {
  return isWeekendNow() ? `<@${EUGENIA}>` : `<@${ALEXIS}> <@${ALAN}>`;
}

async function postSlack(params: {
  token: string;
  channel: string;
  text: string;
  threadTs?: string | null;
}): Promise<void> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${params.token}` },
    body: JSON.stringify({
      channel: params.channel,
      text: params.text,
      ...(params.threadTs ? { thread_ts: params.threadTs } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!data.ok) console.error('[SLACK] chat.postMessage error:', res.status, data.error || 'unknown');
}

function detailsBlock(info: InfoRow, eventId: string): string {
  const city = (info.city || '').replace(/_/g, ' ');
  return [
    `*Cliente:* ${info.client_name || '—'}`,
    ...(city ? [`*Ciudad:* ${city}`] : []),
    ...(info.fecha_es ? [`*Fecha del servicio:* ${info.fecha_es}`] : []),
    `*ID del servicio:* ${eventId}`,
  ].join('\n');
}

/**
 * Notifica a Slack la respuesta de una cleaner a un servicio de la bolsa.
 * Diferencia servicio CANCELADO (último minuto, registrado en last_min_cancellations)
 * de DECLINADO desde la app, y rutea canal/tags/hilo según la matriz acordada.
 *
 * action: 'accept' (acepta en horario original) | 'propose' (pide otro horario)
 * proposedText: solo para 'propose', el horario propuesto ya formateado.
 */
export async function notifyServiceResponse(params: {
  eventId: string;
  action: 'accept' | 'propose';
  cleanerName: string;
  proposedText?: string;
}): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const cancelacion = process.env.SLACK_CANCELACION_CHANNEL_ID;
  const agendados = process.env.SLACK_AGENDADOS_CHANNEL_ID;
  if (!token) {
    console.warn('[SLACK] SLACK_BOT_TOKEN no configurado');
    return;
  }
  try {
    const { rows } = await getPool().query<InfoRow>(
      `SELECT rc.client_name, rc.city,
              "Glide".format_spanish_date(rc.start_teamup_local::timestamptz) AS fecha_es,
              lmc.slack_message_id,
              (lmc.teamup_event_id IS NOT NULL) AS is_last_min
       FROM "Glide".recent_contracts rc
       LEFT JOIN public.last_min_cancellations lmc ON lmc.teamup_event_id = rc.teamup_event_id
       WHERE rc.teamup_event_id = $1
       LIMIT 1`,
      [params.eventId],
    );
    const info = rows[0] ?? ({ is_last_min: false } as InfoRow);
    const name = params.cleanerName;

    if (params.action === 'accept') {
      if (info.is_last_min) {
        // Cancelado + acepta horario original -> hilo del mensaje original, tag Alan+Alexis
        const text = `✅ La cleaner *${name}* tomó este servicio cancelado de último minuto. <@${ALAN}> <@${ALEXIS}>`;
        if (cancelacion) {
          await postSlack({
            token,
            channel: cancelacion,
            text: info.slack_message_id ? text : `${text}\n${detailsBlock(info, params.eventId)}`,
            threadTs: info.slack_message_id,
          });
        }
      } else {
        // Declinado + acepta horario original -> #servicios-agendados-desde-la-app, sin tag
        if (agendados) {
          await postSlack({
            token,
            channel: agendados,
            text:
              `✅ La cleaner *${name}* aceptó este servicio agendado desde la app.\n` +
              detailsBlock(info, params.eventId),
          });
        } else {
          console.warn('[SLACK] SLACK_AGENDADOS_CHANNEL_ID no configurado');
        }
      }
      return;
    }

    // action === 'propose' (cambio de horario)
    const tags = proposeTags();
    const linea = `🕐 La cleaner *${name}* puede tomar este servicio, pero necesita otro horario: podría llegar *${params.proposedText || ''}*. ${tags}`;
    if (!cancelacion) {
      console.warn('[SLACK] SLACK_CANCELACION_CHANNEL_ID no configurado');
      return;
    }
    if (info.is_last_min) {
      // Cancelado -> hilo del mensaje original
      await postSlack({
        token,
        channel: cancelacion,
        text: info.slack_message_id ? linea : `${linea}\n${detailsBlock(info, params.eventId)}`,
        threadTs: info.slack_message_id,
      });
    } else {
      // Declinado -> #cancelacion-de-ultimo-minuto suelto (no hay hilo original), con datos
      await postSlack({
        token,
        channel: cancelacion,
        text: `${linea}\n${detailsBlock(info, params.eventId)}`,
      });
    }
  } catch (err) {
    console.error('[SLACK] notifyServiceResponse error:', err);
  }
}
