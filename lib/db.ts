import { Pool } from 'pg';
import { Event, Invitation } from './types';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('Missing DATABASE_URL');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

/**
 * Fetches a single event by its Teamup ID from Glide.recent_contracts
 */
export async function getEventById(eventId: string): Promise<Event | null> {
  try {
    const result = await getPool().query(
      `SELECT
        rc.teamup_event_id,
        rc.client_name,
        rc.address,
        rc.city,
        rc.start_dt,
        rc.end_date,
        to_char(rc.start_teamup_local, 'YYYY-MM-DD HH24:MI:SS') AS start_teamup_local,
        to_char(rc.end_teamup_local,   'YYYY-MM-DD HH24:MI:SS') AS end_teamup_local,
        v.start_date_teamup_es,
        rc.duration_hours,
        rc.cleaning_type,
        rc.frequency,
        rc.requires_vacuum,
        rc.photos_required,
        rc.description_html,
        rc.description,
        cd.notasmascotas AS notas_mascotas
      FROM "Glide"."recent_contracts" rc
      LEFT JOIN "Glide"."v_contracts_assigned_active" v
        ON rc.teamup_event_id = v.teamup_event_id
      LEFT JOIN "Glide"."clientdb" cd
        ON lower(trim(cd.nombredelcliente)) = lower(trim(rc.client_name))
      WHERE rc.teamup_event_id = $1
      LIMIT 1`,
      [eventId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as Event;
  } catch (error) {
    console.error('Database error:', error);
    return null;
  }
}

/**
 * Fetches an invitation by its token
 */
export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  try {
    const result = await getPool().query(
      `SELECT id, token, teamup_event_id, cleaner_name, cleaner_subcalendar_id,
              cleaner_genero, status, sent_at, responded_at, assign_result
       FROM public.cleaner_invitations
       WHERE token = $1
       LIMIT 1`,
      [token]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0] as Invitation;
  } catch (error) {
    console.error('DB getInvitationByToken error:', error);
    return null;
  }
}

/**
 * Snapshot of an invitation's state for initial render (avoids client-side flash)
 */
export interface InvitationSnapshot {
  status: 'pending' | 'accepted' | 'declined';
  serviceTaken: boolean;
}

export async function getInvitationSnapshot(token: string): Promise<InvitationSnapshot | null> {
  try {
    const result = await getPool().query(
      `SELECT
         me.status,
         CASE
           WHEN me.status <> 'pending' THEN false
           ELSE EXISTS (
             SELECT 1 FROM "Glide".recent_contracts rc
             WHERE rc.teamup_event_id = me.teamup_event_id
               AND rc.assigned = true
               AND rc.cancelled_at IS NULL
               AND rc.is_active = true
           )
         END AS service_taken
       FROM public.cleaner_invitations me
       WHERE me.token = $1
       LIMIT 1`,
      [token]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return { status: row.status, serviceTaken: row.service_taken };
  } catch (error) {
    console.error('DB getInvitationSnapshot error:', error);
    return null;
  }
}

/**
 * Updates the invitation status after cleaner responds
 */
export async function respondToInvitation(
  token: string,
  status: 'accepted' | 'declined',
  assignResult?: Record<string, unknown>
): Promise<void> {
  await getPool().query(
    `UPDATE public.cleaner_invitations
     SET status = $1, responded_at = NOW(), assign_result = $2
     WHERE token = $3`,
    [status, assignResult ? JSON.stringify(assignResult) : null, token]
  );
}

/**
 * Guarda la hora propuesta por el cleaner (acepta el servicio pero en otro
 * horario). No cambia el status: la invitación sigue 'pending' y el equipo
 * coordina a partir del mensaje en #servicio-al-cliente.
 */
export async function recordProposedTime(token: string, proposedTime: string): Promise<void> {
  await getPool().query(
    `UPDATE public.cleaner_invitations
     SET proposed_time = $1, proposed_time_at = NOW()
     WHERE token = $2`,
    [proposedTime, token]
  );
}

// ===== Fase C: página de servicios disponibles de la ciudad =====

export interface BrowseCleaner {
  subcalendar_id: string;
  /** Nombre real para mostrar */
  cleaner_name: string | null;
  /** Nombre con plantilla (lleva el 🖲 si tiene aspiradora) — es el que el RPC usa para el filtro de aspiradora */
  cleaner_name_template: string | null;
  ciudad: string | null;
  estado: string | null;
  hombre_o_mujer: string | null;
}

/**
 * Resuelve el token estable del link de broadcast al cleaner. Lee ciudad/estado/
 * género desde "Glide".cleaners (siempre fresco). El token es uuid: se compara
 * como texto para no reventar si llega un valor con formato inválido.
 */
export async function getBrowseCleanerByToken(token: string): Promise<BrowseCleaner | null> {
  try {
    const result = await getPool().query(
      `SELECT
         bl.cleaner_subcalendar_id AS subcalendar_id,
         COALESCE(c.cleaner, bl.cleaner_name) AS cleaner_name,
         c.cleaner_name_template,
         c.ciudad,
         c.estado,
         c.hombre_o_mujer
       FROM public.cleaner_browse_links bl
       LEFT JOIN "Glide".cleaners c
         ON c.subcalendar_unique_id = bl.cleaner_subcalendar_id
       WHERE bl.token::text = $1
       LIMIT 1`,
      [token],
    );
    return (result.rows[0] as BrowseCleaner) ?? null;
  } catch (error) {
    console.error('DB getBrowseCleanerByToken error:', error);
    return null;
  }
}

export interface AvailableService {
  teamup_event_id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  hours: number | string | null;
  required_cleaners: number | null;
  cleaning_type: string | null;
  frequency: string | null;
  service_date_text: string | null;
  service_time_text: string | null;
  service_date: string | null;
  vacuum_required: boolean | null;
  /** TRUE si tiene el tag cancelado_desde_la_app (cancelado/declinado desde la app) */
  cancelado_app?: boolean;
  /** TRUE si está registrado como cancelación de último minuto (tabla last_min_cancellations) */
  last_min?: boolean;
  /** ts del mensaje de Zapier en #cancelacion-de-ultimo-minuto (para responder en el hilo) */
  slack_message_id?: string | null;
  /** TRUE si el servicio es para hoy..hoy+2 (los declinados solo se muestran dentro de esta ventana) */
  en_ventana_2d?: boolean;
  /** TRUE si la hora de inicio del servicio ya pasó (en la zona horaria real de la ciudad) */
  ya_paso?: boolean;
}

/**
 * Lista los servicios disponibles de la ciudad del cleaner usando el RPC
 * get_city_contracts_with_distance_v4 (que ya filtra ciudad + sin conflicto +
 * género + aspiradora, y NO filtra por disponibilidad — justo lo de Fase 2.0).
 * Le pasamos cleaner_name_template para que el filtro de aspiradora (🖲) funcione.
 */
export async function getAvailableServicesForCleaner(
  cleaner: BrowseCleaner,
): Promise<AvailableService[]> {
  try {
    const result = await getPool().query(
      `SELECT public.get_city_contracts_with_distance_v4($1, $2, $3, $4, $5) AS data`,
      [
        cleaner.ciudad,
        cleaner.subcalendar_id,
        cleaner.cleaner_name_template ?? cleaner.cleaner_name,
        cleaner.estado,
        cleaner.hombre_o_mujer,
      ],
    );
    const data = result.rows[0]?.data as { contracts?: AvailableService[] } | null;
    const contracts = data?.contracts ?? [];
    // Mostrar: cancelados de último minuto (hasta asignar/caducar) y declinados desde la
    // app SOLO si la fecha es ≤ 2 días. (Los demás filtros — ciudad, género, aspiradora,
    // conflicto, Confirmado+Sin asignar — los aplica el RPC.)
    const visibles = contracts.filter(
      (c) =>
        c.ya_paso !== true &&
        (c.last_min === true || (c.cancelado_app === true && c.en_ventana_2d === true)),
    );
    // Orden: primero los de último minuto, luego los declinados; cada grupo por fecha.
    return visibles.sort((a, b) => {
      const rank = (c: AvailableService) => (c.last_min ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return String(a.service_date || '').localeCompare(String(b.service_date || ''));
    });
  } catch (error) {
    console.error('DB getAvailableServicesForCleaner error:', error);
    return [];
  }
}

/**
 * El cleaner solicita (se autoasigna) un servicio. source='servicios_page'
 * (≠ 'invite') hace que el outbox-worker agregue el tag 'solicitado_por_cleaner'.
 */
export async function requestServiceForCleaner(
  cleaner: BrowseCleaner,
  eventId: string,
): Promise<Record<string, unknown>> {
  const result = await getPool().query(
    `SELECT * FROM public.assign_contract_to_cleaner_v2($1, $2, $3, $4) LIMIT 1`,
    [eventId, cleaner.subcalendar_id, cleaner.hombre_o_mujer, 'servicios_page'],
  );
  return result.rows[0] ?? {};
}
