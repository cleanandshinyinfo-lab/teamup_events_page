import { getPool } from './db';
import {
  detectLang,
  sendQuo,
  sendEmail,
  pickPhones,
  collectEmails,
  normalizePhone,
  OPENPHONE_NUMBER_ID_BY_CITY,
  OPENPHONE_DEFAULT_NUMBER_ID,
  type Lang,
} from './clientNotify';
import {
  EMAIL_EN_TEMPLATE,
  EMAIL_FR_TEMPLATE,
  QUO_EN_TEMPLATE,
  QUO_FR_TEMPLATE,
} from './rappelTemplates';

const CITY_TIMEZONE: Record<string, string> = {
  montreal: 'America/Toronto',
  quebec: 'America/Toronto',
  ottawa_gatineau: 'America/Toronto',
  calgary: 'America/Edmonton',
  winnipeg: 'America/Winnipeg',
};
const DEFAULT_TIMEZONE = 'America/Toronto';

const SUPERVISOR_BY_CITY: Record<string, { name: string; phone: string }> = {
  montreal: { name: 'Alexis', phone: '+14388025862' },
  quebec: { name: 'Alexis', phone: '+14388025862' },
  ottawa_gatineau: { name: 'Alexis', phone: '+14388025862' },
  calgary: { name: 'Alexis', phone: '+15873249946' },
  winnipeg: { name: 'Alexis', phone: '+15873249946' },
};

const CLEANING_TYPE_LABELS: Record<string, { en: string; fr: string }> = {
  regular: { en: 'regular cleaning', fr: 'ménage régulier' },
  profunda: { en: 'deep cleaning', fr: 'ménage en profondeur' },
  airbnb: { en: 'Airbnb cleaning', fr: 'ménage Airbnb' },
  unidad_vacia: { en: 'empty-unit cleaning', fr: 'ménage logement vide' },
  renovacion: { en: 'post-renovation cleaning', fr: 'ménage post-rénovation' },
  especial: { en: 'special cleaning', fr: 'ménage spécial' },
  dry_cleaning: { en: 'dry cleaning', fr: 'nettoyage à sec' },
};

const RECURRENCE_LABELS: Record<string, { en: string; fr: string }> = {
  semanal: { en: 'weekly', fr: 'à toutes les semaines' },
  cada_2_semanas: { en: 'every 2 weeks', fr: 'aux 2 semaines' },
  cada_3_semanas: { en: 'every 3 weeks', fr: 'aux 3 semaines' },
  cada_4_semanas: { en: 'every 4 weeks', fr: 'aux 4 semaines' },
  cada_5_semanas: { en: 'every 5 weeks', fr: 'aux 5 semaines' },
  cada_6_semanas: { en: 'every 6 weeks', fr: 'aux 6 semaines' },
  cada_7_semanas: { en: 'every 7 weeks', fr: 'aux 7 semaines' },
  cada_8_semanas: { en: 'every 8 weeks', fr: 'aux 8 semaines' },
  cada_mes: { en: 'monthly', fr: 'mensuel' },
  ocasional: { en: 'occasionally', fr: 'occasionnel' },
  sobrepedido: { en: 'on request', fr: 'sur demande' },
};

const PROPERTY_TYPE_EN: Record<string, string> = {
  'un appartement 3 1/2': '3.5-room apartment',
  'un appartement 4 1/2': '4.5-room apartment',
  'un appartement 5 1/2': '5.5-room apartment',
  'un appartement 6 1/2': '6.5-room apartment',
  'une maison a 1 etage': '1-story house',
  'une maison a 2 etages': '2-story house',
  'une maison a 3 etages': '3-story house',
  'un loft': 'loft',
  'un bureau': 'office',
};

const STATIC_LINKS = {
  serviceDescription: 'https://zpr.io/VJKYZQ6w54za',
  importantInfo: {
    en: 'https://canva.link/important-service-information',
    fr: 'https://canva.link/information-importante-du-service',
  },
};

