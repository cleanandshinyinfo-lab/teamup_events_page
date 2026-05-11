import { NextResponse } from 'next/server';
import { getInvitationSnapshot } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invite/status?token=XXX
 *
 * Endpoint lightweight para que la página haga polling y detecte si el
 * servicio ya fue tomado por otro cleaner mientras estaba abierta.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const snapshot = await getInvitationSnapshot(token);

  return NextResponse.json(
    snapshot ?? { status: 'pending', serviceTaken: false },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
