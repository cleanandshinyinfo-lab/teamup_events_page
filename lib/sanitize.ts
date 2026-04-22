import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div', 'strong', 'b', 'em', 'i', 'u',
  'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'blockquote',
];

const ALLOWED_ATTR: Record<string, string[]> = {
  a: ['href', 'target', 'rel', 'class', 'style'],
  img: ['src', 'alt', 'width', 'height', 'class', 'style'],
  '*': ['class', 'style'],
};

export function sanitizeInstructionsHTML(html: string | null): string | null {
  if (!html) return null;

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTR,
    exclusiveFilter: (frame) => frame.tag === 'p' && frame.text.toLowerCase().includes('pedir este servicio'),
  });
}
