import { NextRequest, NextResponse } from 'next/server';
import { sendRappel } from '@/lib/rappel';

export const dynamic = 'force-dynamic';

// ENDPOINT TEMPORAL — solo para validar el rappel (§8) en Escenario 2 sin aceptar
// un servicio de verdad. Dispara sendRappel(event) manualmente. Doble seguro:
//   1) exige ?secret= igual a RAPPEL_TEST_SECRET (si no está seteado -> 403).
//   2) se niega a correr si RAPPEL_TEST_MODE === 'false' (nunca manda a cliente real).
// Quitar este archivo después de validar.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') || '';
  const event = req.nextUrl.searchParams.get('event') || '';

  const expected = process.env.RAPPEL_TEST_SECRET || '';
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.RAPPEL_TEST_MODE === 'false') {
    return NextResponse.json(
      { error: 'RAPPEL_TEST_MODE=false: endpoint deshabilitado por seguridad' },
      { status: 403 },
    );
  }
  if (!event) {
    return NextResponse.json({ error: 'falta ?event=<teamup_event_id>' }, { status: 400 });
  }

  await sendRappel(event);
  return NextResponse.json({
    ok: true,
    event,
    note: 'sendRappel disparado en modo prueba; revisa RAPPEL_TEST_PHONE/EMAIL y los logs [RAPPEL].',
  });
}