interface RappelRow {
  teamup_event_id: string;
  client_name: string | null;
  city: string | null;
  start_dt: string | Date | null;
  duration_hours: number | string | null;
  frequency: string | null;
  cleaning_type: string | null;
  num_cleaners: number | null;
  cleaner_names_arr: string[] | null;
  service_date_local: string; // 'YYYY-MM-DD'
  client_name_db: string | null;
  correo1: string | null;
  correo2: string | null;
  telefono1: string | null;
  telefono2: string | null;
  idioma: string | null;
  client_direccion: string | null;
  deapartamento: string | null;
  tipodepropiedadfr: string | null;
  tipodepropiedadfrautre: string | null;
  costoporhora: number | string | null;
  precioespecialdelprimerservicio15: string | null;
  total_con_fees: number | string | null;
  descripcion_servicio_link: string | null;
  rappelopenphoneactivado: boolean | null;
  rappelcorreoactivado: boolean | null;
  contabilidad_facturas_debidas_count: number | string | null;
  any_cleaner_has_vacuum: boolean | null;
  ficha_tecnica_arr: (string | null)[] | null;
}

async function fetchRappelRow(eventId: string): Promise<RappelRow | null> {
  const { rows } = await getPool().query<RappelRow>(
    `SELECT
        rc.teamup_event_id,
        rc.client_name,
        LOWER(rc.city) AS city,
        rc.start_dt,
        rc.duration_hours,
        rc.frequency,
        rc.cleaning_type,
        cardinality(rc.cleaner_subcalendar_ids) AS num_cleaners,
        COALESCE(rc.cleaner_names, '{}'::text[]) AS cleaner_names_arr,
        -- Fecha calendario del servicio en TZ America/Toronto: MISMA fórmula que usa
        -- service-reminders/src/lib/queries.js para service_date_local, así el valor
        -- calza exactamente con la clave (teamup_event_id, service_date) que usa/lee
        -- el cron de las 9am en public.service_reminders_sent.
        to_char((rc.start_dt AT TIME ZONE 'America/Toronto')::date, 'YYYY-MM-DD') AS service_date_local,
        cd.nombredelcliente AS client_name_db,
        cd.correo1, cd.correo2,
        cd.telefono1, cd.telefono2,
        cd.idioma,
        cd.direccion AS client_direccion,
        cd.deapartamento,
        COALESCE(NULLIF(cd."Tipo de propiedad FR", ''), cd.tipodepropiedadfr) AS tipodepropiedadfr,
        cd.tipodepropiedadfrautre,
        cd.costoporhora,
        cd.precioespecialdelprimerservicio15,
        cd."total (con fees en el costo por hora)" AS total_con_fees,
        cd.descripciondesuservicio AS descripcion_servicio_link,
        cd.rappelopenphoneactivado,
        cd.rappelcorreoactivado,
        cd.contabilidad_facturas_debidas_count,
        (SELECT bool_or(c.tiene_aspiradora)
           FROM "Glide".cleaners c
           WHERE c.subcalendar_unique_id::text = ANY(rc.cleaner_subcalendar_ids)
        ) AS any_cleaner_has_vacuum,
        (SELECT array_agg(c.ficha_tecnica ORDER BY arr.ord)
           FROM unnest(rc.cleaner_subcalendar_ids) WITH ORDINALITY AS arr(sub_id, ord)
           LEFT JOIN "Glide".cleaners c ON c.subcalendar_unique_id::text = arr.sub_id
        ) AS ficha_tecnica_arr
     FROM "Glide".recent_contracts rc
     LEFT JOIN "Glide".clientdb cd
       ON lower(trim(cd.nombredelcliente)) = lower(trim(rc.client_name))
     WHERE rc.teamup_event_id = $1
     LIMIT 1`,
    [eventId],
  );
  return rows[0] ?? null;
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 2; i++) {
    const offset = tzOffsetMs(new Date(guessMs), timeZone);
    guessMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
  }
  return new Date(guessMs);
}

