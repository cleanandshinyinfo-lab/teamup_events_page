import { NextRequest, NextResponse } from 'next/server';
import { getCleanerScheduleData } from '@/lib/scheduleChangeApi';
import { ERROR_HTTP_STATUS } from '@/lib/scheduleChangeTypes';

/**
 * Proxy de GET /schedule-change/cleaner. Lo usa el cliente para refrescar la
 * lista (después de una acción, o al reintentar tras un error) sin exponer
 * SCHEDULE_CHANGE_API_SECRET al navegador.
 */

// El GET /cleaner del backend hace un round-trip a TeamUp por cada solicitud
// pendiente, en serie (hasta 15s c/u) — el límite serverless por defecto de
// Vercel (10s) corta antes de que termine. Code review I3. Requiere plan Pro
// (ya en uso).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json(
      { ok: false, error_code: 'INVALID_PAYLOAD', message: 'Falta el token.' },
      { status: 400 },
    );
  }

  const result = await getCleanerScheduleData(token);
  if (!result.ok) {
    return NextResponse.json(result, { status: ERROR_HTTP_STATUS[result.error_code] || 500 });
  }
  return NextResponse.json(result);
}
