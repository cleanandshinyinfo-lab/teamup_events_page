import { NextRequest, NextResponse } from 'next/server';
import { getInvitationByToken, respondToInvitation } from '@/lib/db';
import { Pool } from 'pg';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }
  return pool;
}

export async function POST(req: NextRequest) {
  try {
    const { token, action } = await req.json();

    if (!token || !['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const invitation = await getInvitationByToken(token);
    if (!invitation) {
      return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: 'Ya respondiste esta invitación', status: invitation.status },
        { status: 409 }
      );
    }

    if (action === 'accept') {
      // Llamar assign_contract_to_cleaner_v2
      const assignResult = await getPool().query(
        `SELECT * FROM public.assign_contract_to_cleaner_v2($1, $2, $3) LIMIT 1`,
        [invitation.teamup_event_id, invitation.cleaner_subcalendar_id, invitation.cleaner_genero]
      );

      const row = assignResult.rows[0] ?? {};
      await respondToInvitation(token, 'accepted', row);

      return NextResponse.json({
        ok: true,
        status: 'accepted',
        message: row.message || '¡Servicio aceptado!',
        assign_ok: row.ok ?? false,
      });
    }

    // action === 'decline'
    await respondToInvitation(token, 'declined');
    return NextResponse.json({
      ok: true,
      status: 'declined',
      message: 'Servicio rechazado. Gracias por avisarnos.',
    });
  } catch (error) {
    console.error('[INVITE_RESPOND] error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// GET — consulta el status actual de una invitación por token (para re-render)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 });

    const invitation = await getInvitationByToken(token);
    if (!invitation) return NextResponse.json({ status: 'not_found' }, { status: 404 });

    return NextResponse.json({ status: invitation.status, responded_at: invitation.responded_at });
  } catch (error) {
    console.error('[INVITE_STATUS] error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
