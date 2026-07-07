import { getPool } from './db';

// IDs de Slack a etiquetar
const ALAN = 'U097VJN0WRH';
const ALEXIS = 'U0614UUFAH4';
const EUGENIA = 'U0BAVN4D52R';
// Tags para las aceptaciones (Esc.1/2.1/2.2): entre semana solo Alexis; finde Alan+Alexis (sin cambios).
function teamTags(): string {
  return isWeekendNow() ? `<@${ALAN}> <@${ALEXIS}>` : `<@${ALEXIS}>`;
}

interface InfoRow {
  client_name: string | null;
  city: string | null;
  fecha_es: string | null;
  fecha_original_es: string | null;
  slack_message_id: string | null;
  is_last_min: boolean;
  /** TRUE si el servicio fue movido (fecha u hora) respecto a cuando se marcó último minuto.
   *  Con original_start guardado: comparación exacta. Sin él (registros viejos): se trata como Esc.1. */
  date_changed: boolean;
  /** Días entre la fecha original y la nueva (solo relevante si date_changed). */
  days_diff: number | null;
  // Campos para el mensaje de declinados (§13)
  frequency: string | null;
  duration_hours: number | string | null;
  required_cleaners: number | null;
  solo_mujer: boolean;
}

export interface ServiceResponseResult {
  /** ¿Toca avisar al cliente (QUO + correo)? Solo Esc.1 y Esc.2.1. */
  notifyClient: boolean;
  /** ¿Toca mandar el recordatorio de WhatsApp a la cleaner? Todo accept (no propose). */
  sendReminder: boolean;
  /** Texto del recordatorio: 'cancelado' (último minuto) o 'declinado'. */
  reminderKind: 'cancelado' | 'declinado';
}

// Fin de semana según el día en que se solicita (hora de Toronto).
function isWeekendNow(): boolean {
  const wd = new Date().toLocaleDateString('en-US', { timeZone: 'America/Toronto', weekday: 'short' });
  return wd === 'Sat' || wd === 'Sun';
}

// Etiquetas para una solicitud de cambio de horario: entre semana solo Alexis, finde Eugenia.
function proposeTags(): string {
  return isWeekendNow() ? `<@${EUGENIA}>` : `<@${ALEXIS}>`;
}

function fmtDuration(v: number | string | null): string {
  if (v == null) return '—';
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (Number.isNaN(n)) return String(v);
  const clean = Number.isInteger(n) ? String(n) : String(n).replace(/\.0+$/, '');
  return `${clean} h`;
}

function generoText(soloMujer: boolean): string {
  return soloMujer ? 'solo mujer' : 'hombre o mujer';
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
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!data.ok) console.error('[SLACK] chat.postMessage error:', res.status, data.error || 'unknown');
}

// Bloque "Pasos" común a los escenarios 1 y 2.1 (sí se avisó al cliente).
const PASOS_CON_CLIENTE =
  '*Pasos realizados por la automatización:* Se ajustó el TeamUp, se mandó la ficha técnica de la cleaner ' +
  'por correo al cliente y se le mandó un Quo avisándole, se mandó un recordatorio a la cleaner\n\n' +
  '*Pasos pendientes:* Ajustar el CRM (Glide)';

// Bloque "Pasos" del escenario 2.2 (no se avisó al cliente).
const PASOS_SIN_CLIENTE =
  '*Pasos realizados por la automatización:* Se ajustó el TeamUp, se mandó un recordatorio a la cleaner\n\n' +
  '*Pasos pendientes:* Ajustar el CRM (Glide)';

/**
 * Notifica a Slack la respuesta de una cleaner a un servicio de la bolsa y decide qué
 * comunicaciones se disparan. Distingue 4 escenarios de los cancelados de último minuto
 * (registrados en last_min_cancellations) y el flujo aparte de los declinados.
 *
 *  - Esc.1  : acepta en el horario original                -> hilo en #cancelacion + avisa cliente
 *  - Esc.2.1: acepta, fecha movida 0-1 día en TeamUp       -> hilo en #cancelacion + avisa cliente
 *  - Esc.2.2: acepta, fecha movida 2+ días en TeamUp       -> hilo en #cancelacion + NO avisa cliente
 *  - Esc.3  : propone otro horario                         -> hilo en #cancelacion + tags, NO avisa cliente
 *  - Declinado: acepta un servicio declinado (no último minuto) -> #agendados, NO avisa cliente
 *
 * En todos los accept se manda recordatorio de WhatsApp a la cleaner (no en propose).
 */
