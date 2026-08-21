export interface Invitation {
  id: string;
  token: string;
  teamup_event_id: string;
  cleaner_name: string;
  cleaner_subcalendar_id: string;
  cleaner_genero: string | null;
  status: 'pending' | 'accepted' | 'declined';
  sent_at: string;
  responded_at: string | null;
  assign_result: Record<string, unknown> | null;
}

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
  /** Local start datetime from recent_contracts */
  start_teamup_local: string | null;
  /** Local end datetime from recent_contracts */
  end_teamup_local: string | null;
  /** Pre-formatted Spanish date from v_contracts_assigned_active */
  start_date_teamup_es: string | null;
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
  /** Pet notes from Glide (column u8M9e) */
  notas_mascotas: string | null;
  // Datos de acceso leídos de la ficha del cliente (Glide.clientdb), no del
  // evento. El evento es una foto del día en que se creó: si el cliente
  // respondió después, o cambió el código de la puerta, solo la ficha está al
  // día. Se muestran únicamente si no aparecen ya en description_html.
  /** Cómo entrar a la propiedad (llaves, códigos, timbre) */
  instrucciones_entrar: string | null;
  /** Cómo llegar o encontrar la propiedad */
  instrucciones_llegar: string | null;
  /** Indicaciones de parqueadero */
  hay_parqueadero: string | null;
  /** Número de apartamento / unidad */
  num_apartamento: string | null;
}
