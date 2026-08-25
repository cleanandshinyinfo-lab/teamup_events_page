import { NextRequest, NextResponse } from 'next/server';
import { getAvailableSlots } from '@/lib/scheduleChangeApi';
import { ERROR_HTTP_STATUS } from '@/lib/scheduleChangeTypes';

/**
 * Proxy de POST /schedule-change/availability/slots (US-06). Lo usa
 * ProposeTimeModal al elegir una fecha: el backend devuelve SOLO los inicios
 * sin solapamiento con el calendario del cleaner (buffer de traslado 30/60
 * min ya aplicado), y la UI los ofrece como chips en vez de dejar escribir
 * una hora libre.
 */

// Ver justificación en app/api/cambios/accept/route.ts (code review I3):
// una sola llamada a TeamUp puede tardar hasta 15s (fail-closed, §3.8).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { token, id, date } = (await req.json().catch(() => ({}))) as {
    token?: string;
    id?: string;
    date?: string;
  };

  if (!token || !id || !date) {
    return NextResponse.json(
      { ok: false, error_code: 'INVALID_PAYLOAD', message: 'Parámetros inválidos.' },
      { status: 400 },
    );
  }

  const result = await getAvailableSlots({ token, id, date });
  if (!result.ok) {
    return NextResponse.json(result, { status: ERROR_HTTP_STATUS[result.error_code] || 500 });
  }
  return NextResponse.json(result);
}
