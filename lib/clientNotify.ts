import { getPool } from './db';

// OpenPhone phoneNumberId desde el cual sale el SMS, por ciudad (igual que los rappels).
const OPENPHONE_NUMBER_ID_BY_CITY: Record<string, string> = {
  montreal: 'PNXJQdJZps',
  quebec: 'PNXJQdJZps',
  ottawa_gatineau: 'PNXJQdJZps',
  calgary: 'PNFqUz9LL1',
  winnipeg: 'PNFqUz9LL1',
};
const OPENPHONE_DEFAULT_NUMBER_ID = 'PNXJQdJZps';
const CITY_DEFAULT_LANG: Record<string, 'en' | 'fr'> = {
  montreal: 'fr',
  quebec: 'fr',
  ottawa_gatineau: 'fr',
  calgary: 'en',
  winnipeg: 'en',
};

type Lang = 'en' | 'fr';

function detectLang(idioma: string | null, city: string | null): Lang {
  const raw = String(idioma || '').trim().toLowerCase();
  if (/fran|french|fr/.test(raw)) return 'fr';
  if (/ingl|english|en/.test(raw)) return 'en';
  if (/espan|spanish|es/.test(raw)) return 'en';
  return CITY_DEFAULT_LANG[String(city || '')] || 'en';
}

function normalizePhone(raw: string): string {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

function pickPhones(t1: string | null, t2: string | null): string[] {
  const out: string[] = [];
  for (const raw of [t1, t2]) {
    const p = normalizePhone(String(raw || '').trim());
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

function collectEmails(c1: string | null, c2: string | null): string[] {
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

function profileBlockHtml(cleaners: CleanerProfile[], lang: Lang): string {
  const word = lang === 'fr' ? 'Profil' : 'Profile';
  const sep = lang === 'fr' ? ' : ' : ': ';
  const lines = cleaners
    .filter((c) => c && c.ficha)
    .map(
      (c, i) =>
        `<p style="margin:0 0 12px 0;"><strong>${word} # ${i + 1}${sep}</strong>${cleanCleanerName(c.name)} → <a href="${c.ficha}">${c.ficha}</a></p>`,
    );
  return lines.join('\n');
}

function emailHtml(cleaners: CleanerProfile[], lang: Lang): { subject: string; html: string } {
  const profiles = profileBlockHtml(cleaners, lang);
  if (lang === 'fr') {
    return {
      subject: 'Cleaner de remplacement trouvée pour votre service',
      html:
        `<p style="margin:0 0 12px 0;">Bonjour,</p>` +
        `<p style="margin:0 0 12px 0;">Bonne nouvelle, nous avons trouvé une nettoyeuse disponible pour votre service et nous l'enverrons pour réaliser votre ménage comme prévu. 👈</p>` +
        profiles +
        `<p style="margin:0 0 12px 0;">Si vous préférez ne pas accepter ce remplacement, merci de nous en informer.</p>`,
    };
  }
  return {
    subject: 'Replacement cleaner for your service - Clean & Shiny 🧼✨',
    html:
      `<p style="margin:0 0 12px 0;">Hello,</p>` +
      `<p style="margin:0 0 12px 0;">Good news, we found a cleaner available for your service and will send her to complete your cleaning as planned. 👈</p>` +
      profiles +
      `<p style="margin:0 0 12px 0;">If you prefer not to proceed with this replacement, please let us know.</p>`,
  };
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
  cleaners: CleanerProfile[] | null;
}

async function sendQuo(phone: string, body: string, fromId: string): Promise<void> {
  const apiKey = process.env.OPENPHONE_API_KEY;
  if (!apiKey) {
    console.warn('[CLIENT_NOTIFY] OPENPHONE_API_KEY no configurado');
    return;
  }
  const res = await fetch('https://api.openphone.com/v1/messages', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromId, to: [phone], content: body }),
  });
  if (!res.ok) {
    console.error('[CLIENT_NOTIFY] OpenPhone error:', res.status, await res.text().catch(() => ''));
  }
}

async function sendEmail(emails: string[], subject: string, html: string): Promise<void> {
  const url = process.env.EMAIL_PROXY_URL;
  const secret = process.env.EMAIL_PROXY_SECRET;
  if (!url || !secret) {
    console.warn('[CLIENT_NOTIFY] EMAIL_PROXY_URL/SECRET no configurados');
    return;
  }
  const res = await fetch(`${url.replace(/\/+$/, '')}/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
    body: JSON.stringify({ to: emails.join(', '), subject, html }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!data.ok) console.error('[CLIENT_NOTIFY] email-proxy error:', res.status, data.error || 'unknown');
}

/**
 * Avisa a la clienta (QUO + correo) que enviaremos un cleaner de reemplazo, cuando
 * una cleaner acepta el servicio en el horario original. Respeta los canales activos
 * del cliente (rappelopenphoneactivado / rappelcorreoactivado), igual que los rappels.
 * Best-effort: nunca lanza (no debe romper la respuesta del aceptar).
 */
export async function notifyClientReplacement(eventId: string): Promise<void> {
  try {
    const { rows } = await getPool().query<ClientRow>(
      `SELECT rc.client_name, rc.city,
              cd.idioma, cd.rappelopenphoneactivado, cd.rappelcorreoactivado,
              cd.telefono1, cd.telefono2, cd.correo1, cd.correo2,
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
    if (!r) return;

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
      }
    }

    // Correo — solo si el canal está activo.
    if (r.rappelcorreoactivado !== false) {
      const emails = testEmail ? [testEmail] : collectEmails(r.correo1, r.correo2);
      if (emails.length) {
        const { subject, html } = emailHtml(cleaners, lang);
        await sendEmail(emails, subject, html);
      }
    }
  } catch (err) {
    console.error('[CLIENT_NOTIFY] error:', err);
  }
}
