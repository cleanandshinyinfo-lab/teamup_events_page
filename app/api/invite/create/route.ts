import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('Missing DATABASE_URL');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }
  return pool;
}

/**
 * POST /api/invite/create
 * Creates a cleaner invitation record before sending the WhatsApp message
 * Called by N8N workflow to register the invitation
 * 
 * Body:
 * {
 *   "teamup_event_id": "2049197273",
 *   "cleaner_name": "Cleaner Demo",
 *   "cleaner_phone": "+1 (438) 802-5862",
 *   "cleaner_subcalendar_id": "sub_123",
 *   "cleaner_genero": "Mujer"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamup_event_id, cleaner_name, cleaner_phone, cleaner_subcalendar_id, cleaner_genero } = body;

    // Validate required fields
    if (!teamup_event_id || !cleaner_name || !cleaner_subcalendar_id) {
      return NextResponse.json(
        { error: 'Missing required fields: teamup_event_id, cleaner_name, cleaner_subcalendar_id' },
        { status: 400 }
      );
    }

    // Generate a unique token for this invitation
    const token = uuidv4();

    // Check if invitation already exists
    const existingResult = await getPool().query(
      `SELECT id FROM public.cleaner_invitations 
       WHERE teamup_event_id = $1 AND cleaner_name = $2 AND status = 'pending'
       LIMIT 1`,
      [teamup_event_id, cleaner_name]
    );

    if (existingResult.rows.length > 0) {
      return NextResponse.json(
        { 
          error: 'Invitation already exists for this cleaner and event',
          token: existingResult.rows[0].token
        },
        { status: 409 }
      );
    }

    // Insert the invitation
    const result = await getPool().query(
      `INSERT INTO public.cleaner_invitations 
       (token, teamup_event_id, cleaner_name, cleaner_phone, cleaner_subcalendar_id, cleaner_genero, status, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
       RETURNING id, token, teamup_event_id, cleaner_name, status, sent_at`,
      [token, teamup_event_id, cleaner_name, cleaner_phone || '', cleaner_subcalendar_id, cleaner_genero || 'Mujer']
    );

    const invitation = result.rows[0];

    return NextResponse.json({
      ok: true,
      invitation: {
        id: invitation.id,
        token: invitation.token,
        teamup_event_id: invitation.teamup_event_id,
        cleaner_name: invitation.cleaner_name,
        status: invitation.status,
        sent_at: invitation.sent_at,
      },
      message: 'Invitation created successfully. Ready to send WhatsApp message.',
    });
  } catch (error) {
    console.error('[INVITE_CREATE] error:', error);
    return NextResponse.json(
      { 
        error: 'Error creating invitation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/invite/create - Health check
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Use POST to create an invitation',
  });
}
