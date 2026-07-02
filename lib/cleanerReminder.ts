/**
 * Dispara el recordatorio de WhatsApp a la cleaner que acaba de aceptar un servicio.
 * El envío real vive en teamup-webhooks-api (usa Whaticket); aquí solo llamamos su
 * endpoint interno. Best-effort: nunca lanza (no debe romper la respuesta del aceptar).
 *
 * kind: 'cancelado' (último minuto) | 'declinado'.
 */
const DEFAULT_URL = 'https://teamup-webhooks.srv1035704.hstgr.cloud';

export async function sendCleanerReminder(params: {
  eventId: string;
  subcalendarId: string;
  kind: 'cancelado' | 'declinado';
}): Promise<void> {
  try {
    const base = String(process.env.TEAMUP_WEBHOOKS_URL || DEFAULT_URL).replace(/\/+$/, '');
    const secret = process.env.TEAMUP_WEBHOOKS_SECRET;
    if (!secret) {
      console.warn('[CLEANER_REMINDER] TEAMUP_WEBHOOKS_SECRET no configurado');
      return;
    }
    const res = await fetch(`${base}/last-min/cleaner-reminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
      body: JSON.stringify({
        teamup_event_id: params.eventId,
        subcalendar_id: params.subcalendarId,
        kind: params.kind,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!data.ok) {
      console.error('[CLEANER_REMINDER] error:', res.status, data.error || 'unknown');
    }
  } catch (err) {
    console.error('[CLEANER_REMINDER] fetch error:', err);
  }
}
