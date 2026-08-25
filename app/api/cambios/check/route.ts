import { NextRequest, NextResponse } from 'next/server';
import { checkAvailability } from '@/lib/scheduleChangeApi';
import { ERROR_HTTP_STATUS } from '@/lib/scheduleChangeTypes';

/**
 * Proxy de POST /schedule-change/availability/check (US-07). Lo usa
 * ProposeTimeModal con debounce mientras el cleaner elige fecha/hora.
 */

// Ver justificación en app/api/cambios/accept/route.ts (code review I3):
// una sola llamada a TeamUp puede tardar hasta 15s (fail-closed, §3.8).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { token, teamup_event_id, start_local, end_local } = (await req.json().catch(() => ({}))) as {
    token?: string;
    teamup_event_id?: string;
    start_local?: string;
    end_local?: string;
  };

  if (!token || !teamup_event_id || !start_local || !end_local) {
    return NextResponse.json(
      { ok: false, error_code: 'INVALID_PAYLOAD', message: 'Parámetros inválidos.' },
      { status: 400 },
    );
  }

  const result = await checkAvailability({ token, teamup_event_id, start_local, end_local });
  if (!result.ok) {
    return NextResponse.json(result, { status: ERROR_HTTP_STATUS[result.error_code] || 500 });
  }
  return NextResponse.json(result);
}
