/**
 * Cliente tipado del backend de /schedule-change (teamup-webhooks-api).
 * SOLO server-side: usa SCHEDULE_CHANGE_API_SECRET, que nunca debe llegar al
 * navegador. Lo importan `app/cambios/page.tsx` (server component, carga
 * inicial) y los route handlers de `app/api/cambios/*` (acciones del
 * cleaner) — nunca un componente 'use client'.
 *
 * El front NO habla con Postgres/TeamUp directamente en esta feature (a
 * diferencia de /servicios): todo pasa por esta API. Ver doc compartido
 * §Arquitectura, sección "El front NO habla con Postgres para esta feature."
 */
import type {
  ApiResult,
  CleanerScheduleData,
  AcceptResult,
  RejectResult,
  ProposeResult,
  AvailabilityCheckResult,
  AvailableSlotsResult,
} from './scheduleChangeTypes';

const DEFAULT_URL = 'https://teamup-webhooks.srv1035704.hstgr.cloud';

// A2 (code review): un solo timeout de 18s para TODAS las llamadas no se
// ajustó al subir `maxDuration` a 60 en las rutas de Next (I3). El accept
// encadena getEvent + N chequeos de conflicto + PUT + 2 barridos de 120
// días contra TeamUp (15s c/u) — el peor caso supera los 18s con holgura,
// aborta el fetch, y el cleaner ve "no se pudo" mientras el backend termina
// de aplicar el cambio. Las mutaciones (accept/reject/propose) usan un
// presupuesto mayor, con margen bajo maxDuration=60; los endpoints de solo
// lectura (data/check) se quedan en el timeout corto original.
const DEFAULT_TIMEOUT_MS = 18000;
const MUTATION_TIMEOUT_MS = 55000;

function baseUrl(): string {
  // Los paths de este cliente ya empiezan con /schedule-change, así que la
  // base debe ser solo el host; si el env viene con el prefijo incluido
  // (p. ej. https://host/schedule-change), se recorta para no duplicarlo.
  return String(process.env.SCHEDULE_CHANGE_API_URL || DEFAULT_URL)
    .replace(/\/+$/, '')
    .replace(/\/schedule-change$/, '');
}

function secret(): string | undefined {
  return process.env.SCHEDULE_CHANGE_API_SECRET;
}

/**
 * Llama a un endpoint de /schedule-change. Nunca lanza por un error de
 * negocio (4xx/5xx con `error_code`): esos vuelven como datos (`ok:false`)
 * para que la UI los muestre y actúe según el código. Solo captura fallas de
 * red/timeout, que tampoco se relanzan — se traducen a un `error_code`
 * sintético (`NETWORK_ERROR`, etc., ver scheduleChangeTypes.ts) para que el
 * caller siempre reciba una forma consistente y nunca tenga que envolver
 * esto en try/catch.
 */
async function call<T>(
  path: string,
  init: { method?: string; body?: Record<string, unknown>; timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const key = secret();
  if (!key) {
    console.error('[scheduleChangeApi] SCHEDULE_CHANGE_API_SECRET no configurado');
    return {
      ok: false,
      error_code: 'CONFIG_MISSING',
      message: 'La conexión con el servidor no está configurada. Contacta a soporte.',
    };
  }
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: init.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': key },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return {
        ok: false,
        error_code: 'BAD_RESPONSE',
        message: 'Respuesta inválida del servidor. Intenta de nuevo.',
      };
    }
    return data as ApiResult<T>;
  } catch (err) {
    console.error('[scheduleChangeApi] fetch error:', path, err);
    return {
      ok: false,
      error_code: 'NETWORK_ERROR',
      message: 'No se pudo conectar con el servidor. Intenta de nuevo.',
    };
  }
}

/** GET /schedule-change/cleaner?token= — datos de la vista (US-03, US-07). */
export async function getCleanerScheduleData(token: string): Promise<ApiResult<CleanerScheduleData>> {
  return call<CleanerScheduleData>(`/schedule-change/cleaner?token=${encodeURIComponent(token)}`);
}

/**
 * POST /schedule-change/requests/:id/accept (US-04). Encadena getEvent + N
 * chequeos de conflicto + PUT + verificación de serie contra TeamUp — usa el
 * timeout largo (A2 del code review), no el default de lectura.
 */
export async function acceptChangeRequest(id: string, token: string): Promise<ApiResult<AcceptResult>> {
  return call<AcceptResult>(`/schedule-change/requests/${encodeURIComponent(id)}/accept`, {
    method: 'POST',
    body: { token },
    timeoutMs: MUTATION_TIMEOUT_MS,
  });
}

/** POST /schedule-change/requests/:id/reject (US-05). `reason` opcional, ≤500 chars. */
export async function rejectChangeRequest(
  id: string,
  token: string,
  reason?: string,
): Promise<ApiResult<RejectResult>> {
  return call<RejectResult>(`/schedule-change/requests/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: { token, ...(reason ? { reason } : {}) },
    timeoutMs: MUTATION_TIMEOUT_MS,
  });
}

/**
 * POST /schedule-change/requests/:id/propose (US-06). Re-valida disponibilidad
 * contra TeamUp server-side antes de guardar (§3.6) — mismo timeout largo.
 */
export async function proposeChangeRequest(
  id: string,
  params: { token: string; proposed_start_local: string; proposed_end_local?: string; note?: string },
): Promise<ApiResult<ProposeResult>> {
  return call<ProposeResult>(`/schedule-change/requests/${encodeURIComponent(id)}/propose`, {
    method: 'POST',
    body: params,
    timeoutMs: MUTATION_TIMEOUT_MS,
  });
}

/**
 * POST /schedule-change/availability/check — chequeo puntual de un horario
 * exacto (US-07). Ya no lo usa `ProposeTimeModal` (reemplazado por
 * `getAvailableSlots`, que filtra huecos en vez de validar uno a la vez),
 * pero sigue siendo parte del contrato del backend §3.7 — se deja disponible
 * por si otra vista necesita validar un horario puntual.
 */
export async function checkAvailability(params: {
  token: string;
  teamup_event_id: string;
  start_local: string;
  end_local: string;
}): Promise<ApiResult<AvailabilityCheckResult>> {
  return call<AvailabilityCheckResult>('/schedule-change/availability/check', {
    method: 'POST',
    body: params,
  });
}

/**
 * POST /schedule-change/availability/slots — huecos SIN solapamiento para un
 * día completo (ya con el buffer de traslado 30/60min aplicado). Lo usa
 * `ProposeTimeModal` para ofrecer solo horarios elegibles como chips, en vez
 * de dejar escribir una hora libre y validarla después.
 */
export async function getAvailableSlots(params: {
  token: string;
  /** id de la SOLICITUD (no del evento TeamUp): el backend saca de ella la
   *  duración a ofrecer y el evento a excluir del chequeo. */
  id: string;
  date: string;
}): Promise<ApiResult<AvailableSlotsResult>> {
  return call<AvailableSlotsResult>('/schedule-change/availability/slots', {
    method: 'POST',
    body: params,
  });
}
