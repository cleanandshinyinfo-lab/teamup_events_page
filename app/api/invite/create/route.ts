import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/db';

/**
 * POST /api/invite/create
 * Creates a cleaner invitation record before sending the WhatsApp message
 * Called by N8N workflow to register the invitation
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamup_event_id, cleaner_name, cleaner_phone, cleaner_subcalendar_id, cleaner_genero } = body;

    if (!teamup_event_id || !cleaner_name || !cleaner_subcalendar_id) {
      return NextResponse.json(
        { error: 'Missing required fields: teamup_event_id, cleaner_name, cleaner_subcalendar_id' },
        { status: 400 }
      );
    }

    const existing = await getPool().query(
      `SELECT token FROM public.cleaner_invitations
       WHERE teamup_event_id = $1 AND cleaner_name = $2 AND status = 'pending'
       LIMIT 1`,
      [teamup_event_id, cleaner_name]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'Invitation already exists for this cleaner and event', token: existing.rows[0].token },
        { status: 409 }
      );
    }

    const token = randomUUID();
    const result = await getPool().query(
      `INSERT INTO public.cleaner_invitations
       (token, teamup_event_id, cleaner_name, cleaner_phone, cleaner_subcalendar_id, cleaner_genero, status, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
       RETURNING id, token, teamup_event_id, cleaner_name, status, sent_at`,
      [token, teamup_event_id, cleaner_name, cleaner_phone || '', cleaner_subcalendar_id, cleaner_genero || 'Mujer']
    );

    return NextResponse.json({
      ok: true,
      invitation: result.rows[0],
      message: 'Invitation created successfully. Ready to send WhatsApp message.',
    });
  } catch (error) {
    console.error('[INVITE_CREATE] error:', error);
    return NextResponse.json(
      { error: 'Error creating invitation', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Use POST to create an invitation' });
}
