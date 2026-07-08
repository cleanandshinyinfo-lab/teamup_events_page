import type { AvailableService, BrowseCleaner } from './db';

const MAX_DURATION_MINUTES = 90;
const DEFAULT_BUCKET_TIMEZONE = 'America/Toronto';
const DEFAULT_RPC_NAME = 'get_bolsa_contracts';

export type DayBucket = 'manana' | 'pasado_manana';
const BUCKET_ORDER: Record<DayBucket, number> = { manana: 0, pasado_manana: 1 };

export interface BolsaDistanceItem extends AvailableService {
  duration_minutes?: number | null;
  distance?: number | null;
  has_car?: boolean;
}

export function isDistanceApiConfigured(): boolean {
  return !!process.env.SERVICES_BY_DISTANCE_API_URL;
}

function ymdInTimeZone(when: Date, timezone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when);
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function computeDayBucket(serviceDateLocal: string, now: Date, timezone: string): DayBucket | null {
  const today = ymdInTimeZone(now, timezone);
  const serviceDay = serviceDateLocal.slice(0, 10);
  if (serviceDay === addDaysToYmd(today, 1)) return 'manana';
  if (serviceDay === addDaysToYmd(today, 2)) return 'pasado_manana';
  return null;
}

export function selectBolsaServices(
  raw: BolsaDistanceItem[],
  now: Date,
  timezone: string,
): AvailableService[] {
  const withBucket: Array<{ item: BolsaDistanceItem; bucket: DayBucket }> = [];
  for (const s of raw) {
    if (typeof s.duration_minutes !== 'number' || s.duration_minutes > MAX_DURATION_MINUTES) continue;
    if (!s.service_date) continue;
    const bucket = computeDayBucket(s.service_date, now, timezone);
    if (!bucket) continue;
    withBucket.push({ item: s, bucket });
  }
  withBucket.sort((a, b) => {
    if (BUCKET_ORDER[a.bucket] !== BUCKET_ORDER[b.bucket]) {
      return BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
    }
    return (a.item.duration_minutes ?? Infinity) - (b.item.duration_minutes ?? Infinity);
  });
  return withBucket.map((x) => x.item);
}

export async function fetchBolsaServicesWithDistance(
  cleaner: BrowseCleaner,
): Promise<BolsaDistanceItem[]> {
  const base = process.env.SERVICES_BY_DISTANCE_API_URL;
  if (!base) throw new Error('distance_api_not_configured');
  if (!cleaner.direccion) throw new Error('cleaner_address_missing');

  const res = await fetch(`${base}/api/v1/services/available-with-distance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cleaner_name: cleaner.cleaner_name_template || cleaner.cleaner_name,
      cleaner_subcalendar_id: cleaner.subcalendar_id,
      cleaner_city: cleaner.ciudad,
      cleaner_address: cleaner.direccion,
      cleaner_status: cleaner.estado,
      cleaner_gender: cleaner.hombre_o_mujer,
      rpc_name: process.env.BOLSA_DISTANCE_RPC_NAME || DEFAULT_RPC_NAME,
    }),
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`distance_api_http_${res.status}: ${body.slice(0, 200)}`);
  }
  const data: unknown = await res.json().catch(() => []);
  return Array.isArray(data) ? (data as BolsaDistanceItem[]) : [];
}

export function bucketTimezone(): string {
  return process.env.BOLSA_BUCKET_TIMEZONE || DEFAULT_BUCKET_TIMEZONE;
}
