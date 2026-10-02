// Las fotos de TeamUp pesan hasta 1 MB y se ven a ~350px: Vercel las entrega achicadas y en webp (3,6 MB → ~0,7 MB en
// François Morin). Solo las de files.teamup.com, que es lo autorizado en next.config.js.
export function achicada(src: string | undefined, ancho: number): string {
  if (!src || !/^https:\/\/files\.teamup\.com\//.test(src)) return src || '';
  return `/_next/image?url=${encodeURIComponent(src)}&w=${ancho}&q=70`;
}

