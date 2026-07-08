import { getPool } from './db';

// OpenPhone phoneNumberId desde el cual sale el SMS, por ciudad (igual que los rappels).
export const OPENPHONE_NUMBER_ID_BY_CITY: Record<string, string> = {
  montreal: 'PNXJQdJZps',
  quebec: 'PNXJQdJZps',
  ottawa_gatineau: 'PNXJQdJZps',
  calgary: 'PNFqUz9LL1',
  winnipeg: 'PNFqUz9LL1',
};
export const OPENPHONE_DEFAULT_NUMBER_ID = 'PNXJQdJZps';
const CITY_DEFAULT_LANG: Record<string, 'en' | 'fr'> = {
  montreal: 'fr',
  quebec: 'fr',
  ottawa_gatineau: 'fr',
  calgary: 'en',
  winnipeg: 'en',
};

export type Lang = 'en' | 'fr';

export function detectLang(idioma: string | null, city: string | null): Lang {
  const raw = String(idioma || '').trim().toLowerCase();
  if (/fran|french|fr/.test(raw)) return 'fr';
  if (/ingl|english|en/.test(raw)) return 'en';
  if (/espan|spanish|es/.test(raw)) return 'en';
  return CITY_DEFAULT_LANG[String(city || '')] || 'en';
}

export function normalizePhone(raw: string): string {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

export function pickPhones(t1: string | null, t2: string | null): string[] {
  const out: string[] = [];
  for (const raw of [t1, t2]) {
    const p = normalizePhone(String(raw || '').trim());
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

export function collectEmails(c1: string | null, c2: string | null): string[] {
  return [c1, c2].map((e) => String(e || '').trim()).filter(Boolean);
}

// Limpia "3. Activo > Nombre 🚗" -> "Nombre"
function cleanCleanerName(raw: string | null): string {
  let s = String(raw || '');
  const gt = s.lastIndexOf('>');
  if (gt >= 0) s = s.slice(gt + 1);
  return s
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE0F\u200D]/g, '')
    .trim();
}

const QUO_TEXT: Record<Lang, string> = {
  en:
    `Good news, we found a cleaner available for your service and will send her to complete your cleaning as planned. ` +
    `We also sent her profile to your email for reference. ` +
    `If you prefer not to accept this replacement, please let us know.`,
  fr:
    `Bonne nouvelle, nous avons trouvé une nettoyeuse disponible pour votre service et nous l'enverrons pour réaliser votre ménage comme prévu. ` +
    `Nous vous avons également envoyé sa fiche par courriel pour référence. ` +
    `Si vous préférez ne pas accepter ce remplacement, merci de nous en informer.`,
};

interface CleanerProfile {
  name: string | null;
  ficha: string | null;
}

// Líneas de perfil (una por cleaner). §7: "Profil #1 :" (FR) / "Profile #1:" (EN).
// Si el servicio tiene una sola cleaner, se lista un solo perfil.
function profileLinesHtml(cleaners: CleanerProfile[], lang: Lang): string {
  const word = lang === 'fr' ? 'Profil' : 'Profile';
  const sep = lang === 'fr' ? ' :' : ':';
  return cleaners
    .filter((c) => c && c.ficha)
    .map(
      (c, i) =>
        `<strong>${word} #${i + 1}${sep}</strong> ${cleanCleanerName(c.name)} → ` +
        `<a href="${c.ficha}" style="color:#38bdf8;">${c.ficha}</a>`,
    )
    .join('<br />\n                  ');
}

// Correo con el diseño exacto de §7 (header + ficha técnica + bloque traductor + firma + footer).
// El email-proxy manda el HTML tal cual, así que aquí va el documento completo.
function emailHtml(
  clientName: string | null,
  cleaners: CleanerProfile[],
  lang: Lang,
): { subject: string; html: string } {
  const profiles = profileLinesHtml(cleaners, lang);
  const nombre = String(clientName || '').trim();

  const t =
    lang === 'fr'
      ? {
          subject: 'Équipe de remplacement pour votre service - Clean & Shiny 🧼✨',
          saludo: nombre ? `Bonjour ${nombre} 👋,` : 'Bonjour 👋,',
          intro:
            'Vous trouverez ci-dessous les informations de la nouvelle équipe responsable de votre prochain service ✨',
          fichaTitulo: "Fiche technique de l'agent d'entretien :",
          traductor:
            'Tous nos agents ont accès à un traducteur sur leur téléphone. Nous aurons également un ' +
            'superviseur disponible en tout temps, qui parle parfaitement français et anglais, pour vous ' +
            'aider avec quoi que ce soit.',
          destacada: 'Si vous préférez ne pas accepter ce remplacement, merci de nous en informer.',
          firma: 'Cordialement,<br />Alexis – Chef des opérations<br />Clean &amp; Shiny ✨',
        }
      : {
          subject: 'Replacement team for your service - Clean & Shiny 🧼✨',
          saludo: nombre ? `Hello ${nombre} 👋,` : 'Hello 👋,',
          intro:
            'Please find below the information of the new team in charge of your upcoming service ✨',
          fichaTitulo: 'Cleaning agent profile:',
          traductor:
            'All our agents have access to a translator on their phone. We will also have a supervisor ' +
            'available at all times, who speaks both French and English fluently, to assist you with ' +
            'anything you may need.',
          destacada: 'If you prefer not to proceed with this replacement, please let us know.',
          firma: 'Best regards,<br />Alexis – Head of Operations<br />Clean &amp; Shiny ✨',
        };

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
  </head>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.10);">
            <tr>
              <td style="background:#38bdf8;padding:20px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:bold;">Clean &amp; Shiny</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#374151;font-size:15px;line-height:1.7;">
                <p style="margin:0 0 16px 0;">${t.saludo}</p>
                <p style="margin:0 0 16px 0;">${t.intro}</p>
                <p style="margin:24px 0 12px 0;font-size:16px;font-weight:bold;color:#38bdf8;">${t.fichaTitulo}</p>
                <p style="margin:0 0 20px 0;">
                  ${profiles}
                </p>
                <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
                  <tr>
                    <td style="background:#f0fdf4;border-left:4px solid #22c55e;padding:14px 18px;border-radius:0 6px 6px 0;color:#374151;font-size:14px;line-height:1.7;">${t.traductor}</td>
                  </tr>
                </table>
                <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                  <tr>
                    <td style="background:#e0f2fe;border-left:4px solid #38bdf8;padding:14px 18px;border-radius:0 6px 6px 0;color:#374151;font-size:15px;line-height:1.6;"><strong>${t.destacada}</strong></td>
                  </tr>
                </table>
                <p style="margin:0;">${t.firma}</p>
              </td>
            </tr>
            <tr>
              <td style="background:#f3f4f6;padding:16px 32px;font-size:12px;color:#9ca3af;">
                Clean &amp; Shiny — <a href="mailto:cleanandshiny.info@gmail.com" style="color:#6b7280;text-decoration:underline;">cleanandshiny.info@gmail.com</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: t.subject, html };
}

