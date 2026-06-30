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
  /** TRUE si el servicio fue movido (fecha u hora) respecto a cuando se marcó último minuto.
   *  Con original_start guardado: comparación exacta. Sin él (registros viejos): fallback por día. */
  date_changed: boolean;
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
}): Promise<{ notifyClient: boolean }> {
  const token = process.env.SLACK_BOT_TOKEN;
  const cancelacion = process.env.SLACK_CANCELACION_CHANNEL_ID;
  const agendados = process.env.SLACK_AGENDADOS_CHANNEL_ID;
  // Por defecto: aceptar avisa al cliente; proponer otro horario (Esc. 3) no.
  let notifyClient = params.action === 'accept';
  try {
    const { rows } = await getPool().query<InfoRow>(
      `SELECT rc.client_name, rc.city,
              "Glide".format_spanish_date(rc.start_teamup_local::timestamptz) AS fecha_es,
              lmc.slack_message_id,
              (lmc.teamup_event_id IS NOT NULL) AS is_last_min,
              CASE
                WHEN lmc.teamup_event_id IS NULL THEN false
                WHEN lmc.original_start IS NOT NULL
                  THEN rc.start_teamup_local IS DISTINCT FROM lmc.original_start
                ELSE rc.start_teamup_local::date <> (lmc.created_at AT TIME ZONE
                       (CASE lower(rc.city)
                          WHEN 'calgary' THEN 'America/Edmonton'
                          WHEN 'winnipeg' THEN 'America/Winnipeg'
                          ELSE 'America/Toronto' END))::date
              END AS date_changed
       FROM "Glide".recent_contracts rc
       LEFT JOIN public.last_min_cancellations lmc ON lmc.teamup_event_id = rc.teamup_event_id
       WHERE rc.teamup_event_id = $1
       LIMIT 1`,
      [params.eventId],
    );
    const info = rows[0] ?? ({ is_last_min: false, date_changed: false } as InfoRow);
    const name = params.cleanerName;

    // Escenario 2: último minuto pero la fecha/hora se cambió manualmente en TeamUp -> NO se avisa al cliente.
    const escenario2 = params.action === 'accept' && info.is_last_min && info.date_changed;
    if (escenario2) notifyClient = false;

    if (!token) {
      console.warn('[SLACK] SLACK_BOT_TOKEN no configurado');
      return { notifyClient };
    }

    if (params.action === 'accept') {
      if (info.is_last_min && !info.date_changed) {
        // Escenario 1: cancelado de último minuto, tomado en el HORARIO ORIGINAL -> hilo + tag, cliente SÍ
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
        // Escenario 2 (último minuto con fecha modificada en TeamUp) o servicio NO-último-minuto
        // (declinado/agendado desde la app): MISMO mensaje de "agendado desde la app", sin tag.
        // En el Escenario 2, además, se agrega la nota de que no se avisó al cliente.
        const nota = escenario2
          ? '\n\n🚨 No se mandó correo ni mensaje al cliente porque se modificó la fecha del servicio manualmente en TeamUp.'
          : '';
        if (agendados) {
          await postSlack({
            token,
            channel: agendados,
            text:
              `✅ La cleaner *${name}* aceptó este servicio agendado desde la app.\n` +
              detailsBlock(info, params.eventId) +
              nota,
          });
        } else {
          console.warn('[SLACK] SLACK_AGENDADOS_CHANNEL_ID no configurado');
        }
      }
      return { notifyClient };
    }

    // action === 'propose' (cambio de horario)
    const tags = proposeTags();
    const linea = `🕐 La cleaner *${name}* puede tomar este servicio, pero necesita otro horario: podría llegar *${params.proposedText || ''}*. ${tags}`;
    if (!cancelacion) {
      console.warn('[SLACK] SLACK_CANCELACION_CHANNEL_ID no configurado');
      return { notifyClient };
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
  return { notifyClient };
}
