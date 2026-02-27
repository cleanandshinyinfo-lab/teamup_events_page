'use client';

import { useState, useEffect } from 'react';

type SectionStatus = 'idle' | 'loading' | 'accepted' | 'declined' | 'already_responded' | 'error';

interface AcceptDeclineSectionProps {
  token: string;
}

export default function AcceptDeclineSection({ token }: AcceptDeclineSectionProps) {
  const [status, setStatus] = useState<SectionStatus>('idle');
  const [message, setMessage] = useState('');

  // Al montar, verificar si ya fue respondida
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`/api/invite/respond?token=${encodeURIComponent(token)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'accepted') { setStatus('already_responded'); setMessage('✅ Ya aceptaste este servicio.'); }
        if (data.status === 'declined') { setStatus('already_responded'); setMessage('❌ Ya rechazaste este servicio.'); }
      } catch { /* silent */ }
    }
    checkStatus();
  }, [token]);

  const respond = async (action: 'accept' | 'decline') => {
    setStatus('loading');
    try {
      const res = await fetch('/api/invite/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });
      const data = await res.json();

      if (res.status === 409) {
        setStatus('already_responded');
        setMessage(data.status === 'accepted' ? '✅ Ya aceptaste este servicio.' : '❌ Ya rechazaste este servicio.');
        return;
      }

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Error al procesar tu respuesta.');
        return;
      }

      setStatus(action === 'accept' ? 'accepted' : 'declined');
      setMessage(data.message || '');
    } catch {
      setStatus('error');
      setMessage('Error de conexión. Por favor intenta de nuevo.');
    }
  };

  if (status === 'already_responded') {
    return (
      <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
        <p className="text-gray-700 font-medium">{message}</p>
        <p className="text-sm text-gray-500 mt-1">Si tienes alguna pregunta, contacta al equipo.</p>
      </div>
    );
  }

  if (status === 'accepted') {
    return (
      <div className="mt-6 p-6 bg-green-50 rounded-xl border border-green-200 text-center space-y-2">
        <div className="text-4xl">🎉</div>
        <p className="text-green-800 font-semibold text-lg">¡Servicio aceptado!</p>
        <p className="text-green-700 text-sm">{message || 'El equipo ha sido notificado. ¡Gracias!'}</p>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div className="mt-6 p-6 bg-gray-50 rounded-xl border border-gray-200 text-center space-y-2">
        <div className="text-3xl">👋</div>
        <p className="text-gray-800 font-semibold text-lg">Servicio rechazado</p>
        <p className="text-gray-600 text-sm">{message || 'Gracias por avisarnos. El equipo buscará otra persona.'}</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200 text-center space-y-3">
        <p className="text-red-700 font-medium">{message}</p>
        <button
          onClick={() => setStatus('idle')}
          className="text-sm text-red-600 underline"
        >
          Intentar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-gray-200 pt-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">¿Puedes tomar este servicio?</h2>
      <p className="text-sm text-gray-500 mb-5">
        Por favor confirma tu disponibilidad para atender este cliente.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => respond('accept')}
          disabled={status === 'loading'}
          className="flex-1 py-3 px-6 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold rounded-xl text-base transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {status === 'loading' ? (
            <span className="animate-spin text-lg">⟳</span>
          ) : (
            <>✅ Sí, puedo tomar este servicio</>
          )}
        </button>
        <button
          onClick={() => respond('decline')}
          disabled={status === 'loading'}
          className="flex-1 py-3 px-6 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-700 font-semibold rounded-xl text-base transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          ❌ No puedo tomar este servicio
        </button>
      </div>
    </div>
  );
}
