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

const SHORT_DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseLocalTimestamp(raw: string | null): { year: number; month: number; day: number; h: number; m: number } | null {
  if (!raw) return null;
  const match = String(raw).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    year:  Number(match[1]),
    month: Number(match[2]),
    day:   Number(match[3]),
    h:     Number(match[4]),
    m:     Number(match[5]),
  };
}

function to12h(h: number, m: number): string {
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}

/**
 * Formats start + end timestamps as "Fri Mar 13 2026, 8:30am - 12:30pm"
 * without any timezone conversion
 */
export function formatLocalDateTimeRange(start: string | null, end: string | null): string {
  const s = parseLocalTimestamp(start);
  if (!s) return 'No especificado';
  const d = new Date(Date.UTC(s.year, s.month - 1, s.day));
  const datePart = `${SHORT_DAYS[d.getUTCDay()]} ${SHORT_MONTHS[s.month - 1]} ${s.day} ${s.year}`;
  const startTime = to12h(s.h, s.m);
  const e = parseLocalTimestamp(end);
  const endTime = e ? to12h(e.h, e.m) : null;
  return endTime ? `${datePart}, ${startTime} - ${endTime}` : `${datePart}, ${startTime}`;
}

/** @deprecated use formatLocalDateTimeRange */
export function formatLocalDateTime(raw: string | null): string {
  return formatLocalDateTimeRange(raw, null);
}

/** @deprecated use formatLocalDateTimeRange */
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
