import { NextRequest, NextResponse } from 'next/server';
import { getBrowseCleanerByToken } from '@/lib/db';
import { notifyServiceResponse } from '@/lib/cancelThread';
import { BOLSA_DISPONIBLE } from '@/lib/flags';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Fechas permitidas: hoy, mañana, pasado mañana (en hora de Toronto), como YYYY-MM-DD.
function allowedDates(): string[] {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }); // YYYY-MM-DD
  const base = new Date(`${today}T12:00:00Z`);
  return [0, 1, 2].map((d) => {
    const x = new Date(base);
    x.setUTCDate(x.getUTCDate() + d);
    return x.toISOString().slice(0, 10);
  });
}

function formatProposed(dateStr: string, timeStr: string): string | null {
  const dm = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const day = parseInt(dm[3], 10);
  const month = MESES[parseInt(dm[2], 10) - 1];
  const h24 = parseInt(tm[1], 10);
  const min = tm[2];
  const h12 = h24 % 12 || 12;
  const period = h24 >= 12 ? 'p. m.' : 'a. m.';
  return `el ${day} de ${month} a las ${h12}:${min} ${period}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!BOLSA_DISPONIBLE) {
      return NextResponse.json(
        { error: 'La bolsa de servicios está en pausa por el momento.' },
        { status: 503 },
      );
    }
    const { token, teamup_event_id, proposed_date, proposed_time } = (await req.json()) as {
      token?: string;
      teamup_event_id?: string;
      proposed_date?: string;
      proposed_time?: string;
    };

    if (!token || !teamup_event_id || !proposed_date || !proposed_time) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    // Validar fecha: solo hoy / mañana / pasado mañana
    if (!allowedDates().includes(proposed_date)) {
      return NextResponse.json(
        { error: 'La fecha debe ser hoy, mañana o pasado mañana.' },
        { status: 400 },
      );
    }
    // Validar hora: hasta las 5pm
    const tm = proposed_time.match(/^(\d{1,2}):(\d{2})$/);
    if (!tm) {
      return NextResponse.json({ error: 'Hora inválida.' }, { status: 400 });
    }
    const h24 = parseInt(tm[1], 10);
    const min = parseInt(tm[2], 10);
    if (h24 > 17 || (h24 === 17 && min > 0) || h24 < 5) {
      return NextResponse.json({ error: 'La hora debe ser hasta las 5:00 p. m.' }, { status: 400 });
    }

    const proposedText = formatProposed(proposed_date, proposed_time);
    if (!proposedText) {
      return NextResponse.json({ error: 'Fecha/hora inválida.' }, { status: 400 });
    }

    const cleaner = await getBrowseCleanerByToken(token);
    if (!cleaner) {
      return NextResponse.json({ error: 'Link no válido o expirado' }, { status: 404 });
    }

    await notifyServiceResponse({
      eventId: String(teamup_event_id),
      action: 'propose',
      cleanerName: cleaner.cleaner_name || 'Una cleaner',
      proposedText,
    });

    return NextResponse.json({
      ok: true,
      message: 'Hemos enviado tu propuesta de horario al equipo. ¡Gracias!',
    });
  } catch (error) {
    console.error('[SERVICIOS_PROPOSE_TIME] error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