function computeRappelDueAt(serviceDateStr: string, city: string | null): Date {
  const [y, m, d] = serviceDateStr.split('-').map(Number);
  const dueDateMs = Date.UTC(y, m - 1, d) - 24 * 60 * 60 * 1000;
  const dd = new Date(dueDateMs);
  const timeZone = CITY_TIMEZONE[String(city || '').toLowerCase()] || DEFAULT_TIMEZONE;
  return zonedWallClockToUtc(dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate(), 9, 0, timeZone);
}

function classifyCleaningType(raw: string | null): string | null {
  if (!raw) return null;
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u');
  if (/dry[\s_-]?cleaning|nettoyage.*sec|limpieza.*seco|en\s*seco/.test(s)) return 'dry_cleaning';
  if (/regular|regulier/.test(s)) return 'regular';
  if (/profund|profondeur/.test(s)) return 'profunda';
  if (/airbnb/.test(s)) return 'airbnb';
  if (/unidad.*vac|vide|logement/.test(s)) return 'unidad_vacia';
  if (/renov/.test(s)) return 'renovacion';
  if (/especial|special/.test(s)) return 'especial';
  return null;
}

function classifyFrequency(raw: string | null): string | null {
  if (!raw) return null;
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u');
  if (/^(sobre\s*pedido|sobrepedido|on[\s-]?demand|sur\s*demande)/.test(s)) return 'sobrepedido';
  if (/^(ocasion|ponctuel|one[\s-]?time|once)/.test(s)) return 'ocasional';
  if (/^(semanalmente|semanal|weekly|hebdomadaire|chaque\s*semaine|once\s*a\s*week)/.test(s)) return 'semanal';
  if (/^(bisemanal|bi[\s-]?semanal|biweekly|aux\s*2\s*semaines)/.test(s)) return 'cada_2_semanas';
  const m = s.match(/cada\s*(\d+)?\s*semana/);
  if (m) {
    const n = m[1] ? Number(m[1]) : 1;
    if (n === 1) return 'semanal';
    if (n >= 2 && n <= 10) return `cada_${n}_semanas`;
  }
  if (/^(cada\s*mes|monthly|mensuel)/.test(s)) return 'cada_mes';
  return null;
}

function cleaningTypeLabel(rawType: string | null, lang: Lang): string {
  const key = classifyCleaningType(rawType);
  if (!key) return rawType || '';
  return CLEANING_TYPE_LABELS[key]?.[lang] || CLEANING_TYPE_LABELS[key]?.en || rawType || '';
}

function recurrenceLabel(rawFreq: string | null, lang: Lang): string {
  const key = classifyFrequency(rawFreq);
  if (!key) return rawFreq || '';
  return RECURRENCE_LABELS[key]?.[lang] || RECURRENCE_LABELS[key]?.en || rawFreq || '';
}

function formatDateTime(date: string | Date | null, lang: Lang): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
  let s = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: lang !== 'fr',
    timeZone: 'America/Toronto',
  }).format(d);
  if (lang === 'fr') s = s.charAt(0).toUpperCase() + s.slice(1);
  s = s.replace(/\.$/, '');
  return s;
}

function cleanersCountLabel(n: number, lang: Lang): string {
  if (lang === 'fr') return n >= 2 ? "deux agents d'entretien" : "un agent d'entretien";
  return n >= 2 ? 'two cleaning agents' : 'one cleaning agent';
}

function vacuumNote(hasVacuum: boolean, lang: Lang): string {
  if (hasVacuum) return '';
  return lang === 'fr' ? "à l'exception de l'aspirateur" : 'except the vacuum cleaner';
}

function propertyTypeLabel(row: RappelRow, lang: Lang): string {
  const fr = row.tipodepropiedadfrautre || row.tipodepropiedadfr || '';
  if (!fr) return '';
  if (lang === 'fr') return fr;
  const key = String(fr)
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
  if (PROPERTY_TYPE_EN[key]) return PROPERTY_TYPE_EN[key];
  if (/appartement/.test(key)) return fr.replace(/appartement/i, 'apartment');
  if (/maison/.test(key)) return fr.replace(/maison/i, 'house');
  return fr;
}

