import { createClient } from '@supabase/supabase-js';
import { Event } from './types';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/**
 * Supabase client configured for read-only access
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false },
  }
);

/**
 * Fetches a single event by its Teamup ID
 * @param eventId - The teamup_event_id to lookup
 * @returns The event data or null if not found
 */
export async function getEventById(eventId: string): Promise<Event | null> {
  try {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('teamup_event_id', eventId)
      .single();

    if (error) {
      console.error('Supabase error:', error.message);
      return null;
    }

    return data as Event;
  } catch (error) {
    console.error('Error fetching event:', error);
    return null;
  }
}
