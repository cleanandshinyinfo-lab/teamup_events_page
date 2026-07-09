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
  // ?debug=1 -> no manda nada, solo reporta los destinos de prueba configurados
  // (enmascarados) para verificar que RAPPEL_TEST_EMAIL/PHONE estén bien.
  if (req.nextUrl.searchParams.get('debug') === '1') {
    const maskEmail = (e: string) => {
      const [u, d] = e.split('@');
      if (!d) return e ? `${e.slice(0, 2)}***` : '(vacío)';
      return `${u.slice(0, 2)}***@${d}`;
    };
    const maskPhone = (p: string) => (p ? `${p.slice(0, 3)}***${p.slice(-3)}` : '(vacío)');
    const email = String(process.env.RAPPEL_TEST_EMAIL || '');
    const phone = String(process.env.RAPPEL_TEST_PHONE || '');
    return NextResponse.json({
      rappel_test_email: email ? maskEmail(email) : '(no seteado)',
      rappel_test_email_len: email.length,
      rappel_test_phone: phone ? maskPhone(phone) : '(no seteado)',
      rappel_test_mode: process.env.RAPPEL_TEST_MODE ?? '(default=prueba)',
    });
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
