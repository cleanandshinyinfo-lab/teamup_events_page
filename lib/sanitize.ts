import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div', 'strong', 'b', 'em', 'i', 'u',
  'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'blockquote',
];

// Las fotos de TeamUp vienen con style="float:left" y width/height fijos: el texto se metía al lado en columnas de
// una o dos palabras (ej. el código de la puerta de François Morin partido en 6 líneas a 430px). Por eso a las
// fotos solo les queda src y alt, y del estilo del resto solo pasan alineación y color (Mateo, 2-oct-2026).
const ALLOWED_ATTR: Record<string, string[]> = {
  a: ['href', 'target', 'rel', 'class', 'style'],
  img: ['src', 'alt', 'loading', 'decoding'],
  '*': ['class', 'style'],
};

const ALLOWED_STYLES = {
  '*': {
    'text-align': [/^(left|right|center|justify)$/],
    color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i],
  },
};

// Párrafos vacíos (espacios, &nbsp;, <br> o etiquetas vacías) que dejaban huecos grandes entre fotos. Se quitan
// después de limpiar, para no llevarse una foto que viene dentro de <em> o <strong>.
const PARRAFO_VACIO = /<p(?:\s[^>]*)?>(?:\s|&nbsp;|<br\s*\/?>|<(strong|em|b|i|u|span)>(?:\s|&nbsp;)*<\/\1>)*<\/p>/g;

export function sanitizeInstructionsHTML(html: string | null): string | null {
  if (!html) return null;

  const limpio = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTR,
    allowedStyles: ALLOWED_STYLES,
    transformTags: {
      // Las fotos bajan cuando se acercan a la pantalla, no todas al abrir (eran 3,6 MB en un solo servicio).
      img: (_tagName, attribs) => ({
        tagName: 'img',
        attribs: {
          src: attribs.src,
          alt: attribs.alt && !/\.(png|jpe?g|gif|webp)$/i.test(attribs.alt) ? attribs.alt : 'Foto',
          loading: 'lazy',
          decoding: 'async',
        },
      }),
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener' }),
    },
    exclusiveFilter: (frame) => frame.tag === 'p' && frame.text.toLowerCase().includes('pedir este servicio'),
  });

  // TeamUp deja espacios y &nbsp; pegados a las fotos: abrían una línea vacía debajo de cada una.
  return limpio
    .replace(/(<img[^>]*>)(?:\s|&nbsp;)+/g, '$1')
    .replace(/(?:\s|&nbsp;)+(<img)/g, '$1')
    .replace(PARRAFO_VACIO, '');
}
