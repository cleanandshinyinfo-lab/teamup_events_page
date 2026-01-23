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
        teamup_event_id,
        client_name,
        address,
        city,
        start_dt,
        end_date,
        duration_hours,
        cleaning_type,
        frequency,
        requires_vacuum,
        photos_required,
        description_html,
        description
      FROM "Glide"."recent_contracts"
      WHERE teamup_event_id = $1
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
