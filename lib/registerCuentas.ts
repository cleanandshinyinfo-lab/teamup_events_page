// Registra el servicio aceptado en la tabla "cuentas" de Glide, llamando al
// endpoint interno de service-reminders (que reutiliza su misma lógica de mapeo +
// upsert por teamup_event_id). Necesario porque cuando el rappel sale en el acto
// al aceptar (Escenario 2), el cron de las 9am excluye ese servicio por el candado
// service_reminders_sent y nunca lo registraría en cuentas.
//
// Cualquier fallo se loguea pero NO bloquea la aceptación. Si no están configuradas
// las envs (URL/secret) hace no-op silencioso. Devuelve true solo si el registro/
// actualización realmente se aplicó, para que el mensaje de Slack reporte la verdad.
export async function registerCuentas(eventId: string): Promise<boolean> {
  const baseUrl = process.env.SERVICE_REMINDERS_URL;
  const secret = process.env.SERVICE_REMINDERS_SECRET;
  if (!baseUrl || !secret) {
    console.warn('[REGISTER_CUENTAS] SERVICE_REMINDERS_URL/SECRET no configuradas, no-op.');
    return false;
  }
  try {
    const url =
      `${baseUrl.replace(/\/$/, '')}/register-cuentas` +
      `?secret=${encodeURIComponent(secret)}&event=${encodeURIComponent(eventId)}`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      console.error('[REGISTER_CUENTAS] HTTP error:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[REGISTER_CUENTAS] error (no bloquea la aceptación):', err);
    return false;
  }
}
