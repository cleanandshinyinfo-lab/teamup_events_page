import { NextRequest, NextResponse } from 'next/server';
import { proposeChangeRequest } from '@/lib/scheduleChangeApi';
import { ERROR_HTTP_STATUS } from '@/lib/scheduleChangeTypes';

/** Proxy de POST /schedule-change/requests/:id/propose (US-06). */

// Ver justificación en app/api/cambios/accept/route.ts (code review I3):
// propose re-valida disponibilidad contra TeamUp server-side antes de guardar.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    token?: string;
    proposed_start_local?: string;
    proposed_end_local?: string;
    note?: string;
  };
  const { id, token, proposed_start_local, proposed_end_local, note } = body;

  if (!id || !token || !proposed_start_local) {
    return NextResponse.json(
      { ok: false, error_code: 'INVALID_PAYLOAD', message: 'Parámetros inválidos.' },
      { status: 400 },
    );
  }

  const trimmedNote = note && note.trim() ? note.trim().slice(0, 500) : undefined;
  const result = await proposeChangeRequest(id, {
    token,
    proposed_start_local,
    ...(proposed_end_local ? { proposed_end_local } : {}),
    ...(trimmedNote ? { note: trimmedNote } : {}),
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: ERROR_HTTP_STATUS[result.error_code] || 500 });
  }
  return NextResponse.json(result);
}
