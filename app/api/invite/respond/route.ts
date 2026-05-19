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

interface SlackEnrichRow {
  client_name: string | null;
  city: string | null;
  frequency: string | null;
  duration_hours: string | number | null;
  required_cleaners: number | null;
  teamup_series_id: string | null;
  start_date_es: string | null;
  elclienteaceptoqueelcleanersea: string | null;
  tipodelimpiezafr: string | null;
  cuenta_con_auto_o_pase_valido: string | null;
}

interface SlackPayload {
  teamup_event_id: string;
  cleaner_name: string;
  assign_ok: boolean;
  assign_message: string;
  outcome: AssignOutcome;
}

function formatRequired(n: number | null): string {
  if (n === 1) return 'Uno 👤';
  if (n === 2) return 'Dos 👥';
  return n ? String(n) : '';
}

function buildSlackText(payload: SlackPayload, db: SlackEnrichRow): string {
  const cleanerName = payload.cleaner_name || '';
  const hasCar = /auto/i.test(db.cuenta_con_auto_o_pase_valido || '');
  const cleanerLabel = `${cleanerName}${hasCar ? ' 🚗' : ''}`;
  const city = (db.city || '').replace(/_/g, ' ');
  const isRecurring = !!db.teamup_series_id;
  const assignMessage = payload.assign_message || 'Sin respuesta';
  const duration = db.duration_hours
    ? `${db.duration_hours} hora${Number(db.duration_hours) !== 1 ? 's' : ''}`
    : null;

  // Header varía según el outcome real de la asignación:
  // - success: servicio aceptado de verdad
  // - already_assigned: el cleaner pidió tomarlo pero ya estaba tomado por otra persona
  // - failed: otra falla (capacidad llena, conflicto de buffer, etc.)
  let header: string;
  if (payload.outcome === 'success') {
    header = `*Nuevo servicio ${isRecurring ? 'recurrente' : 'único'} aceptado desde la web (vercel)* ✅`;
  } else if (payload.outcome === 'already_assigned') {
    header = `*El servicio solicitado no se pudo aceptar porque ya no está disponible* ⚠️`;
  } else {
    header = `*Falló la asignación de un servicio desde la web (vercel)* ❌`;
  }

  const lines = [
    header,
    ...(payload.outcome === 'success' && isRecurring
      ? ['👉 _Revisar que todos los contratos dentro del ciclo se hayan asignado correctamente_']
      : []),
    '---',
    `*Cleaner:* ${cleanerLabel}`,
    `*Cliente:* ${db.client_name || ''}`,
    `*Ciudad:* ${city}`,
    `*Fecha del servicio:* ${db.start_date_es || ''}`,
    ...(db.frequency ? [`*Frecuencia:* ${db.frequency}`] : []),
    ...(duration ? [`*Duración:* ${duration}`] : []),
    ...(db.required_cleaners ? [`*Cleaners requeridos:* ${formatRequired(db.required_cleaners)}`] : []),
    `*El cliente acepta que el cleaner sea:* ${db.elclienteaceptoqueelcleanersea || ''}`,
    ...(db.tipodelimpiezafr ? [`*El cleaner prefiere:* ${db.tipodelimpiezafr}`] : []),
    `*El cleaner intentó:* Aceptar servicio`,
    `*La respuesta del sistema fue:* ${assignMessage}`,
    `*ID del servicio:* ${payload.teamup_event_id}`,
  ];
  return lines.join('\n');
}

async function notifySlack(payload: SlackPayload) {
  const url = process.env.SLACK_WEBHOOK_INVITATIONS;
  if (!url) {
    console.warn('[SLACK_INVITATIONS] webhook URL no configurada');
    return;
  }
  try {
    const enrich = await getPool().query<SlackEnrichRow>(
      `
      SELECT
        rc.client_name,
        rc.city,
        rc.frequency,
        rc.duration_hours,
        rc.required_cleaners,
        rc.teamup_series_id,
        "Glide".format_spanish_date(rc.start_teamup_local::timestamptz) AS start_date_es,
        cd.elclienteaceptoqueelcleanersea,
        cd.tipodelimpiezafr,
        cl.cuenta_con_auto_o_pase_valido
      FROM "Glide".recent_contracts rc
      LEFT JOIN "Glide".clientdb cd
        ON lower(trim(rc.client_name)) = lower(trim(cd.nombredelcliente))
      LEFT JOIN "Glide".cleaners cl
        ON lower(trim(cl.cleaner)) = lower(trim($2))
      WHERE rc.teamup_event_id = $1
      LIMIT 1
      `,
      [payload.teamup_event_id, payload.cleaner_name],
    );
    const db = enrich.rows[0] ?? ({} as SlackEnrichRow);
    const text = buildSlackText(payload, db);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error('[SLACK_INVITATIONS] webhook HTTP error:', res.status, await res.text());
    }
  } catch (err) {
    console.error('[SLACK_INVITATIONS] error:', err);
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

    // Validación defensiva: el evento puede haber sido borrado/movido en TeamUp
    // entre la creación de la invitación y el click de aceptar. Si la BD lo
    // tiene como cancelled_by='sync_confirmed_mirror' o is_active=false,
    // significa que TeamUp lo eliminó. No tiene sentido intentar asignar.
    const stateCheck = await getPool().query(
      `SELECT is_active, cancelled_by
       FROM "Glide".recent_contracts
       WHERE teamup_event_id = $1
       LIMIT 1`,
      [invitation.teamup_event_id]
    );
    const evState = stateCheck.rows[0];
    if (!evState || evState.is_active === false || evState.cancelled_by === 'sync_confirmed_mirror') {
      await respondToInvitation(token, 'declined');
      return NextResponse.json(
        {
          ok: false,
          status: 'event_deleted',
          outcome: 'failed',
          message: 'Este servicio ya no está disponible (fue eliminado o modificado en el calendario). Por favor contacta al equipo.',
        },
        { status: 410 } // 410 Gone
      );
    }

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
      outcome,
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
