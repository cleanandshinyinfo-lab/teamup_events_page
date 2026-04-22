'use client';

import { useEffect } from 'react';

interface InstructionsSectionProps {
  html: string | null;
}

/**
 * Renders pre-sanitized HTML instructions (sanitization happens server-side
 * via lib/sanitize.ts before reaching this component).
 */
export default function InstructionsSection({ html }: InstructionsSectionProps) {
  useEffect(() => {
    if (html && typeof window !== 'undefined' && window.location.hash === '#instrucciones') {
      document.getElementById('instrucciones')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [html]);

  if (!html) {
    return (
      <div className="text-gray-500 text-center py-8">
        No hay instrucciones especiales.
      </div>
    );
  }

  return <div className="instructions-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
