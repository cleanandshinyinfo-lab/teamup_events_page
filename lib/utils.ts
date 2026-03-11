import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names with Tailwind merge support
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date string for Spanish locale display
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return 'No especificado';

  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return dateString;
  }
}

/**
 * Formats a raw DB timestamp ("2026-03-16 08:00:00") to "lunes 16 de marzo de 2026 - 08:00"
 * without any timezone conversion
 */
export function formatLocalDateTime(raw: string | null): string {
  if (!raw) return 'No especificado';
  const match = String(raw).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2})/);
  if (!match) return raw;
  const [, year, month, day, time] = match;
  const days   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return `${days[d.getUTCDay()]} ${Number(day)} de ${months[Number(month) - 1]} de ${year} - ${time}`;
}

/**
 * Extracts "HH:MM" from a raw DB timestamp string
 */
export function extractLocalTime(raw: string | null): string | null {
  if (!raw) return null;
  const match = String(raw).match(/[T ](\d{2}:\d{2})/);
  return match ? match[1] : null;
}

/**
 * Formats duration hours for display
 */
export function formatDuration(hours: string | null): string {
  if (!hours) return 'No especificado';
  const h = parseFloat(hours);
  if (isNaN(h)) return hours;
  return h === 1 ? '1 hora' : `${h} horas`;
}

/**
 * Maps city codes to display names
 */
export function getCityDisplayName(city: string | null): string {
  const cityMap: Record<string, string> = {
    quebec: 'Quebec',
    calgary: 'Calgary',
    montreal: 'Montreal',
    winnipeg: 'Winnipeg',
    ottawa_gatineau: 'Ottawa-Gatineau',
  };
  return city ? cityMap[city.toLowerCase()] || city : 'No especificado';
}

/**
 * Returns province badge for city
 */
export function getCityBadge(city: string | null): string {
  const badges: Record<string, string> = {
    quebec: 'QC',
    calgary: 'AB',
    montreal: 'QC',
    winnipeg: 'MB',
    ottawa_gatineau: 'ON',
  };
  return city ? badges[city.toLowerCase()] || '' : '';
}

/**
 * Formats vacuum requirement for display
 */
export function formatVacuumRequired(value: string | null): string {
  if (!value) return 'No especificado';
  const lower = value.toLowerCase();
  if (lower === 'si' || lower === 'sí' || lower === 'yes') return 'Requerida';
  if (lower === 'no') return 'No requerida';
  return value;
}

/**
 * Formats photo requirements for display
 */
export function formatPhotosRequired(value: string | null): string {
  if (!value) return 'No especificado';
  const photoMap: Record<string, string> = {
    'antes_y_despues': 'Antes y después',
    'antes': 'Solo antes',
    'despues': 'Solo después',
    'no': 'No requeridas',
  };
  return photoMap[value.toLowerCase()] || value;
}
