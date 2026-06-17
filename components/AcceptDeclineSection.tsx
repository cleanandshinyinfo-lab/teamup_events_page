'use client';

import { useState } from 'react';
import type { InvitationSnapshot } from '@/lib/db';

type SectionStatus =
  | 'idle'
  | 'loading'
  | 'accepted'
  | 'assign_failed'
  | 'declined'
  | 'time_proposed'
  | 'already_responded'
  | 'error';

interface AcceptDeclineSectionProps {
  token: string;
  eventId: string;
  initialInvitation?: InvitationSnapshot | null;
  onAlreadyAssigned: () => void;
}

function deriveInitialState(snapshot?: InvitationSnapshot | null): { status: SectionStatus; message: string } {
  if (!snapshot) return { status: 'idle', message: '' };
  if (snapshot.status === 'accepted') return { status: 'already_responded', message: '✅ Ya aceptaste este servicio.' };
  if (snapshot.status === 'declined') return { status: 'already_responded', message: '❌ Ya rechazaste este servicio.' };
  return { status: 'idle', message: '' };
}

export default function AcceptDeclineSection({
  token,
  eventId,
  initialInvitation,
  onAlreadyAssigned,
}: AcceptDeclineSectionProps) {
  const initial = deriveInitialState(initialInvitation);
  const [status, setStatus] = useState<SectionStatus>(initial.status);
  const [message, setMessage] = useState(initial.message);
  const [lastAction, setLastAction] = useState<'accept' | 'decline' | null>(null);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [proposedTime, setProposedTime] = useState('');
  const [submittingTime, setSubmittingTime] = useState(false);
  const [timeError, setTimeError] = useState('');

  const respond = async (action: 'accept' | 'decline') => {
    setLastAction(action);
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

      if (action === 'accept') {
        if (data.outcome === 'already_assigned') {
          onAlreadyAssigned();
          return;
        }
        if (data.outcome === 'failed') {
          setStatus('assign_failed');
          setMessage(data.message || 'No se pudo asignar este servicio.');
          return;
        }
      }
      setStatus(action === 'accept' ? 'accepted' : 'declined');
      setMessage(data.message || '');
    } catch {
      setStatus('error');
      setMessage('Error de conexión. Por favor intenta de nuevo.');
    }
  };

  const submitProposedTime = async () => {
    const value = proposedTime.trim();
    if (!value) {
      setTimeError('Escribe a qué hora podrías llegar.');
      return;
    }
    setTimeError('');
    setSubmittingTime(true);
    try {
      const res = await fetch('/api/invite/propose-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, proposed_time: value }),
      });
      const data = await res.json();

      if (res.status === 409) {
        setShowTimeModal(false);
        setStatus('already_responded');
        setMessage(data.status === 'accepted' ? '✅ Ya aceptaste este servicio.' : '❌ Ya rechazaste este servicio.');
        return;
      }
      if (!res.ok) {
        setTimeError(data.error || 'No se pudo enviar tu propuesta.');
        return;
      }
      setShowTimeModal(false);
      setStatus('time_proposed');
      setMessage(data.message || '');
    } catch {
      setTimeError('Error de conexión. Por favor intenta de nuevo.');
    } finally {
      setSubmittingTime(false);
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
        <div className="text-4xl">✅</div>
        <p className="text-green-800 font-semibold text-lg">¡Servicio aceptado!</p>
        <p className="text-green-700 text-sm">{message || 'El equipo ha sido notificado. ¡Gracias!'}</p>
        <p className="text-xs text-green-600 mt-3">Este servicio desaparecerá de la lista en unos segundos...</p>
      </div>
    );
  }

  if (status === 'time_proposed') {
    return (
      <div className="mt-6 p-6 bg-blue-50 rounded-xl border border-blue-200 text-center space-y-2">
        <div className="text-4xl">🕐</div>
        <p className="text-blue-800 font-semibold text-lg">¡Propuesta enviada!</p>
        <p className="text-blue-700 text-sm">{message || 'Le avisamos al equipo a qué hora podrías llegar. Ellos coordinarán con el cliente.'}</p>
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

  if (status === 'assign_failed' || status === 'error') {
    const isAssignFailed = status === 'assign_failed';
    const actionLabel = lastAction === 'accept' ? 'Aceptar servicio' : 'Rechazar servicio';

    return (
      <div className={`mt-6 p-6 rounded-xl border space-y-3 ${isAssignFailed ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
        <div className="text-3xl text-center">{isAssignFailed ? '⚠️' : '❌'}</div>
        <p className={`font-semibold text-lg text-center ${isAssignFailed ? 'text-orange-800' : 'text-red-800'}`}>
          {isAssignFailed ? 'No se pudo asignar el servicio' : 'Error al procesar la respuesta'}
        </p>
        <div className={`text-sm rounded-lg p-4 space-y-1 ${isAssignFailed ? 'bg-orange-100 text-orange-900' : 'bg-red-100 text-red-900'}`}>
          {lastAction && (
            <p><span className="font-semibold">El cleaner intentó:</span> {actionLabel}</p>
          )}
          <p><span className="font-semibold">La respuesta del sistema fue:</span> {message || 'Sin mensaje'}</p>
          <p><span className="font-semibold">ID del servicio:</span> {eventId}</p>
        </div>
        <div className="text-center">
          <button
            onClick={() => setStatus('idle')}
            className={`text-sm underline ${isAssignFailed ? 'text-orange-700' : 'text-red-700'}`}
          >
            Intentar de nuevo
          </button>
        </div>
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

      <button
        onClick={() => {
          setProposedTime('');
          setTimeError('');
          setShowTimeModal(true);
        }}
        disabled={status === 'loading'}
        className="mt-3 w-full py-3 px-6 bg-white hover:bg-blue-50 active:bg-blue-100 text-blue-700 font-semibold rounded-xl text-base border border-blue-300 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        🕐 Puedo tomarlo, pero en otro horario
      </button>

      {showTimeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !submittingTime && setShowTimeModal(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900">¿A qué hora podrías llegar?</h3>
            <p className="text-sm text-gray-500">
              Escribe el horario al que sí podrías hacer este servicio. El equipo coordinará con el cliente.
            </p>
            <input
              type="text"
              value={proposedTime}
              onChange={(e) => setProposedTime(e.target.value)}
              placeholder="Ej: a las 2 pm, después de las 13:00..."
              autoFocus
              disabled={submittingTime}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitProposedTime();
              }}
            />
            {timeError && <p className="text-sm text-red-600">{timeError}</p>}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowTimeModal(false)}
                disabled={submittingTime}
                className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={submitProposedTime}
                disabled={submittingTime}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submittingTime ? <span className="animate-spin text-lg">⟳</span> : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
