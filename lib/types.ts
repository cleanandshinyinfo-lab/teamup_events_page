/**
 * Event interface representing a cleaning event from Supabase
 * Schema: Glide, Table: contracts
 */
export interface Event {
  /** Unique event ID from Teamup (used as URL parameter) */
  teamup_event_id: string;
  /** Client name (may include emojis and location markers) */
  client_name: string | null;
  /** Full address including city, province, and postal code */
  address: string | null;
  /** City identifier: quebec, calgary, montreal, winnipeg, ottawa_gatineau */
  city: string | null;
  /** Event start date and time with timezone */
  start_dt: string | null;
  /** Event end date and time with timezone */
  end_date: string | null;
  /** Duration in hours as string (e.g., "3") */
  duration_hours: string | null;
  /** Type of cleaning service */
  cleaning_type: string | null;
  /** Cleaning frequency (e.g., "cada 4 semanas") */
  frequency: string | null;
  /** Whether vacuum is required: "si" | "no" */
  requires_vacuum: string | null;
  /** Photo requirements: "antes_y_despues" etc. */
  photos_required: string | null;
  /** HTML formatted instructions (IMPORTANT: must be sanitized) */
  description_html: string | null;
  /** Plain text description (backup) */
  description: string | null;
}
