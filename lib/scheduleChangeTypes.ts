/**
 * Tipos del contrato de `/schedule-change` (teamup-webhooks-api).
 * Fuente de verdad: .claude-team/cambio-horario-servicio.md §3 (Arquitectura).
 * Si el contrato cambia de forma, actualizar aquí Y el doc compartido.
 */

export type ScheduleChangeStatus =
  | 'pendiente'
  | 'aceptando'
  | 'aceptada'
  | 'rechazada'
  | 'propuesta_alternativa'
  | 'error_teamup'
  | 'cancelada';

/** Códigos de error del catálogo §3.1 del contrato. */
export type ScheduleChangeErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_REQUESTED_DATETIME'
  | 'SERVICE_NOT_FOUND'
  | 'SERVICE_NOT_ELIGIBLE'
  | 'CLEANER_NOT_ASSIGNED'
  | 'PENDING_REQUEST_EXISTS'
  | 'INVALID_TOKEN'
  | 'TOKEN_REVOKED'
  | 'CLEANER_INACTIVE'
  | 'REQUEST_NOT_FOUND'
  | 'NOT_YOUR_REQUEST'
  | 'REQUEST_ALREADY_RESOLVED'
  | 'CONFLICT_DETECTED'
  | 'AVAILABILITY_CHECK_UNAVAILABLE'
  | 'SERVICE_CHANGED_SINCE_REQUEST'
  | 'TEAMUP_WRITE_FAILED'
  | 'SERIES_INTEGRITY_FAILED'
  | 'FEATURE_DISABLED'
  | 'unauthorized'
  /** Rate limiting por token/IP (I7 del code review, `src/lib/rateLimit.js`).
   *  Viene con header `Retry-After` en la respuesta del backend. */
  | 'RATE_LIMITED'
  // Extensiones defensivas del front — el backend nunca las manda, se generan
  // aquí cuando la llamada ni siquiera obtiene una respuesta interpretable
  // (ver lib/scheduleChangeApi.ts).
  | 'CONFIG_MISSING'
  | 'BAD_RESPONSE'
  | 'NETWORK_ERROR';

/** Mapeo error_code -> status HTTP, para que los route handlers de Next lo repliquen. */
export const ERROR_HTTP_STATUS: Record<string, number> = {
  INVALID_PAYLOAD: 400,
  INVALID_REQUESTED_DATETIME: 400,
  SERVICE_NOT_FOUND: 404,
  SERVICE_NOT_ELIGIBLE: 409,
  CLEANER_NOT_ASSIGNED: 409,
  PENDING_REQUEST_EXISTS: 409,
  INVALID_TOKEN: 404,
  TOKEN_REVOKED: 403,
  CLEANER_INACTIVE: 403,
  REQUEST_NOT_FOUND: 404,
  NOT_YOUR_REQUEST: 403,
  REQUEST_ALREADY_RESOLVED: 409,
  CONFLICT_DETECTED: 409,
  AVAILABILITY_CHECK_UNAVAILABLE: 503,
  SERVICE_CHANGED_SINCE_REQUEST: 409,
  TEAMUP_WRITE_FAILED: 502,
  SERIES_INTEGRITY_FAILED: 500,
  FEATURE_DISABLED: 503,
  unauthorized: 401,
  RATE_LIMITED: 429,
  CONFIG_MISSING: 500,
  BAD_RESPONSE: 502,
  NETWORK_ERROR: 502,
};

/**
 * A2 (code review): códigos que significan "no sabemos si la mutación se
 * aplicó" (timeout/red entre el proxy de Next y el backend, o una respuesta
 * que no se pudo interpretar) — nunca "no se pudo": el caller debe refrescar
 * el estado real en vez de afirmar un fallo que quizás no ocurrió.
 */
export function isAmbiguousMutationError(errorCode: string): boolean {
  return errorCode === 'NETWORK_ERROR' || errorCode === 'BAD_RESPONSE';
}

export interface ScheduleChangeApiError {
  ok: false;
  error_code: ScheduleChangeErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}

export function isApiError<T>(r: T | ScheduleChangeApiError): r is ScheduleChangeApiError {
  return (r as ScheduleChangeApiError)?.ok === false;
}

export interface ConflictEvent {
  teamup_event_id: string;
  title: string;
  start_local: string;
  end_local: string;
  all_day: boolean;
  kind: 'absence' | 'service';
}

