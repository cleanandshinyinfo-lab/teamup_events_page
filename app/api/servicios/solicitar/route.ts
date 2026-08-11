import { NextRequest, NextResponse } from 'next/server';
import { getBrowseCleanerByToken, requestServiceForCleaner } from '@/lib/db';
import { notifyServiceResponse } from '@/lib/cancelThread';
import { notifyClientReplacement } from '@/lib/clientNotify';
import { sendCleanerReminder } from '@/lib/cleanerReminder';
import { sendRappel, type RappelOutcome } from '@/lib/rappel';
import { registerCuentas } from '@/lib/registerCuentas';
import { BOLSA_DISPONIBLE } from '@/lib/flags';

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

export async function POST(req: NextRequest) {
  try {
    if (!BOLSA_DISPONIBLE) {
      return NextResponse.json(
        { error: 'La bolsa de servicios está en pausa por el momento.' },
        { status: 503 },
      );
    }
    const { token, teamup_event_id, source } = (await req.json()) as {
      token?: string;
      teamup_event_id?: string;
      source?: string;
    };

    if (!token || !teamup_event_id) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const cleaner = await getBrowseCleanerByToken(token);
    if (!cleaner) {
      return NextResponse.json({ error: 'Link no válido o expirado' }, { status: 404 });
    }

    // Whitelist: solo 'bolsa' (bolsa de servicios) marca distinto; cualquier otra
    // cosa cae al default histórico 'servicios_page' (vista de cancelaciones).
    const assignSource = source === 'bolsa' ? 'bolsa' : 'servicios_page';
    const row = await requestServiceForCleaner(cleaner, String(teamup_event_id), assignSource);
    const { outcome, message } = classifyAssignResult(row);

    if (outcome === 'success') {
      // Rappel + cuentas ANTES del aviso a Slack, para que el bloque "Pasos" del hilo
      // reporte lo que realmente pasó (y no un texto fijo).
      //  - 'sent' (rappel al vuelo): el cron de 9am excluirá este servicio por el candado
      //    service_reminders_sent, así que hay que registrarlo en cuentas aquí.
      //  - 'already_sent' (el rappel salió antes, p. ej. con la cleaner que canceló): la
      //    fila de cuentas ya existe con la cleaner vieja; el upsert por teamup_event_id
      //    la actualiza con la/las cleaners actuales y sus salarios.
      //  - 'not_due': el cron enviará y registrará a su hora; aquí no se toca cuentas.
      let rappelOutcome: RappelOutcome = 'error';
      let cuentasOk = false;
      try {
        rappelOutcome = await sendRappel(String(teamup_event_id));
        if (rappelOutcome === 'sent' || rappelOutcome === 'already_sent') {
          cuentasOk = await registerCuentas(String(teamup_event_id));
        }
      } catch (rappelError) {
        console.error('[SERVICIOS_SOLICITAR] error en sendRappel/registerCuentas (no bloquea la respuesta):', rappelError);
      }
      // Aviso a Slack (rutea según escenario: Esc.1 / 2.1 / 2.2 / declinado) y nos dice
      // qué comunicaciones tocan: avisar al cliente y/o recordatorio de WhatsApp a la cleaner.
      const { notifyClient, sendReminder, reminderKind } = await notifyServiceResponse({
        eventId: String(teamup_event_id),
        action: 'accept',
        cleanerName: cleaner.cleaner_name || 'Una cleaner',
        rappelOutcome,
        cuentasOk,
      });
      // Aviso a la clienta por QUO + correo (va un cleaner de reemplazo), respetando sus
      // canales activos. Solo Esc.1 y Esc.2.1 (NO Esc.2.2 ni declinados, ni servicios de
      // 2 cleaners donde solo canceló una y la otra sigue asignada).
      if (notifyClient) {
        await notifyClientReplacement(String(teamup_event_id));
      }
      // Recordatorio de WhatsApp a la cleaner que aceptó (Esc.1/2.1/2.2 y declinados).
      if (sendReminder && cleaner.subcalendar_id) {
        await sendCleanerReminder({
          eventId: String(teamup_event_id),
          subcalendarId: cleaner.subcalendar_id,
          kind: reminderKind,
        });
      }
    }

    return NextResponse.json({
      ok: outcome === 'success',
      outcome,
      message:
        message ||
        (outcome === 'success'
          ? '¡Servicio solicitado!'
          : 'No se pudo solicitar este servicio.'),
    });
  } catch (error) {
    console.error('[SERVICIOS_SOLICITAR] error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
