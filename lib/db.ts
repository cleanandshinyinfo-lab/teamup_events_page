import { Pool } from 'pg';
import { Event } from './types';

let pool: Pool | null = null;

function getPool(): Pool {
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
        v.start_date_teamup_es,
        rc.duration_hours,
        rc.cleaning_type,
        rc.frequency,
        rc.requires_vacuum,
        rc.photos_required,
        rc.description_html,
        rc.description
      FROM "Glide"."recent_contracts" rc
      LEFT JOIN "Glide"."v_contracts_assigned_active" v
        ON rc.teamup_event_id = v.teamup_event_id
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
