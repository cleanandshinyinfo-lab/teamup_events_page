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

// Diseño propuesta-cambios-horario.html: sin emojis en estados, colores de
// marca; verde y rojo quedan reservados a los botones de aceptar/rechazar.
const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  aceptada: { text: 'Aceptada', className: 'bg-[#eef6fd] text-[#1b74c4] border border-[#dbeafc]' },
  rechazada: { text: 'Rechazada', className: 'bg-[#eef1f5] text-[#48586a]' },
  propuesta_alternativa: { text: 'Propusiste otro horario', className: 'bg-[#eef6fd] text-[#1b74c4] border border-[#dbeafc]' },
  error_teamup: { text: 'Error al aplicar el cambio', className: 'bg-orange-100 text-orange-800' },
  cancelada: { text: 'Cancelada por el equipo', className: 'bg-[#eef1f5] text-[#48586a]' },
};

// Formato corto para la tarjeta ("sáb 29 ago" · "10:00 am"); el formato largo
// queda para mensajes y confirmaciones (regla del mockup). Se parsea el
// wall-clock del backend directamente — nunca con el tz del navegador.
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function shortDateParts(wallClock: string | null | undefined): { date: string; time: string } | null {
  if (!wallClock) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wallClock);
  if (!m) return null;
  const [, y, mo, d, h, min] = m;
  const dow = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
  const h24 = Number(h);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    date: `${DIAS[dow]} ${Number(d)} ${MESES[Number(mo) - 1]}`,
    time: `${h12}:${min} ${h24 >= 12 ? 'pm' : 'am'}`,
  };
}

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
    const label = STATUS_LABEL[request.status] || { text: request.status, className: 'bg-[#eef1f5] text-[#48586a]' };
    return (
      <div className="rounded-[14px] border border-[#d7dee6] bg-white p-4 opacity-95">
        <div className="flex items-start justify-between gap-2">
          <p className="font-bold text-[#16202b]">{request.client_name || 'Cliente'}</p>
          <span className={`shrink-0 text-[11px] font-bold rounded-full px-2.5 py-1 ${label.className}`}>
            {label.text}
          </span>
        </div>
        {request.current_datetime_text && (
          <p className="mt-2 text-sm text-[#48586a]">Horario actual: {request.current_datetime_text}</p>
        )}
        {request.requested_datetime_text && (
          <p className="mt-1 text-sm text-[#48586a]">Solicitó: {request.requested_datetime_text}</p>
        )}
        {request.status === 'propuesta_alternativa' && (request.proposed_datetime_text || request.proposed_start_local) && (
          <p className="mt-1 text-sm text-[#0f4d84] font-semibold">
            Propusiste: {request.proposed_datetime_text || request.proposed_start_local}
          </p>
        )}
        {request.decision_note && (
          <p className="mt-1 text-sm text-[#48586a] italic">&quot;{request.decision_note}&quot;</p>
        )}
        {request.decided_at && (
          <p className="mt-2 text-xs text-[#7a8899]">Resuelto el {formatDecidedAt(request.decided_at)}</p>
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

  const currentShort = shortDateParts(request.current_start_local);
  const requestedShort = shortDateParts(request.requested_start_local);

  return (
    <div>
      <div className="rounded-[14px] border border-[#d7dee6] bg-white overflow-hidden shadow-[0_1px_2px_rgba(22,32,43,0.05)]">
        {/* Cabecera azul de marca */}
        <div className="bg-[#1b74c4] px-3.5 py-3 flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <p className="text-white font-bold text-[15px] leading-tight">{request.client_name || 'Cliente'}</p>
            {request.service_address && (
              <p className="text-[#cfe6fb] text-xs mt-0.5">{request.service_address}</p>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-bold tracking-wide bg-white text-[#1b74c4] rounded-full px-2.5 py-1">
            Pendiente
          </span>
        </div>

        {/* Original → solicitado en una sola fila */}
        <div className="grid grid-cols-[1fr_24px_1fr] items-start gap-1.5 px-3.5 py-4">
          <div className="opacity-60">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#7a8899] mb-1.5 min-h-[26px] leading-tight">
              Horario original
            </p>
            <p className="text-[14.5px] font-bold text-[#16202b] leading-tight line-through decoration-[#d7dee6]">
              {currentShort?.date || request.current_datetime_text || '—'}
            </p>
            {currentShort && <p className="text-[12.5px] text-[#48586a] mt-0.5">{currentShort.time}</p>}
          </div>
          <div className="flex items-center justify-center text-[#1b74c4] text-lg font-bold mt-[26px]">→</div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#1b74c4] mb-1.5 min-h-[26px] leading-tight">
              Horario solicitado
            </p>
            <p className="text-[14.5px] font-bold text-[#0f4d84] leading-tight">
              {requestedShort?.date || request.requested_datetime_text || '—'}
            </p>
            {requestedShort && <p className="text-[12.5px] text-[#48586a] mt-0.5">{requestedShort.time}</p>}
          </div>
        </div>

        {/* Motivo / explicación del cliente */}
        {request.client_note && (
          <div className="border-t border-[#eef1f5] px-3.5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#1b74c4] mb-1">
              Detalle de la solicitud
            </p>
            <p className="text-[13.5px] leading-relaxed text-[#48586a]">{request.client_note}</p>
          </div>
        )}

        {hasConflict && (
          <div className="border-t border-[#eef1f5] px-3.5 py-3 bg-red-50">
            <p className="text-sm font-semibold text-red-700">Ese horario choca con otro compromiso tuyo</p>
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
          <div className="border-t border-[#eef1f5] px-3.5 py-3 bg-orange-50">
            <p className="text-sm font-semibold text-orange-700">No pudimos verificar tu disponibilidad</p>
            <p className="mt-1 text-xs text-orange-700">
              No podemos confirmar si ese horario choca con algo en tu calendario ahora mismo — por
              eso no puedes aceptar todavía. Usa &quot;Rechazar&quot; o &quot;Proponer otro horario&quot;, o
              vuelve a abrir este enlace en un momento.
            </p>
          </div>
        )}
        {!hasConflict && !checkUnavailable && request.block_reason && (
          <div className="border-t border-[#eef1f5] px-3.5 py-3 bg-orange-50 text-xs text-orange-700">
            Por ahora no puedes aceptar este horario. Contacta a nuestro equipo si crees que es un
            error.
          </div>
        )}
      </div>

      {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}

      {/* Botones fuera de la tarjeta. Si no puede aceptar, el botón verde NO se
          muestra deshabilitado: el aviso de arriba explica por qué y quedan
          solo las acciones usables (regla del mockup). */}
      <div className="mt-3 grid gap-[9px]">
        {request.can_accept &&
          (confirmAccept ? (
            <div className="rounded-[11px] border border-[#cfe4f7] bg-white p-3 space-y-2">
              <p className="text-sm text-[#48586a]">
                ¿Confirmas el nuevo horario:{' '}
                <strong className="text-[#16202b]">{request.requested_datetime_text}</strong>?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmAccept(false)}
                  disabled={busy}
                  className="flex-1 py-2 px-3 bg-[#eef1f5] hover:bg-[#e2e8ef] text-[#48586a] font-semibold rounded-[11px] text-sm disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  onClick={doAccept}
                  disabled={busy}
                  className="flex-1 py-2 px-3 bg-[#34A853] hover:bg-[#2d9348] active:bg-[#27803f] text-white font-semibold rounded-[11px] text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {busy ? <span className="animate-spin">⟳</span> : 'Sí, confirmar'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmAccept(true)}
              disabled={busy}
              className="w-full py-3.5 px-4 bg-[#34A853] hover:bg-[#2d9348] active:bg-[#27803f] text-white font-semibold rounded-[11px] text-[15px] transition-colors shadow-[0_2px_6px_rgba(52,168,83,0.28)] disabled:opacity-60"
            >
              Aceptar el nuevo horario
            </button>
          ))}

        {showRejectForm ? (
          <div className="rounded-[11px] border border-[#f0c7c3] bg-white p-3 space-y-2">
            <label className="block">
              <span className="text-xs text-[#7a8899]">Motivo (opcional)</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
                disabled={busy}
                rows={2}
                className="mt-1 w-full rounded-[11px] border border-[#d7dee6] px-3 py-2 text-sm focus:border-[#d93025] focus:outline-none focus:ring-1 focus:ring-[#d93025] disabled:opacity-60"
                placeholder="Ej: Ese día tengo otro compromiso"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectForm(false)}
                disabled={busy}
                className="flex-1 py-2 px-3 bg-[#eef1f5] hover:bg-[#e2e8ef] text-[#48586a] font-semibold rounded-[11px] text-sm disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={doReject}
                disabled={busy}
                className="flex-1 py-2 px-3 bg-[#d93025] hover:bg-[#c22a20] active:bg-[#ab251c] text-white font-semibold rounded-[11px] text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy ? <span className="animate-spin">⟳</span> : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowRejectForm(true)}
            disabled={busy}
            className="w-full py-3.5 px-4 bg-white hover:bg-red-50 active:bg-red-100 text-[#d93025] font-semibold rounded-[11px] text-[15px] border-[1.5px] border-[#f0c7c3] transition-colors disabled:opacity-60"
          >
            Rechazar
          </button>
        )}

        <button
          onClick={() => setShowProposeModal(true)}
          disabled={busy}
          className="w-full py-3.5 px-4 bg-[#1b74c4]/[0.06] hover:bg-[#1b74c4]/[0.12] active:bg-[#1b74c4]/[0.18] text-[#1b74c4] font-semibold rounded-[11px] text-[15px] border-[1.5px] border-[#cfe4f7] transition-colors disabled:opacity-60"
        >
          Proponer otro horario
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
