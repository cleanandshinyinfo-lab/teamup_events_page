import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div', 'strong', 'b', 'em', 'i', 'u',
  'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'blockquote',
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'src', 'alt', 'class', 'style', 'width', 'height',
];

export function sanitizeInstructionsHTML(html: string | null): string | null {
  if (!html) return null;

  let filtered = html;
  filtered = filtered.replace(/<hr[^>]*>[\s\S]*?<p[^>]*>[\s\S]*?Pedir este servicio[\s\S]*?<\/p>/gi, '');
  filtered = filtered.replace(/<p[^>]*>[\s\S]*?(?:👉|:point_right:)[\s\S]*?Pedir este servicio[\s\S]*?<\/p>/gi, '');
  filtered = filtered.replace(/<p[^>]*>[\s\S]*?Pedir este servicio[\s\S]*?<\/p>/gi, '');

  return DOMPurify.sanitize(filtered, { ALLOWED_TAGS, ALLOWED_ATTR });
}