function safe(v: string | number | null | undefined): string {
  return v == null ? '' : String(v);
}

const EMOJI_RE = new RegExp(
  '[\\uD800-\\uDFFF\\u2190-\\u21FF\\u2300-\\u27BF\\u2B00-\\u2BFF\\uFE0F\\u200D]',
  'g',
);

function cleanClientName(raw: string | null): string {
  if (!raw) return '';
  return String(raw)
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(EMOJI_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCleanerName(raw: string | null): string {
  if (!raw) return '';
  let s = String(raw);
  const idx = s.lastIndexOf('>');
  if (idx >= 0) s = s.slice(idx + 1);
  return s
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(EMOJI_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fmtDuration(n: number): string {
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

function buildPlaceholderValues(row: RappelRow, lang: Lang): Record<string, string> {
  const cityKey = String(row.city || '').toLowerCase();
  const supervisor = SUPERVISOR_BY_CITY[cityKey] || { name: 'Alexis', phone: '+14388025862' };
  const cleaners = row.cleaner_names_arr || [];
  const numCleaners = Number(row.num_cleaners || 0);
  const horas = Number(row.duration_hours || 0);
  const mitad = horas / Math.max(1, numCleaners);
  const fmtH = (n: number) => Number(n).toFixed(1).replace('.', ',');
  const total =
    row.total_con_fees != null && row.total_con_fees !== ''
      ? Number(row.total_con_fees)
      : horas && row.costoporhora
        ? Math.round(horas * Number(row.costoporhora))
        : '';
  const dateLong = formatDateTime(row.start_dt, lang);
  const fichas = row.ficha_tecnica_arr || [];

  return {
    '{{Nombre}}': cleanClientName(row.client_name),
    '{{Fecha y hora}}': dateLong,
    '{{Fecha y hora (FR)}}': dateLong,
    '{{Direccion}}': safe(row.client_direccion),
    '{{Informacion adicional direccion}}': row.deapartamento ? `(${row.deapartamento})` : '',
    '{{Tipo de limpieza ENG}}': cleaningTypeLabel(row.cleaning_type, 'en'),
    '{{Tipo de limpieza FR}}': cleaningTypeLabel(row.cleaning_type, 'fr'),
    '{{Tipo de propiedad ENG}}': propertyTypeLabel(row, 'en'),
    '{{Tipo de propiedad FR}}': propertyTypeLabel(row, 'fr'),
    '{{Cuantos cleaners ENG}}': cleanersCountLabel(numCleaners, 'en'),
    '{{Cuantos cleaners FR}}': cleanersCountLabel(numCleaners, 'fr'),
    '{{Horas if}}': safe(numCleaners >= 2 ? mitad : horas),
    '{{Horas}}': safe(numCleaners >= 2 ? mitad : horas),
    '{{Mitad horas}}': numCleaners >= 2 ? String(mitad) : '',
    '{{Recurrencia ENG}}': recurrenceLabel(row.frequency, 'en'),
    '{{Recurrencia FR}}': recurrenceLabel(row.frequency, 'fr'),
    '{{Total}}': safe(total),
    '{{Precio diferente template ENG}}': safe(row.precioespecialdelprimerservicio15),
    '{{Precio diferente template FR}}': safe(row.precioespecialdelprimerservicio15),
    '{{Aspiradora ENG}}': vacuumNote(!!row.any_cleaner_has_vacuum, 'en'),
    '{{Aspiradora FR}}': vacuumNote(!!row.any_cleaner_has_vacuum, 'fr'),
    '{{Nota 2 cleaners IF}}':
      numCleaners >= 2
        ? lang === 'fr'
          ? 'Le service sera réalisé par une équipe de deux personnes.'
          : 'The service will be carried out by a team of two people.'
        : '',
    '{{Cleaner 1}}': cleanCleanerName(cleaners[0] ?? null),
    '{{Cleaner 2}}': cleanCleanerName(cleaners[1] ?? null),
    '{{Ficha tecnica cleaner 1}}': safe(fichas[0]),
    '{{Ficha tecnica cleaner 2}}': safe(fichas[1]),
    '{{Linea profil 2 FR}}':
      numCleaners >= 2
        ? '<p style="margin:0 0 16px 0;"><strong>Profil # 2 :</strong> ' +
          cleanCleanerName(cleaners[1] ?? null) +
          ' → ' +
          safe(fichas[1]) +
          '</p>'
        : '',
    '{{Linea profil 2 ENG}}':
      numCleaners >= 2
        ? '<p style="margin:0 0 16px 0;"><strong>Profile # 2:</strong> ' +
          cleanCleanerName(cleaners[1] ?? null) +
          ' → ' +
          safe(fichas[1]) +
          '</p>'
        : '',
    '{{Bloque equipo 2 FR}}':
      numCleaners >= 2
        ? '<!-- §5b AVISO VERT — équipe 2 personnes -->\n        <div style="border-left:4px solid #10b981; background-color:#ecfdf5; padding:12px 16px; margin:0 0 12px 0; border-radius:0 6px 6px 0;"><p style="margin:0; font-size:14px; color:#374151;">❕Veuillez noter que votre service sera effectué par une équipe composée par deux personnes. Cela veut dire que le temps de ménage sera divisé à la moitié, étant ' +
          fmtH(mitad) +
          ' heures par cleaner = ' +
          fmtH(horas) +
          ' heures au total.</p></div>'
        : '',
    '{{Bloque equipo 2 ENG}}':
      numCleaners >= 2
        ? '<!-- NOTICE 3: green callout — team of 2 -->\n        <div style="border-left:4px solid #10b981; background-color:#ecfdf5; padding:12px 16px; margin:0 0 12px 0; border-radius:0 6px 6px 0;"><p style="margin:0; font-size:14px; color:#374151;">❕Please note that your service will be carried out by a team of two people. This means the cleaning time will be split between the two, with ' +
          fmtH(mitad) +
          ' hours per cleaner = ' +
          fmtH(horas) +
          ' hours in total.</p></div>'
        : '',
    '{{Descripcion del servicio}}': safe(row.descripcion_servicio_link) || STATIC_LINKS.serviceDescription,
    '{{Informacion importante}}': STATIC_LINKS.importantInfo[lang] || STATIC_LINKS.importantInfo.en,
    '{{Correo 1}}': safe(row.correo1),
    '{{Correo 2}}': safe(row.correo2),
    '{{Supervisor ciudad}}': supervisor.name,
    '{{Supervisor telefono}}': supervisor.phone,
  };
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(values)) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), () => v);
  }
  return out;
}

export function renderRappelEmail(row: RappelRow, lang: Lang): { subject: string; html: string } {
  const values = buildPlaceholderValues(row, lang);
  const html = renderTemplate(lang === 'fr' ? EMAIL_FR_TEMPLATE : EMAIL_EN_TEMPLATE, values);
  const subject =
    lang === 'fr'
      ? `Rappel de votre service de ménage — ${values['{{Fecha y hora}}']}`
      : `Reminder for your cleaning service — ${values['{{Fecha y hora}}']}`;
  return { subject, html };
}

export function renderRappelQuo(row: RappelRow, lang: Lang): { body: string } {
  const values = buildPlaceholderValues(row, lang);
  const c1 = values['{{Correo 1}}'];
  const c2 = values['{{Correo 2}}'];
  values['{{Correo 2}}'] = c2 ? (c1 ? `, ${c2}` : c2) : '';
  let body = renderTemplate(lang === 'fr' ? QUO_FR_TEMPLATE : QUO_EN_TEMPLATE, values)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const numCleaners = Number(row.num_cleaners || 0);
  if (numCleaners >= 2) {
    const horas = Number(row.duration_hours || 0);
    const mitad = fmtDuration(horas / numCleaners);
    const total = fmtDuration(horas);
    const nota =
      lang === 'fr'
        ? `\n\nVeuillez noter que votre service sera effectué par une équipe composée par deux personnes. Cela veut dire que le temps de ménage sera divisé à la moitié, étant ${mitad} heures par cleaner = ${total} heures au total.`
        : `\n\nPlease note that your service will be carried out by a team of two people. This means the cleaning time will be split between the two cleaners, with ${mitad} hours per cleaner = ${total} hours in total.`;
    body += nota;
  }

  return { body };
}

// Devuelve true solo si el rappel realmente se envió en el acto (Escenario 2, al
// menos un canal salió). Cualquier otro camino (aún no toca, ya enviado, cliente
// sin datos, modo prueba, carrera perdida, fallo total) devuelve false.
export async function sendRappel(eventId: string, effectiveDate?: string | Date): Promise<boolean> {
  try {
    const now = effectiveDate ? new Date(effectiveDate) : new Date();
    const nowSafe = Number.isNaN(now.getTime()) ? new Date() : now;

    const row = await fetchRappelRow(eventId);
    if (!row) {
      console.warn('[RAPPEL] servicio sin fila en recent_contracts, no se manda. event=', eventId);
      return false;
    }

    const serviceDate = row.service_date_local;

    const existing = await getPool().query(
      `SELECT 1 FROM public.service_reminders_sent WHERE teamup_event_id = $1 AND service_date = $2 LIMIT 1`,
      [eventId, serviceDate],
    );
    if ((existing.rowCount ?? 0) > 0) {
      console.log(
        `[RAPPEL] ya estaba enviado para event=${eventId} service_date=${serviceDate}, no se reenvía.`,
      );
      return false;
    }

    const rappelDueAt = computeRappelDueAt(serviceDate, row.city);
    if (nowSafe < rappelDueAt) {
      console.log(
        `[RAPPEL] Escenario 1 (aún no toca), lo cubrirá el cron de 9am. event=${eventId} ` +
          `service_date=${serviceDate} dueAt=${rappelDueAt.toISOString()} now=${nowSafe.toISOString()}`,
      );
      return false;
    }

    if (!row.client_name_db) {
      console.warn(
        `[RAPPEL] cliente sin match en clientdb (inactivo), no se manda. event=${eventId}`,
      );
      return false;
    }
    if (Number(row.contabilidad_facturas_debidas_count) > 0) {
      console.warn(`[RAPPEL] cliente con facturas debidas, no se manda. event=${eventId}`);
      return false;
    }
    if (!row.descripcion_servicio_link) {
      console.warn(`[RAPPEL] servicio sin descripción configurada, no se manda. event=${eventId}`);
      return false;
    }
    const fichas = row.ficha_tecnica_arr || [];
    const hasTechSheet = fichas.length > 0 && fichas.every((f) => !!f);
    if (!hasTechSheet) {
      console.warn(`[RAPPEL] falta ficha técnica de algún cleaner, no se manda. event=${eventId}`);
      return false;
    }

    const lang = detectLang(row.idioma, row.city);
    const testMode = process.env.RAPPEL_TEST_MODE !== 'false';
    const smsEnabled = row.rappelopenphoneactivado !== false;
    const emailEnabled = row.rappelcorreoactivado !== false;
    const fromId =
      OPENPHONE_NUMBER_ID_BY_CITY[String(row.city || '').toLowerCase()] || OPENPHONE_DEFAULT_NUMBER_ID;

    if (testMode) {
      const testPhone = normalizePhone(String(process.env.RAPPEL_TEST_PHONE || '').trim());
      const testEmail = String(process.env.RAPPEL_TEST_EMAIL || '').trim();
      if (smsEnabled && testPhone) {
        await sendQuo(testPhone, renderRappelQuo(row, lang).body, fromId);
      }
      if (emailEnabled && testEmail) {
        const { subject, html } = renderRappelEmail(row, lang);
        await sendEmail([testEmail], subject, html);
      }
      console.log(
        `[RAPPEL] MODO PRUEBA (no toca service_reminders_sent). event=${eventId} ` +
          `service_date=${serviceDate} lang=${lang} sms=${smsEnabled && !!testPhone} email=${emailEnabled && !!testEmail}`,
      );
      // Simulación: no cuenta como envío real (no toca el candado ni cuentas).
      return false;
    }

    const claim = await getPool().query(
      `INSERT INTO public.service_reminders_sent (teamup_event_id, service_date, language, sent_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (teamup_event_id, service_date) DO NOTHING
       RETURNING id`,
      [eventId, serviceDate, lang],
    );
    if ((claim.rowCount ?? 0) === 0) {
      console.log(`[RAPPEL] otro proceso ya reclamó este rappel (carrera), se omite. event=${eventId}`);
      return false;
    }

    let emailTo: string[] = [];
    let emailSentAt: Date | null = null;
    let quoTo: string | null = null;
    let quoSentAt: Date | null = null;
    const errors: string[] = [];

    if (smsEnabled) {
      const phone = pickPhones(row.telefono1, row.telefono2)[0] || null;
      if (!phone) {
        console.warn(`[RAPPEL] cliente sin teléfono, no se manda SMS. event=${eventId}`);
      } else {
        try {
          if (await sendQuo(phone, renderRappelQuo(row, lang).body, fromId)) {
            quoTo = phone;
            quoSentAt = new Date();
          } else {
            errors.push('quo: proveedor rechazó el envío');
          }
        } catch (e) {
          errors.push(`quo: ${e instanceof Error ? e.message : String(e)}`);
          console.error('[RAPPEL] error enviando SMS:', e);
        }
      }
    }

    if (emailEnabled) {
      const emails = collectEmails(row.correo1, row.correo2);
      if (!emails.length) {
        console.warn(`[RAPPEL] cliente sin correo, no se manda correo. event=${eventId}`);
      } else {
        try {
          const { subject, html } = renderRappelEmail(row, lang);
          if (await sendEmail(emails, subject, html)) {
            emailTo = emails;
            emailSentAt = new Date();
          } else {
            errors.push('email: proveedor rechazó el envío');
          }
        } catch (e) {
          errors.push(`email: ${e instanceof Error ? e.message : String(e)}`);
          console.error('[RAPPEL] error enviando correo:', e);
        }
      }
    }

    if (!quoSentAt && !emailSentAt && errors.length) {
      await getPool().query(
        `DELETE FROM public.service_reminders_sent WHERE teamup_event_id = $1 AND service_date = $2`,
        [eventId, serviceDate],
      );
      console.error(
        `[RAPPEL] todos los envíos fallaron; se libera el slot para reintento del cron. ` +
          `event=${eventId} errors=${errors.join(' | ')}`,
      );
      return false;
    }

    await getPool().query(
      `UPDATE public.service_reminders_sent
         SET email_to = $1, email_sent_at = $2, quo_to = $3, quo_sent_at = $4, last_error = $5
       WHERE teamup_event_id = $6 AND service_date = $7`,
      [
        emailTo.length ? emailTo.join(',') : null,
        emailSentAt,
        quoTo,
        quoSentAt,
        errors.length ? errors.join(' | ') : null,
        eventId,
        serviceDate,
      ],
    );
    console.log(
      `[RAPPEL] Escenario 2 enviado. event=${eventId} service_date=${serviceDate} ` +
        `lang=${lang} sms=${!!quoSentAt} email=${!!emailSentAt}`,
    );
    return !!(quoSentAt || emailSentAt);
  } catch (err) {
    console.error('[RAPPEL] error inesperado (no bloquea la aceptación):', err);
    return false;
  }
}