interface ClientRow {
  client_name: string | null;
  city: string | null;
  idioma: string | null;
  rappelopenphoneactivado: boolean | null;
  rappelcorreoactivado: boolean | null;
  telefono1: string | null;
  telefono2: string | null;
  correo1: string | null;
  correo2: string | null;
  client_matched: boolean;
  cleaners: CleanerProfile[] | null;
}

export async function sendQuo(phone: string, body: string, fromId: string): Promise<boolean> {
  const apiKey = process.env.OPENPHONE_API_KEY;
  if (!apiKey) {
    console.warn('[CLIENT_NOTIFY] OPENPHONE_API_KEY no configurado');
    return false;
  }
  const res = await fetch('https://api.openphone.com/v1/messages', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromId, to: [phone], content: body }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.error('[CLIENT_NOTIFY] OpenPhone error:', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}

export async function sendEmail(emails: string[], subject: string, html: string): Promise<boolean> {
  const url = process.env.EMAIL_PROXY_URL;
  const secret = process.env.EMAIL_PROXY_SECRET;
  if (!url || !secret) {
    console.warn('[CLIENT_NOTIFY] EMAIL_PROXY_URL/SECRET no configurados');
    return false;
  }
  const res = await fetch(`${url.replace(/\/+$/, '')}/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
    body: JSON.stringify({ to: emails.join(', '), subject, html }),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!data.ok) {
    console.error('[CLIENT_NOTIFY] email-proxy error:', res.status, data.error || 'unknown');
    return false;
  }
  return true;
}

/**
 * Avisa a la clienta (QUO + correo) que enviaremos un cleaner de reemplazo, cuando
 * una cleaner acepta el servicio en el horario original. Respeta los canales activos
 * del cliente (rappelopenphoneactivado / rappelcorreoactivado), igual que los rappels.
 * Best-effort: nunca lanza (no debe romper la respuesta del aceptar).
 */
export async function notifyClientReplacement(eventId: string): Promise<void> {
  try {
    // Dedup: no reenviar el aviso al MISMO servicio (serie o evento) dentro de 6h.
    // Cubre el caso de que el servicio se acepte más de una vez (dos cleaners, reintentos,
    // reasignaciones). El INSERT ... ON CONFLICT es atómico, así que también gana la carrera
    // entre dos aceptaciones casi simultáneas: solo una obtiene el RETURNING y envía.
    const dedup = await getPool().query(
      `WITH svc AS (
         SELECT COALESCE(NULLIF(teamup_series_id, ''), teamup_event_id) AS key
         FROM "Glide".recent_contracts
         WHERE teamup_event_id = $1
         LIMIT 1
       )
       INSERT INTO public.client_replacement_notified (service_key, notified_at)
       SELECT key, now() FROM svc
       ON CONFLICT (service_key) DO UPDATE
         SET notified_at = now()
         WHERE public.client_replacement_notified.notified_at < now() - interval '6 hours'
       RETURNING service_key`,
      [eventId],
    );
    if (dedup.rowCount === 0) {
      console.warn('[CLIENT_NOTIFY] aviso duplicado suprimido para', eventId);
      return;
    }

    const { rows } = await getPool().query<ClientRow>(
      `SELECT rc.client_name, rc.city,
              cd.idioma, cd.rappelopenphoneactivado, cd.rappelcorreoactivado,
              cd.telefono1, cd.telefono2, cd.correo1, cd.correo2,
              (cd.nombredelcliente IS NOT NULL) AS client_matched,
              (SELECT json_agg(json_build_object('name', c.cleaner, 'ficha', c.ficha_tecnica) ORDER BY arr.ord)
                 FROM unnest(rc.cleaner_subcalendar_ids) WITH ORDINALITY AS arr(sub_id, ord)
                 LEFT JOIN "Glide".cleaners c ON c.subcalendar_unique_id::text = arr.sub_id) AS cleaners
       FROM "Glide".recent_contracts rc
       LEFT JOIN "Glide".clientdb cd
         ON lower(trim(cd.nombredelcliente)) = lower(trim(rc.client_name))
       WHERE rc.teamup_event_id = $1
       LIMIT 1`,
      [eventId],
    );
    const r = rows[0];
    if (!r) {
      console.warn('[CLIENT_NOTIFY] servicio sin fila en recent_contracts:', eventId);
      return;
    }
    // §14: si el cliente no casa en clientdb (nombre exacto), no hay canales ni idioma -> dejar rastro.
    if (!r.client_matched) {
      console.warn(
        `[CLIENT_NOTIFY] cliente sin match en clientdb (no se avisará): "${r.client_name}" event=${eventId}`,
      );
    }

    const lang = detectLang(r.idioma, r.city);
    const cleaners = Array.isArray(r.cleaners) ? r.cleaners : [];

    // MODO PRUEBA: si están seteadas, TODO se redirige a estos destinos (no al cliente real).
    const testPhone = normalizePhone(String(process.env.CLIENT_NOTIFY_TEST_PHONE || '').trim());
    const testEmail = String(process.env.CLIENT_NOTIFY_TEST_EMAIL || '').trim();

    // QUO (OpenPhone) — solo si el canal está activo (TRUE/NULL = enviar; FALSE = no).
    if (r.rappelopenphoneactivado !== false) {
      const phones = testPhone ? [testPhone] : pickPhones(r.telefono1, r.telefono2);
      if (phones.length) {
        const fromId =
          OPENPHONE_NUMBER_ID_BY_CITY[String(r.city || '').toLowerCase()] || OPENPHONE_DEFAULT_NUMBER_ID;
        for (const phone of phones) {
          await sendQuo(phone, QUO_TEXT[lang], fromId);
        }
      } else {
        // §14: cliente sin teléfono -> solo correo. Se registra en el log.
        console.warn(`[CLIENT_NOTIFY] cliente sin teléfono, no se manda QUO. event=${eventId}`);
      }
    }

    // Correo — solo si el canal está activo.
    if (r.rappelcorreoactivado !== false) {
      const emails = testEmail ? [testEmail] : collectEmails(r.correo1, r.correo2);
      if (emails.length) {
        const { subject, html } = emailHtml(r.client_name, cleaners, lang);
        await sendEmail(emails, subject, html);
      } else {
        // §14: cliente sin correo -> solo QUO. Se registra en el log.
        console.warn(`[CLIENT_NOTIFY] cliente sin correo, no se manda ficha técnica. event=${eventId}`);
      }
    }
  } catch (err) {
    console.error('[CLIENT_NOTIFY] error:', err);
  }
}
