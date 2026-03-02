import { NextRequest, NextResponse } from 'next/server';
import { getInvitationByToken, respondToInvitation } from '@/lib/db';
import { Invitation } from '@/lib/types';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSpanishDate(dt: Date): string {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const h12 = dt.getHours() % 12 || 12;
  const period = dt.getHours() >= 12 ? 'pm' : 'am';
  const mins = dt.getMinutes();
  const timeStr = mins === 0 ? `${h12}${period}` : `${h12}:${String(mins).padStart(2, '0')}${period}`;
  const day = days[dt.getDay()];
  return `${day.charAt(0).toUpperCase() + day.slice(1)} ${dt.getDate()} de ${months[dt.getMonth()]} del ${dt.getFullYear()} a las ${timeStr}`;
}

function formatRequiredCleaners(n: number | null): string {
  if (n === 1) return 'Uno 👤';
  if (n === 2) return 'Dos 👥';
  return n ? String(n) : '';
}

async function sendSlackNotification(
  invitation: Invitation,
  assignRow: Record<string, unknown>
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_INVITATIONS;
  if (!webhookUrl) return;

  const db = getPool();

  // Event + client + cleaner data in one query
  const evResult = await db.query(
    `SELECT
       rc.client_name,
       rc.city,
       rc.frequency,
       rc.duration_hours,
       rc.required_cleaners,
       rc.teamup_series_id,
       rc.start_teamup_local,
       COALESCE(v.start_date_teamup_es, '') AS start_date_es,
       cd.elclienteaceptoqueelcleanersea,
       cd.tipodelimpiezafr,
       cl.cuenta_con_auto_o_pase_valido
     FROM "Glide".recent_contracts rc
     LEFT JOIN "Glide".v_contracts_assigned_active v
       ON rc.teamup_event_id = v.teamup_event_id
     LEFT JOIN "Glide".clientdb cd
       ON lower(trim(rc.client_name)) = lower(trim(cd.nombredelcliente))
     LEFT JOIN "Glide".cleaners cl
       ON lower(trim(cl.cleaner)) = lower(trim($2))
     WHERE rc.teamup_event_id = $1
     LIMIT 1`,
    [invitation.teamup_event_id, invitation.cleaner_name]
  );

  const ev = evResult.rows[0];
  if (!ev) return;

  // Next service date for recurring services
  let nextDateEs: string | null = null;
  if (ev.teamup_series_id) {
    const nextResult = await db.query(
      `SELECT start_teamup_local
       FROM "Glide".recent_contracts
       WHERE teamup_series_id = $1
         AND start_teamup_local > $2
         AND is_active = true
       ORDER BY start_teamup_local ASC
       LIMIT 1`,
      [ev.teamup_series_id, ev.start_teamup_local]
    );
    if (nextResult.rows[0]?.start_teamup_local) {
      nextDateEs = formatSpanishDate(new Date(nextResult.rows[0].start_teamup_local));
    }
  }

  const isRecurring = !!ev.teamup_series_id;
  const hasCar = /auto/i.test(ev.cuenta_con_auto_o_pase_valido || '');
  const cleanerLabel = `${invitation.cleaner_name}${hasCar ? ' 🚗' : ''}`;
  const city = (ev.city || '').replace(/_/g, ' ');
  const duration = ev.duration_hours
    ? `${ev.duration_hours} hora${Number(ev.duration_hours) !== 1 ? 's' : ''}`
    : null;
  const startDateEs = ev.start_date_es || (ev.start_teamup_local ? formatSpanishDate(new Date(ev.start_teamup_local)) : '');

  const lines: string[] = [
    `*Nuevo servicio ${isRecurring ? 'recurrente' : 'único'} aceptado desde la app* ✅`,
    ...(isRecurring ? ['👉 _Revisar que todos los contratos dentro del ciclo se hayan asignado correctamente_'] : []),
    '---',
    `*Cleaner:* ${cleanerLabel}`,
    `*Cliente:* ${ev.client_name || ''}`,
    `*Ciudad:* ${city}`,
    `*Fecha del servicio:* ${startDateEs}`,
    ...(nextDateEs ? [`*Fecha del próximo servicio:* ${nextDateEs}`] : []),
    ...(ev.frequency ? [`*Frecuencia:* ${ev.frequency}`] : []),
    ...(duration ? [`*Duración:* ${duration}`] : []),
    ...(ev.required_cleaners ? [`*Cleaners requeridos:* ${formatRequiredCleaners(ev.required_cleaners)}`] : []),
    `*El cliente acepta que el cleaner sea:* ${ev.elclienteaceptoqueelcleanersea || ''}`,
    ...(ev.tipodelimpiezafr ? [`*El cleaner prefiere:* ${ev.tipodelimpiezafr}`] : []),
    `*El cleaner intentó:* Aceptar servicio`,
    `*La respuesta del sistema fue:* ${(assignRow.message as string) || 'Sin respuesta'}`,
    `*ID del servicio:* ${invitation.teamup_event_id}`,
  ];

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: lines.join('\n') }),
  });
}

// ─── Route handlers ───────────────────────────────────────────────────────────

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
      const assignResult = await getPool().query(
        `SELECT * FROM public.assign_contract_to_cleaner_v2($1, $2, $3) LIMIT 1`,
        [invitation.teamup_event_id, invitation.cleaner_subcalendar_id, invitation.cleaner_genero]
      );

      const row = assignResult.rows[0] ?? {};
      await respondToInvitation(token, 'accepted', row);

      // Slack notification (non-blocking)
      sendSlackNotification(invitation, row).catch((err) =>
        console.error('[SLACK] notification error:', err)
      );

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