export interface ConflictInfo {
  has_conflict: boolean;
  buffer_minutes: number;
  checked_at: string;
  events: ConflictEvent[];
  /**
   * Campos defensivos (no en el JSON de ejemplo original del contrato §3.3):
   * cubren el fix de I4 del code review — cuando el chequeo contra TeamUp
   * falla, el backend NO debe sintetizar `has_conflict:true` con `events:[]`
   * (eso hace que la UI le mienta al cleaner). El fix está en curso del lado
   * de Backend y el shape final aún no quedó anotado en el doc, así que el
   * front reconoce cualquiera de estas formas para marcar "no se pudo
   * verificar" en vez de "hay conflicto": `source:'unavailable'`,
   * `check_failed:true`, o `conflict_reason:'CHECK_UNAVAILABLE'`.
   */
  source?: string;
  check_failed?: boolean;
  conflict_reason?: string;
}

export interface CleanerInfo {
  subcalendar_id: string;
  name: string | null;
  city: string | null;
  estado: string | null;
  has_car: boolean;
  buffer_minutes: number;
}

export interface PendingChangeRequest {
  id: string;
  status: 'pendiente';
  teamup_event_id: string;
  client_name: string | null;
  service_address: string | null;
  current_start_local: string;
  current_end_local: string | null;
  current_datetime_text: string | null;
  requested_start_local: string;
  requested_end_local: string;
  requested_datetime_text: string | null;
  client_note: string | null;
  created_at: string;
  conflict: ConflictInfo | null;
  can_accept: boolean;
  block_reason: string | null;
}

export interface ResolvedChangeRequest {
  id: string;
  status: Exclude<ScheduleChangeStatus, 'pendiente' | 'aceptando'>;
  teamup_event_id: string;
  client_name: string | null;
  current_start_local: string | null;
  current_datetime_text: string | null;
  requested_start_local: string | null;
  requested_datetime_text: string | null;
  /** Solo cuando status === 'propuesta_alternativa'. */
  proposed_start_local?: string;
  proposed_datetime_text?: string | null;
  decided_at: string | null;
  decision_note: string | null;
  read_only: true;
}

/**
 * La vista del cleaner es SOLO de solicitudes de cambio de horario (pedido
 * del usuario 2026-08-24): `upcoming_services` salió del contrato de
 * GET /schedule-change/cleaner. Ambas listas ya vienen filtradas por el
 * backend: una solicitud desaparece cuando todas sus horas de servicio
 * (actual, solicitada y propuesta) ya pasaron.
 */
export interface CleanerScheduleData {
  ok: true;
  cleaner: CleanerInfo;
  pending_requests: PendingChangeRequest[];
  resolved_requests: ResolvedChangeRequest[];
}

export interface AcceptResult {
  ok: true;
  status: 'aceptada';
  teamup: {
    event_id_before: string;
    event_id_after: string;
    detached_from_series: boolean;
    series_occurrences_before: number;
    series_occurrences_after: number;
    series_preserved: boolean;
    applied_at: string;
  };
  client_notified: boolean;
  message: string;
}

export interface RejectResult {
  ok: true;
  status: 'rechazada';
  client_notified: boolean;
  message: string;
}

export interface ProposeResult {
  ok: true;
  status: 'propuesta_alternativa';
  client_notified: boolean;
}

export interface AvailabilityCheckResult {
  ok: true;
  has_conflict: boolean;
  buffer_minutes: number;
  checked_at: string;
  source: string;
  events: ConflictEvent[];
}

/** Un hueco libre de un día, ya con el buffer de traslado aplicado por el backend. */
export interface AvailableSlot {
  start_local: string;
  end_local: string;
}

export interface SlotsWindow {
  start: string;
  end: string;
  step_minutes: number;
}

/**
 * POST /schedule-change/availability/slots — reemplaza el chequeo debounced
 * de hora libre en ProposeTimeModal: en vez de que el cleaner escriba una
 * hora y se le diga si choca, el backend ya filtra y devuelve SOLO los
 * huecos sin solapamiento para el día elegido (considera los buffers 30/60
 * min). `slots:[]` si el día no tiene huecos; `all_day_absence:true` si es
 * un día de ausencia del cleaner. Fail-closed: si TeamUp no responde, el
 * backend devuelve 503 `AVAILABILITY_CHECK_UNAVAILABLE` (no `slots:[]`, para
 * no confundir "sin huecos" con "no pudimos verificar").
 */
export interface AvailableSlotsResult {
  ok: true;
  date: string;
  duration_minutes: number;
  buffer_minutes: number;
  window: SlotsWindow;
  slots: AvailableSlot[];
  all_day_absence?: boolean;
}

export type ApiResult<T> = T | ScheduleChangeApiError;
