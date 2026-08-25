import { NextRequest, NextResponse } from 'next/server';
import { acceptChangeRequest } from '@/lib/scheduleChangeApi';
import { ERROR_HTTP_STATUS } from '@/lib/scheduleChangeTypes';

/** Proxy de POST /schedule-change/requests/:id/accept (US-04). */

// El accept encadena getEvent + chequeo de conflicto + PUT + verificación de
// serie contra TeamUp — puede superar el límite serverless por defecto de
// Vercel (10-15s) y cortarse con el cambio YA aplicado en TeamUp. Code
// review I3. Requiere plan Pro (ya en uso).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { id, token } = (await req.json().catch(() => ({}))) as { id?: string; token?: string };

  if (!id || !token) {
    return NextResponse.json(
      { ok: false, error_code: 'INVALID_PAYLOAD', message: 'Parámetros inválidos.' },
      { status: 400 },
    );
  }

  const result = await acceptChangeRequest(id, token);
  if (!result.ok) {
    return NextResponse.json(result, { status: ERROR_HTTP_STATUS[result.error_code] || 500 });
  }
  return NextResponse.json(result);
}
