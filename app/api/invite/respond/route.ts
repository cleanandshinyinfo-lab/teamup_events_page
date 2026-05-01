import { NextRequest, NextResponse } from 'next/server';
import {
  getInvitationByToken,
  getInvitationSnapshot,
  getPool,
  respondToInvitation,
} from '@/lib/db';

type RespondAction = 'accept' | 'decline';
type AssignOutcome = 'success' | 'already_assigned' | 'failed';

function classifyAssignResult(row: { ok?: boolean; message?: string | null }): {
  outcome: AssignOutcome;
  message: string;
} {
  const message = row.message ?? '';
  if (row.ok) return { outcome: 'success', message };
  if (message.toLowerCase().includes('asignado')) {
    return { outcome: 'already_assigned', message };
  }
  return { outcome: 'failed', message };
}

async function notifySlack(payload: Record<string, unknown>) {
  const url = process.env.N8N_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_INVITATIONS;
  if (!url) {
    console.warn('[N8N_SLACK] webhook URL no configurada');
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('[N8N_SLACK] webhook HTTP error:', res.status, await res.text());
    }
  } catch (err) {
    console.error('[N8N_SLACK] error:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { token, action } = (await req.json()) as { token?: string; action?: RespondAction };

    if (!token || !action || !['accept', 'decline'].includes(action)) {
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

    if (action === 'decline') {
      await respondToInvitation(token, 'declined');
      return NextResponse.json({
        ok: true,
        status: 'declined',
        message: 'Servicio rechazado. Gracias por avisarnos.',
      });
    }

    // action === 'accept'
    // p_source='invite' → el workflow n8n NO agrega 'solicitado_por_cleaner'
    // (esa etiqueta sólo aplica cuando el cleaner pide el servicio desde la app cleaner).
    const assignResult = await getPool().query(
      `SELECT * FROM public.assign_contract_to_cleaner_v2($1, $2, $3, $4) LIMIT 1`,
      [invitation.teamup_event_id, invitation.cleaner_subcalendar_id, invitation.cleaner_genero, 'invite']
    );
    const row = assignResult.rows[0] ?? {};
    const { outcome, message } = classifyAssignResult(row);

    await respondToInvitation(token, 'accepted', row);

    await notifySlack({
      teamup_event_id: invitation.teamup_event_id,
      cleaner_name: invitation.cleaner_name,
      assign_ok: outcome === 'success',
      assign_message: message,
    });

    return NextResponse.json({
      ok: outcome === 'success',
      status: 'accepted',
      outcome,
      message: message || (outcome === 'success' ? '¡Servicio aceptado!' : 'No se pudo asignar este servicio.'),
    });
  } catch (error) {
    console.error('[INVITE_RESPOND] error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// GET — snapshot del estado actual de la invitación (útil como fallback debug / polling externo)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 });

    const snapshot = await getInvitationSnapshot(token);
    if (!snapshot) return NextResponse.json({ status: 'not_found' }, { status: 404 });

    return NextResponse.json({
      status: snapshot.status,
      service_taken: snapshot.serviceTaken,
    });
  } catch (error) {
    console.error('[INVITE_STATUS] error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
