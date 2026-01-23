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
