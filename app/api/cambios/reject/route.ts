import { NextRequest, NextResponse } from 'next/server';
import { rejectChangeRequest } from '@/lib/scheduleChangeApi';
import { ERROR_HTTP_STATUS } from '@/lib/scheduleChangeTypes';

/** Proxy de POST /schedule-change/requests/:id/reject (US-05). */

// Ver justificación en app/api/cambios/accept/route.ts (code review I3).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { id, token, reason } = (await req.json().catch(() => ({}))) as {
    id?: string;
    token?: string;
    reason?: string;
  };

  if (!id || !token) {
    return NextResponse.json(
      { ok: false, error_code: 'INVALID_PAYLOAD', message: 'Parámetros inválidos.' },
      { status: 400 },
    );
  }

  const trimmedReason = reason && reason.trim() ? reason.trim().slice(0, 500) : undefined;
  const result = await rejectChangeRequest(id, token, trimmedReason);
  if (!result.ok) {
    return NextResponse.json(result, { status: ERROR_HTTP_STATUS[result.error_code] || 500 });
  }
  return NextResponse.json(result);
}
