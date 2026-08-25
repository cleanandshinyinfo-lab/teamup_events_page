'use client';

import { useState } from 'react';
import { isAmbiguousMutationError, type PendingChangeRequest, type ResolvedChangeRequest } from '@/lib/scheduleChangeTypes';
import ProposeTimeModal from './ProposeTimeModal';

type ChangeRequest = PendingChangeRequest | ResolvedChangeRequest;

interface ChangeRequestCardProps {
  token: string;
  request: ChangeRequest;
  /** Se llama tras cualquier acción exitosa, o cuando el backend dice que el
   *  estado ya cambió por otra vía (409 REQUEST_ALREADY_RESOLVED / CONFLICT_DETECTED),
   *  para que el padre refresque la lista con el estado real. */
  onChanged: () => void;
}

function isPending(r: ChangeRequest): r is PendingChangeRequest {
  return r.status === 'pendiente';
}

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  aceptada: { text: '✅ Aceptada', className: 'bg-green-100 text-green-800' },
  rechazada: { text: '❌ Rechazada', className: 'bg-red-100 text-red-700' },
  propuesta_alternativa: { text: '🕐 Propusiste otro horario', className: 'bg-blue-100 text-blue-700' },
  error_teamup: { text: '⚠️ Error al aplicar el cambio', className: 'bg-orange-100 text-orange-800' },
  cancelada: { text: '🚫 Cancelada por el equipo', className: 'bg-gray-200 text-gray-700' },
};

