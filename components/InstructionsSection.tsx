'use client';

import { sanitizeHTML } from '@/lib/utils';

interface InstructionsSectionProps {
  html: string | null;
}

/**
 * Renders sanitized HTML instructions from Teamup
 * Preserves links, images, and formatting
 */
export default function InstructionsSection({ html }: InstructionsSectionProps) {
  if (!html) {
    return (
      <div className="text-gray-500 text-center py-8">
        No hay instrucciones especiales.
      </div>
    );
  }

  const cleanHTML = sanitizeHTML(html);

  return (
    <div className="instructions-content">
      <style jsx global>{`
        .instructions-content p {
          margin-bottom: 1rem;
          line-height: 1.6;
        }
        .instructions-content a {
          color: #00a8e8;
          text-decoration: underline;
          font-weight: 500;
        }
        .instructions-content a:hover {
          color: #0077b6;
        }
        .instructions-content img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 20px 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .instructions-content strong {
          color: #2c3e50;
          font-weight: 600;
        }
        .instructions-content ul,
        .instructions-content ol {
          margin-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .instructions-content li {
          margin-bottom: 0.5rem;
        }
        .instructions-content hr {
          margin: 1.5rem 0;
          border: none;
          border-top: 1px solid #dee2e6;
        }
        .instructions-content h1,
        .instructions-content h2,
        .instructions-content h3,
        .instructions-content h4 {
          color: #2c3e50;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          font-weight: 600;
        }
      `}</style>

      <div dangerouslySetInnerHTML={{ __html: cleanHTML }} />
    </div>
  );
}
