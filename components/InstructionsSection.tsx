'use client';

import { useEffect, useRef, useState } from 'react';
import { achicada } from '@/lib/fotos';

interface InstructionsSectionProps {
  html: string | null;
}

/**
 * Renders pre-sanitized HTML instructions (sanitization happens server-side
 * via lib/sanitize.ts before reaching this component). Al tocar una foto se abre
 * grande, con anterior y siguiente (antes no se podía ampliar: 2-oct-2026).
 */
/** La foto para el visor: la misma, achicada a 1200px (o la original si no es de TeamUp). */
const grande = (i: HTMLImageElement) => (i.dataset.original ? achicada(i.dataset.original, 1200) : i.currentSrc || i.src);

export default function InstructionsSection({ html }: InstructionsSectionProps) {
  const caja = useRef<HTMLDivElement>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<number | null>(null);

  useEffect(() => {
    if (html && typeof window !== 'undefined' && window.location.hash === '#instrucciones') {
      document.getElementById('instrucciones')?.scrollIntoView({ behavior: 'smooth' });
    }
    const imgs = Array.from(caja.current?.querySelectorAll('img') ?? []);
    // Si Vercel no puede achicar una foto (ej. se pasó el límite del plan), se muestra la original en vez del hueco.
    imgs.forEach((i) => {
      const original = i.dataset.original;
      if (!original) return;
      const volver = () => { if (i.src !== original) i.src = original; };
      i.addEventListener('error', volver, { once: true });
      if (i.complete && i.naturalWidth === 0) volver();
    });
    setFotos(imgs.map(grande));
  }, [html]);

  useEffect(() => {
    if (abierta === null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierta(null);
      if (e.key === 'ArrowRight') setAbierta((i) => (i !== null && i < fotos.length - 1 ? i + 1 : i));
      if (e.key === 'ArrowLeft') setAbierta((i) => (i !== null && i > 0 ? i - 1 : i));
    };
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
    };
  }, [abierta, fotos.length]);

  if (!html) {
    return (
      <div className="text-gray-500 text-center py-8">
        No hay instrucciones especiales.
      </div>
    );
  }

  const tocar = (e: React.MouseEvent<HTMLDivElement>) => {
    const img = (e.target as HTMLElement).closest('img');
    if (!img || !caja.current) return;
    const todas = Array.from(caja.current.querySelectorAll('img'));
    setFotos(todas.map(grande));
    setAbierta(todas.indexOf(img));
  };

  return (
    <>
      <div ref={caja} className="instructions-content" onClick={tocar} dangerouslySetInnerHTML={{ __html: html }} />
      {abierta !== null && fotos[abierta] && (
        <div className="visor-fotos" role="dialog" aria-label="Foto">
          <div className="flex items-center justify-between px-4 py-3 text-white text-[15px]">
            <span>Foto {abierta + 1} de {fotos.length}</span>
            <button
              type="button"
              onClick={() => setAbierta(null)}
              aria-label="Cerrar"
              className="w-11 h-11 rounded-full bg-white/15 text-2xl leading-none"
            >
              ×
            </button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-2" onClick={() => setAbierta(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotos[abierta]} alt={`Foto ${abierta + 1}`} onClick={(e) => e.stopPropagation()} onError={(e) => { const o = caja.current?.querySelectorAll('img')[abierta]?.dataset.original; if (o && e.currentTarget.src !== o) e.currentTarget.src = o; }} />
          </div>
          <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-8">
            <button
              type="button"
              disabled={abierta === 0}
              onClick={() => setAbierta(abierta - 1)}
              className="min-h-[50px] rounded-xl bg-white text-gray-900 font-semibold text-base disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={abierta === fotos.length - 1}
              onClick={() => setAbierta(abierta + 1)}
              className="min-h-[50px] rounded-xl bg-white text-gray-900 font-semibold text-base disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </>
  );
}
