import DOMPurify from 'isomorphic-dompurify';
import * as cheerio from 'cheerio';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div', 'strong', 'b', 'em', 'i', 'u',
  'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'blockquote',
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'src', 'alt', 'class', 'style', 'width', 'height',
];

function stripPedirEsteServicio(html: string): string {
  const $ = cheerio.load(html, null, false);
  $('p').each((_, el) => {
    const $el = $(el);
    if ($el.text().toLowerCase().includes('pedir este servicio')) {
      const prev = $el.prev();
      if (prev.is('hr')) prev.remove();
      $el.remove();
    }
  });
  return $.html();
}

export function sanitizeInstructionsHTML(html: string | null): string | null {
  if (!html) return null;
  const filtered = stripPedirEsteServicio(html);
  return DOMPurify.sanitize(filtered, { ALLOWED_TAGS, ALLOWED_ATTR });
}
