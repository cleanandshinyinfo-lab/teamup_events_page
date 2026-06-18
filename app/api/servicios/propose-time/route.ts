import { NextRequest, NextResponse } from 'next/server';
import { getBrowseCleanerByToken } from '@/lib/db';
import { replyInCancellationThread, CANCELACION_TAG } from '@/lib/cancelThread';

export async function POST(req: NextRequest) {
  try {
    const { token, teamup_event_id, proposed_time } = (await req.json()) as {
      token?: string;
      teamup_event_id?: string;
      proposed_time?: string;
    };

    const proposedTime = (proposed_time || '').trim();
    if (!token || !teamup_event_id || !proposedTime) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }
    if (proposedTime.length > 100) {
      return NextResponse.json({ error: 'El horario propuesto es demasiado largo' }, { status: 400 });
    }

    const cleaner = await getBrowseCleanerByToken(token);
    if (!cleaner) {
      return NextResponse.json({ error: 'Link no válido o expirado' }, { status: 404 });
    }

    const name = cleaner.cleaner_name || 'Una cleaner';
    await replyInCancellationThread(
      String(teamup_event_id),
      `🕐 La cleaner *${name}* puede tomar este servicio cancelado, pero necesita otro horario: podría llegar a las *${proposedTime}*. ${CANCELACION_TAG}`,
    );

    return NextResponse.json({
      ok: true,
      message: 'Hemos enviado tu propuesta de horario al equipo. ¡Gracias!',
    });
  } catch (error) {
    console.error('[SERVICIOS_PROPOSE_TIME] error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
