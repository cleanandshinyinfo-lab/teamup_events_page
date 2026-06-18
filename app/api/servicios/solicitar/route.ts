import { NextRequest, NextResponse } from 'next/server';
import { getBrowseCleanerByToken, requestServiceForCleaner } from '@/lib/db';
import { replyInCancellationThread, CANCELACION_TAG } from '@/lib/cancelThread';

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
    const { token, teamup_event_id } = (await req.json()) as {
      token?: string;
      teamup_event_id?: string;
    };

    if (!token || !teamup_event_id) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const cleaner = await getBrowseCleanerByToken(token);
    if (!cleaner) {
      return NextResponse.json({ error: 'Link no válido o expirado' }, { status: 404 });
    }

    const row = await requestServiceForCleaner(cleaner, String(teamup_event_id));
    const { outcome, message } = classifyAssignResult(row);

    if (outcome === 'success') {
      const name = cleaner.cleaner_name || 'Una cleaner';
      await replyInCancellationThread(
        String(teamup_event_id),
        `✅ La cleaner *${name}* tomó este servicio cancelado (vía la página de servicios). ${CANCELACION_TAG}`,
      );
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