export async function notifyServiceResponse(params: {
  eventId: string;
  action: 'accept' | 'propose';
  cleanerName: string;
  proposedText?: string;
}): Promise<ServiceResponseResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const cancelacion = process.env.SLACK_CANCELACION_CHANNEL_ID;
  const agendados = process.env.SLACK_AGENDADOS_CHANNEL_ID;

  const result: ServiceResponseResult = {
    notifyClient: false,
    sendReminder: params.action === 'accept',
    reminderKind: 'cancelado',
  };

  try {
    const { rows } = await getPool().query<InfoRow>(
      `SELECT rc.client_name, rc.city,
              "Glide".format_spanish_date(rc.start_teamup_local::timestamptz) AS fecha_es,
              "Glide".format_spanish_date(lmc.original_start::timestamptz) AS fecha_original_es,
              lmc.slack_message_id,
              (lmc.teamup_event_id IS NOT NULL) AS is_last_min,
              CASE
                WHEN lmc.teamup_event_id IS NULL OR lmc.original_start IS NULL THEN false
                ELSE rc.start_teamup_local IS DISTINCT FROM lmc.original_start
              END AS date_changed,
              CASE
                WHEN lmc.original_start IS NULL THEN 0
                ELSE (rc.start_teamup_local::date - lmc.original_start::date)
              END AS days_diff,
              rc.frequency, rc.duration_hours, rc.required_cleaners,
              ('solo_mujer' = ANY(COALESCE(rc.service_management, '{}'::text[]))) AS solo_mujer
       FROM "Glide".recent_contracts rc
       LEFT JOIN public.last_min_cancellations lmc ON lmc.teamup_event_id = rc.teamup_event_id
       WHERE rc.teamup_event_id = $1
       LIMIT 1`,
      [params.eventId],
    );
    const info =
      rows[0] ??
      ({ is_last_min: false, date_changed: false, days_diff: 0, solo_mujer: false } as InfoRow);
    const name = params.cleanerName;
    const eventId = params.eventId;

    // Recordatorio WhatsApp: 'cancelado' para último minuto, 'declinado' para el resto.
    result.reminderKind = info.is_last_min ? 'cancelado' : 'declinado';

    // ---------- PROPUESTA DE HORARIO (Escenario 3) ----------
    if (params.action === 'propose') {
      result.sendReminder = false; // no se agenda nada todavía
      if (!token) {
        console.warn('[SLACK] SLACK_BOT_TOKEN no configurado');
        return result;
      }
      if (!cancelacion) {
        console.warn('[SLACK] SLACK_CANCELACION_CHANNEL_ID no configurado');
        return result;
      }
      const sufijo = info.is_last_min ? ' cancelado de último minuto' : '';
      const text =
        `*ESCENARIO #3 → Cleaner solicitó un cambio de fecha u hora*\n\n` +
        `La cleaner *${name}* solicitó un cambio de fecha u hora para aceptar el servicio de ` +
        `*${info.client_name || '—'}*${sufijo} ✅\n\n` +
        `*La fecha y hora del servicio según TeamUp es:* ${info.fecha_es || '—'}\n\n` +
        `*La fecha y hora solicitada es:* ${params.proposedText || '—'}\n\n` +
        `---\n\n` +
        `❗️👉 *No se mandó ninguna comunicación ni al cleaner ni al cliente ya que las solicitudes de ` +
        `cambio de fecha deben ser gestionadas manualmente para evitar confundir al cliente* ${proposeTags()}\n` +
        `> Valida qué horario le conviene mejor al cliente y ajusta el TeamUp y Glide en consecuencia.`;
      await postSlack({
        token,
        channel: cancelacion,
        text,
        threadTs: info.is_last_min ? info.slack_message_id : null,
      });
      return result;
    }

    // ---------- ACEPTA (Escenarios 1 / 2.1 / 2.2 / declinado) ----------
    if (!token) {
      console.warn('[SLACK] SLACK_BOT_TOKEN no configurado');
      // notifyClient se calcula igual abajo para no bloquear el correo/QUO por falta de Slack.
    }

    // Declinado (no es último minuto): flujo aparte -> #agendados, nunca avisa al cliente.
    if (!info.is_last_min) {
      result.notifyClient = false;
      const text =
        `Nuevo servicio aceptado desde la bolsa de servicios cancelados - declinados ✅\n` +
        `---\n` +
        `Cleaner: ${name}\n` +
        `Cliente: ${info.client_name || '—'}\n` +
        `Ciudad: ${(info.city || '—').replace(/_/g, ' ')}\n` +
        `Fecha del servicio: ${info.fecha_es || '—'}\n` +
        `Frecuencia: ${info.frequency || '—'}\n` +
        `Duración: ${fmtDuration(info.duration_hours)}\n` +
        `Cleaners requeridos: ${info.required_cleaners ?? '—'}\n` +
        `El cliente acepta que el cleaner sea: ${generoText(info.solo_mujer)}\n` +
        `ID del servicio: ${eventId}`;
      if (token && agendados) {
        await postSlack({ token, channel: agendados, text });
      } else if (!agendados) {
        console.warn('[SLACK] SLACK_AGENDADOS_CHANNEL_ID no configurado');
      }
      return result;
    }

    // Último minuto: clasificar Esc.1 / 2.1 / 2.2.
    // days_diff con signo: si el servicio se movió a una fecha ANTERIOR (más próximo), dd<0
    // cae en 2.1 (sí se avisa al cliente); solo 2+ días MÁS TARDE (dd>=2) entra en 2.2.
    const dd = Number(info.days_diff ?? 0);
    const esc1 = !info.date_changed;
    const esc21 = info.date_changed && dd <= 1;
    const esc22 = info.date_changed && dd >= 2;

    // Solo Esc.1 y Esc.2.1 avisan al cliente.
    result.notifyClient = esc1 || esc21;

    if (esc1) {
      const text =
        `*ESCENARIO #1 → Cleaner aceptó el servicio en el horario original (${info.fecha_es || '—'})*\n\n` +
        `La cleaner *${name}* tomó el servicio de *${info.client_name || '—'}* cancelado de último minuto ✅\n\n` +
        `*La fecha y hora del servicio según TeamUp es:* ${info.fecha_es || '—'}\n\n` +
        `---\n\n` +
        PASOS_CON_CLIENTE +
        `\n\n${teamTags()}`;
      if (token && cancelacion) {
        await postSlack({ token, channel: cancelacion, text, threadTs: info.slack_message_id });
      } else if (!cancelacion) {
        console.warn('[SLACK] SLACK_CANCELACION_CHANNEL_ID no configurado');
      }
      return result;
    }

    // Esc.2.1 / 2.2: en el hilo de la cancelación si hay slack_message_id (re-cancelaciones
    // actualizan el ts al mensaje más reciente); suelto solo si no quedó registrado.
    const encabezado =
      `*ESCENARIO #${esc22 ? '2.2' : '2.1'} → Cleaner aceptó el servicio en el nuevo horario "original"*\n` +
      `*Fecha verdaderamente original:* ${info.fecha_original_es || '—'}`;
    const cuerpoComun =
      `La cleaner *${name}* tomó el servicio de *${info.client_name || '—'}* cancelado de último minuto ✅\n\n` +
      `*La fecha y hora del servicio según TeamUp es:* ${info.fecha_es || '—'} ` +
      `(el nuevo horario se ajustó manualmente en TeamUp)`;

    let text: string;
    if (esc22) {
      text =
        `${encabezado}\n\n${cuerpoComun}\n\n---\n\n${PASOS_SIN_CLIENTE}\n\n` +
        `❗️👉 No se mandó la ficha técnica de la cleaner por correo al cliente ni se le mandó un Quo avisándole.\n` +
        `> No es necesario ya que la fecha del servicio es de más de 1 día a futuro y el rappel se mandará ` +
        `automáticamente un día antes del servicio.\n\n${teamTags()}`;
    } else {
      text = `${encabezado}\n\n${cuerpoComun}\n\n---\n\n${PASOS_CON_CLIENTE}\n\n${teamTags()}`;
    }
    if (token && cancelacion) {
      await postSlack({ token, channel: cancelacion, text, threadTs: info.slack_message_id });
    } else if (!cancelacion) {
      console.warn('[SLACK] SLACK_CANCELACION_CHANNEL_ID no configurado');
    }
    return result;
  } catch (err) {
    console.error('[SLACK] notifyServiceResponse error:', err);
    return result;
  }
}