function formatDecidedAt(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function conflictEventLabel(kind: string): string {
  return kind === 'absence' ? 'No disponible' : 'Servicio programado';
}

/**
 * I4 (code review): si el chequeo contra TeamUp falló, el backend NO debe
 * decir "hay conflicto" — pero mientras el fix está en curso del lado de
 * Backend, esta función reconoce cualquiera de las formas plausibles en que
 * puede señalarlo, para nunca pintar el bloque rojo de conflicto en ese caso.
 * `block_reason` es la señal más confiable (ya forma parte del contrato
 * §3.3 desde el inicio); las otras son defensivas sobre `conflict`.
 */
function isCheckUnavailable(
  conflict: PendingChangeRequest['conflict'],
  blockReason: string | null,
): boolean {
  if (blockReason === 'AVAILABILITY_CHECK_UNAVAILABLE') return true;
  if (!conflict) return false;
  if (conflict.source === 'unavailable') return true;
  if (conflict.check_failed === true) return true;
  if (conflict.conflict_reason === 'CHECK_UNAVAILABLE') return true;
  return false;
}

export default function ChangeRequestCard({ token, request, onChanged }: ChangeRequestCardProps) {
  const [actionState, setActionState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [actionError, setActionError] = useState('');
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showProposeModal, setShowProposeModal] = useState(false);

  const busy = actionState === 'loading';

  // Trata como "resuelta desde otra vía" cualquier respuesta que indique que
  // la solicitud ya no está pendiente, sin importar la acción que se intentó.
  const handleStaleState = (message: string) => {
    setActionError(message);
    onChanged();
  };

  // A2 (code review): NETWORK_ERROR/BAD_RESPONSE del proxy significan "el
  // fetch entre Next y el backend se cortó (timeout u otra falla de red)",
  // NO "la acción no se aplicó" — el backend puede haber terminado igual
  // (p. ej. el PUT a TeamUp del accept). Nunca afirmar un fallo aquí: mismo
  // mensaje neutro + refresh que usa el catch{} de abajo para fallas de red
  // del propio fetch al proxy.
  const handleAmbiguousOutcome = () => {
    setActionError('No pudimos confirmar el resultado. Actualizando para mostrarte el estado real…');
    onChanged();
  };

  const doAccept = async () => {
    setActionState('loading');
    setActionError('');
    try {
      const res = await fetch('/api/cambios/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: request.id, token }),
      });
      const data = await res.json();
      if (!data.ok) {
        setActionState('error');
        if (data.error_code === 'REQUEST_ALREADY_RESOLVED') {
          handleStaleState('Esta solicitud ya fue resuelta. Actualizamos la lista con el estado real.');
        } else if (data.error_code === 'CONFLICT_DETECTED' || data.error_code === 'SERVICE_CHANGED_SINCE_REQUEST') {
          handleStaleState(
            data.message || 'Ya no puedes aceptar este horario. Actualizamos la lista con el estado real.',
          );
        } else if (isAmbiguousMutationError(data.error_code)) {
          handleAmbiguousOutcome();
        } else if (data.error_code === 'AVAILABILITY_CHECK_UNAVAILABLE') {
          setActionError('No pudimos verificar tu disponibilidad ahora mismo. Intenta de nuevo en un momento.');
        } else if (data.error_code === 'TEAMUP_WRITE_FAILED' || data.error_code === 'SERIES_INTEGRITY_FAILED') {
          setActionError(
            'No se pudo aplicar el cambio en el calendario. Nuestro equipo ya fue alertado y te contactará.',
          );
        } else if (data.error_code === 'RATE_LIMITED') {
          setActionError('Demasiados intentos. Espera un momento y vuelve a intentar.');
        } else {
          setActionError(data.message || 'No se pudo aceptar. Intenta de nuevo.');
        }
        return;
      }
      setActionState('idle');
      setConfirmAccept(false);
      onChanged();
    } catch {
      // Un fetch fallido aquí NO significa que el accept no se aplicó: la
      // función serverless de Vercel puede cortarse (I3, code review) después
      // de que el backend ya escribió en TeamUp. Nunca decir "no se pudo".
      setActionState('error');
      handleAmbiguousOutcome();
    }
  };

  const doReject = async () => {
    setActionState('loading');
    setActionError('');
    try {
      const res = await fetch('/api/cambios/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: request.id, token, reason: rejectReason.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.ok) {
        setActionState('error');
        if (data.error_code === 'REQUEST_ALREADY_RESOLVED') {
          handleStaleState('Esta solicitud ya fue resuelta. Actualizamos la lista con el estado real.');
        } else if (isAmbiguousMutationError(data.error_code)) {
          handleAmbiguousOutcome();
        } else if (data.error_code === 'RATE_LIMITED') {
          setActionError('Demasiados intentos. Espera un momento y vuelve a intentar.');
        } else {
          setActionError(data.message || 'No se pudo rechazar. Intenta de nuevo.');
        }
        return;
      }
      setActionState('idle');
      setShowRejectForm(false);
      onChanged();
    } catch {
      // Mismo motivo que en doAccept: un fetch fallido no confirma que el
      // rechazo no se guardó del lado del servidor.
      setActionState('error');
      handleAmbiguousOutcome();
    }
  };

  if (!isPending(request)) {
    const label = STATUS_LABEL[request.status] || { text: request.status, className: 'bg-gray-100 text-gray-700' };
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 opacity-90">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-800">{request.client_name || 'Cliente'}</p>
          <span className={`shrink-0 text-xs font-medium rounded-full px-2 py-1 ${label.className}`}>
            {label.text}
          </span>
        </div>
        {request.requested_datetime_text && (
          <p className="mt-2 text-sm text-gray-600">📅 Solicitó: {request.requested_datetime_text}</p>
        )}
        {request.decision_note && (
          <p className="mt-1 text-sm text-gray-600 italic">&quot;{request.decision_note}&quot;</p>
        )}
        {request.decided_at && (
          <p className="mt-2 text-xs text-gray-400">Resuelto el {formatDecidedAt(request.decided_at)}</p>
        )}
      </div>
    );
  }

  const conflict = request.conflict;
  const checkUnavailable = isCheckUnavailable(conflict, request.block_reason);
  // El chequeo caído NUNCA se muestra como conflicto real, aunque el backend
  // mande has_conflict:true (I4) — fail-closed sigue vigente porque
  // request.can_accept ya viene en false desde el servidor en ese caso.
  const hasConflict = !checkUnavailable && !!conflict?.has_conflict;

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-900">{request.client_name || 'Cliente'}</p>
        <span className="shrink-0 text-xs font-bold bg-amber-200 text-amber-900 rounded-full px-2 py-1">
          Pendiente
        </span>
      </div>
      {request.service_address && <p className="mt-1 text-sm text-gray-600">📍 {request.service_address}</p>}
      {request.client_note && (
        <p className="mt-2 text-sm text-gray-700 bg-white/70 border border-amber-200 rounded-lg px-3 py-2">
          &quot;{request.client_note}&quot;
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
        <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
          <p className="text-xs text-gray-400 font-medium">Horario actual</p>
          <p className="text-gray-800 font-medium">{request.current_datetime_text || '—'}</p>
        </div>
        <div className="rounded-lg bg-white border border-blue-200 px-3 py-2">
          <p className="text-xs text-blue-500 font-medium">Horario solicitado por el cliente</p>
          <p className="text-blue-800 font-semibold">{request.requested_datetime_text || '—'}</p>
        </div>
      </div>

      {hasConflict && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-red-700">
            ⚠️ Ese horario choca con otro compromiso tuyo
          </p>
          <ul className="mt-1.5 space-y-1">
            {(conflict?.events || []).map((ev) => (
              <li key={ev.teamup_event_id} className="text-xs text-red-700">
                {conflictEventLabel(ev.kind)}
                {ev.title ? ` — ${ev.title}` : ''}
                {ev.all_day ? ' (todo el día)' : ''}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-red-600">
            No puedes aceptar este horario. Elige &quot;Rechazar&quot; o &quot;Proponer otro horario&quot;.
          </p>
        </div>
      )}
      {checkUnavailable && (
        <div className="mt-3 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-orange-700">
            ⚠️ No pudimos verificar tu disponibilidad
          </p>
          <p className="mt-1 text-xs text-orange-700">
            No podemos confirmar si ese horario choca con algo en tu calendario ahora mismo — por
            eso no puedes aceptar todavía. Usa &quot;Rechazar&quot; o &quot;Proponer otro horario&quot;, o
            vuelve a abrir este enlace en un momento.
          </p>
        </div>
      )}
      {!hasConflict && !checkUnavailable && request.block_reason && (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">
          Por ahora no puedes aceptar este horario. Contacta a nuestro equipo si crees que es un
          error.
        </div>
      )}

      {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}

      <div className="mt-4 space-y-2">
        {confirmAccept ? (
          <div className="rounded-lg border border-green-300 bg-white p-3 space-y-2">
            <p className="text-sm text-gray-700">
              ¿Confirmas el nuevo horario:{' '}
              <strong>{request.requested_datetime_text}</strong>?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmAccept(false)}
                disabled={busy}
                className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-sm disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={doAccept}
                disabled={busy}
                className="flex-1 py-2 px-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold rounded-lg text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy ? <span className="animate-spin">⟳</span> : '✓ Sí, confirmar'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmAccept(true)}
            disabled={busy || !request.can_accept}
            className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold rounded-xl text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Aceptar nuevo horario
          </button>
        )}

        {showRejectForm ? (
          <div className="rounded-lg border border-red-200 bg-white p-3 space-y-2">
            <label className="block">
              <span className="text-xs text-gray-500">Motivo (opcional)</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
                disabled={busy}
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 disabled:opacity-60"
                placeholder="Ej: Ese día tengo otro compromiso"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectForm(false)}
                disabled={busy}
                className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-sm disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={doReject}
                disabled={busy}
                className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold rounded-lg text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy ? <span className="animate-spin">⟳</span> : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowRejectForm(true)}
            disabled={busy}
            className="w-full py-2.5 px-6 bg-white hover:bg-red-50 active:bg-red-100 text-red-600 font-semibold rounded-xl text-sm border border-red-300 transition-colors disabled:opacity-60"
          >
            Rechazar
          </button>
        )}

        <button
          onClick={() => setShowProposeModal(true)}
          disabled={busy}
          className="w-full py-2.5 px-6 bg-white hover:bg-blue-50 active:bg-blue-100 text-blue-700 font-semibold rounded-xl text-sm border border-blue-300 transition-colors disabled:opacity-60"
        >
          🕐 Proponer otro horario
        </button>
      </div>

      {showProposeModal && (
        <ProposeTimeModal
          token={token}
          request={request}
          onClose={() => setShowProposeModal(false)}
          onSubmitted={() => {
            setShowProposeModal(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
