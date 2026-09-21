// Transliteración a GSM-7 para el cuerpo de un SMS (Quo/OpenPhone).
// Copia en TypeScript de service-reminders/src/lib/gsm7.js — mantener en sync.
//
// Un solo carácter fuera del alfabeto GSM-7 pasa el SMS ENTERO a UCS-2
// (70 caracteres por segmento en vez de 160): "août", "reçu", "Côte-des-Neiges"
// o una comilla curva pegada desde Word duplican o triplican el costo.
//
// Regla (decisión de Mateo, 21-sep-2026): las letras que SÍ están en GSM-7
// (é è à ù ì ò É Ç ä ö ñ ü Ä Ö Ñ Ü, etc.) se conservan; cualquier otra letra
// acentuada se reduce a su base (ê->e, ç->c, ô->o, û->u, î->i, ë->e, ï->i,
// â->a, œ->oe, È->E, À->A...); la puntuación tipográfica se pasa a ASCII
// (comillas curvas, guiones largos, puntos suspensivos, espacios duros).
// Los emojis y cualquier otro símbolo NO se tocan: solo se devuelven en
// `remaining` para que quien envía lo loguee. Idempotente.

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅå' +
  'Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ' +
  ' !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿' +
  'abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€';

const GSM7_SET = new Set<string>(GSM7_BASIC + GSM7_EXTENDED);

const PUNCTUATION = new Map<number, string>([
  [0x2018, "'"], [0x2019, "'"], [0x201a, "'"], [0x201b, "'"], [0x2032, "'"],
  [0x201c, '"'], [0x201d, '"'], [0x201e, '"'], [0x201f, '"'], [0x2033, '"'],
  [0x2010, '-'], [0x2011, '-'], [0x2012, '-'], [0x2013, '-'], [0x2014, '-'], [0x2015, '-'], [0x2212, '-'],
  [0x2026, '...'],
  [0x2022, '-'], [0x00b7, '-'],
  [0x00a0, ' '], [0x202f, ' '], [0x2009, ' '], [0x200a, ' '], [0x2002, ' '], [0x2003, ' '], [0x2007, ' '], [0x3000, ' '],
  [0x00ad, ''], [0x200b, ''], [0x200c, ''], [0x200e, ''], [0x200f, ''], [0x2060, ''], [0xfeff, ''],
]);

const LIGATURES = new Map<number, string>([
  [0x0153, 'oe'], [0x0152, 'OE'],
  [0x0111, 'd'], [0x0110, 'D'],
  [0x0142, 'l'], [0x0141, 'L'],
  [0x00fe, 'th'], [0x00de, 'Th'],
  [0x0131, 'i'],
]);

// Marcas combinantes que deja NFD (bloques Combining Diacritical Marks y
// afines). Sin la bandera `u` porque el target de este tsconfig es es5.
const COMBINING_MARKS = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;

export interface Gsm7Result {
  /** Cuerpo listo para OpenPhone. */
  text: string;
  /** true si se tocó algo. */
  changed: boolean;
  /** Caracteres que siguen fuera de GSM-7 (emojis u otros símbolos), para loguear. */
  remaining: string[];
}

export function toGsm7(input: string | null | undefined): Gsm7Result {
  const s = String(input == null ? '' : input);
  let out = '';
  const remaining = new Set<string>();
  for (const ch of s) {
    if (GSM7_SET.has(ch)) { out += ch; continue; }
    const cp = ch.codePointAt(0) ?? -1;
    const punct = PUNCTUATION.get(cp);
    if (punct !== undefined) { out += punct; continue; }
    const lig = LIGATURES.get(cp);
    if (lig !== undefined) { out += lig; continue; }
    const base = ch.normalize('NFD').replace(COMBINING_MARKS, '');
    if (base && base !== ch && Array.from(base).every((c) => GSM7_SET.has(c))) { out += base; continue; }
    out += ch;
    remaining.add(ch);
  }
  return { text: out, changed: out !== s, remaining: Array.from(remaining) };
}

export function isGsm7(text: string | null | undefined): boolean {
  for (const ch of String(text == null ? '' : text)) if (!GSM7_SET.has(ch)) return false;
  return true;
}
