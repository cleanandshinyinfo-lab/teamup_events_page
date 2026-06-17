-- Fase B: el cleaner puede "aceptar el servicio pero en otro horario".
-- Guarda la hora que propone (texto libre, lo que escribe en el modal) y cuándo
-- la propuso. No cambia el status de la invitación (sigue 'pending'): el equipo
-- de servicio al cliente coordina a partir del mensaje en #servicio-al-cliente.

ALTER TABLE public.cleaner_invitations
  ADD COLUMN IF NOT EXISTS proposed_time    text,
  ADD COLUMN IF NOT EXISTS proposed_time_at timestamptz;
