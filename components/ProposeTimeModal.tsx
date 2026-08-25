'use client';

import { useEffect, useState } from 'react';
import { isAmbiguousMutationError, type AvailabilityCheckResult, type PendingChangeRequest } from '@/lib/scheduleChangeTypes';

interface ProposeTimeModalProps {
  token: string;
  request: PendingChangeRequest;
  onClose: () => void;
  /** Se llama cuando la propuesta se envió con éxito (el padre refresca la lista). */
  onSubmitted: () => void;
}

const DEBOUNCE_MS = 400;
/** Duración de respaldo si no se puede calcular la del servicio (minutos). */
const FALLBACK_DURATION_MIN = 180;
const MAX_DAYS_AHEAD = 120; // §3.7 del contrato

function parseLocalAsUtcForMath(s: string): Date {
  // Truco de aritmética: tratamos el wall-clock como si fuera UTC solo para
  // poder sumar minutos sin que el reloj del navegador (con su propia zona)
  // lo corra. Nunca se muestra este valor al usuario, solo se usa para
  // construir el end_local por defecto que espera el backend (mismo patrón
  // que ya usa app/api/servicios/propose-time/route.ts en este repo).
  return new Date(`${s.replace(' ', 'T').slice(0, 19)}Z`);
}

function durationMinutes(startLocal: string, endLocal: string | null): number {
  if (!endLocal) return FALLBACK_DURATION_MIN;
  const diff =
    (parseLocalAsUtcForMath(endLocal).getTime() - parseLocalAsUtcForMath(startLocal).getTime()) / 60000;
  return diff > 0 ? diff : FALLBACK_DURATION_MIN;
}

function addMinutesLocal(dateStr: string, timeStr: string, minutes: number): string {
  const base = new Date(`${dateStr}T${timeStr}:00Z`);
  base.setUTCMinutes(base.getUTCMinutes() + minutes);
  return base.toISOString().slice(0, 19); // "YYYY-MM-DDTHH:mm:ss"
}

function todayLocalISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ProposeTimeModal({ token, request, onClose, onSubmitted }: ProposeTimeModalProps) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [conflict, setConflict] = useState<AvailabilityCheckResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const svcDuration = durationMinutes(request.current_start_local, request.current_end_local);

  // Chequeo de disponibilidad en vivo (US-07) con debounce cada vez que
  // cambia fecha u hora. Re-validado igual en el servidor al enviar (caso
  // borde 7 del PM: nunca confiar solo en este chequeo del cliente).
  useEffect(() => {
    if (!date || !time) {
      setConflict(null);
      setCheckError('');
      return;
    }
    setChecking(true);
    setCheckError('');
    const startLocal = `${date}T${time}:00`;
    const endLocal = addMinutesLocal(date, time, svcDuration);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch('/api/cambios/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            teamup_event_id: request.teamup_event_id,
            start_local: startLocal,
            end_local: endLocal,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          setConflict(null);
          // A5 (code review): el chequeo en vivo es el endpoint con el límite
          // más estricto (strictLimiter, backend) — con el debounce de 400ms
          // es el más propenso a pegar contra RATE_LIMITED si el cleaner
          // cambia fecha/hora varias veces seguidas.
          setCheckError(
            data.error_code === 'RATE_LIMITED'
              ? 'Demasiados intentos. Espera un momento antes de seguir probando horarios.'
              : data.message || 'No pudimos verificar tu disponibilidad para ese horario.',
          );
        } else {
          setConflict(data as AvailabilityCheckResult);
        }
      } catch {
        setConflict(null);
        setCheckError('Error de conexión al verificar disponibilidad.');
      } finally {
        setChecking(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [date, time, token, request.teamup_event_id, svcDuration]);

  const submit = async () => {
    if (!date || !time) {
      setSubmitError('Selecciona la fecha y la hora.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/cambios/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: request.id,
          token,
          proposed_start_local: `${date}T${time}:00`,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error_code === 'CONFLICT_DETECTED') {
          setSubmitError('Ese horario choca con otro compromiso tuyo. Elige otro.');
          // Re-sincroniza el badge de conflicto con lo que decidió el servidor
          // (fuente de verdad, ver §3.6: re-validación server-side obligatoria).
          const events = (data.details?.events as AvailabilityCheckResult['events']) || [];
          setConflict({
            ok: true,
            has_conflict: true,
            buffer_minutes: (data.details?.buffer_minutes as number) ?? 0,
            checked_at: new Date().toISOString(),
            source: 'teamup',
            events,
          });
        } else if (data.error_code === 'REQUEST_ALREADY_RESOLVED') {
          setSubmitError('Esta solicitud ya fue resuelta.');
          onSubmitted();
        } else if (isAmbiguousMutationError(data.error_code)) {
          // A2 (code review): igual razonamiento que el catch{} de abajo —
          // NETWORK_ERROR/BAD_RESPONSE del proxy no confirman que la
          // propuesta no se haya guardado. `onSubmitted` cierra el modal y
          // refresca; no tiene sentido setear `submitError` porque el modal
          // se desmonta en el mismo tick.
          onSubmitted();
        } else if (data.error_code === 'AVAILABILITY_CHECK_UNAVAILABLE') {
          setSubmitError('No pudimos verificar tu disponibilidad ahora mismo. Intenta de nuevo en un momento.');
        } else if (data.error_code === 'RATE_LIMITED') {
          setSubmitError('Demasiados intentos. Espera un momento y vuelve a intentar.');
        } else {
          setSubmitError(data.message || 'No se pudo enviar tu propuesta.');
        }
        return;
      }
      onSubmitted();
    } catch {
      // No afirmar que falló: la función serverless puede haberse cortado
      // (Vercel, ver I3 del code review) después de que el backend ya
      // guardó la propuesta. `onSubmitted` cierra el modal Y dispara el
      // refresh del padre (CambiosClient.refresh) — el cleaner ve el estado
      // real en la card (pendiente si de verdad no se guardó, o resuelta si
      // sí) en vez de un mensaje de "no se pudo" que podría ser falso; por
      // eso aquí NO se setea `submitError`, que de todos modos no llegaría a
      // mostrarse porque el modal se desmonta en el mismo tick.
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  const hasConflict = !!conflict?.has_conflict;
  const canSubmit = !!date && !!time && !submitting && !hasConflict;

  const minDate = todayLocalISO();
  const maxDateObj = new Date();
  maxDateObj.setDate(maxDateObj.getDate() + MAX_DAYS_AHEAD);
  const maxDate = maxDateObj.toISOString().slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900">Proponer otro horario</h3>
        <p className="text-sm text-gray-500">
          El cliente pidió{' '}
          {request.requested_datetime_text ? (
            <strong>{request.requested_datetime_text}</strong>
          ) : (
            'un nuevo horario'
          )}
          . Si no puedes, elige cuándo sí podrías. Le avisaremos al cliente; no se aplica
          automáticamente en tu calendario.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Fecha</span>
            <input
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-base bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Hora</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={submitting}
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-base bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Nota (opcional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              disabled={submitting}
              rows={2}
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
              placeholder="Ej: Ese día sí puedo en la mañana"
            />
          </label>
        </div>

        {date && time && (
          <div className="rounded-lg border px-3 py-2.5 text-sm min-h-[2.5rem] flex items-center">
            {checking ? (
              <span className="text-gray-500 flex items-center gap-2">
                <span className="animate-spin">⟳</span> Verificando disponibilidad…
              </span>
            ) : hasConflict ? (
              <div className="text-red-700 w-full">
                <p className="font-semibold">⚠️ Ese horario choca con otro compromiso tuyo</p>
                <ul className="mt-1 space-y-0.5">
                  {(conflict?.events || []).map((ev) => (
                    <li key={ev.teamup_event_id} className="text-xs">
                      {ev.kind === 'absence' ? 'No disponible' : 'Servicio programado'}
                      {ev.title ? ` — ${ev.title}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : checkError ? (
              <span className="text-orange-600">
                {checkError} Puedes enviar igual; lo verificaremos de nuevo al procesar tu propuesta.
              </span>
            ) : (
              <span className="text-green-700">✓ Sin conflicto con tu calendario</span>
            )}
          </div>
        )}

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <span className="animate-spin text-lg">⟳</span> : 'Enviar propuesta'}
          </button>
        </div>
      </div>
    </div>
  );
}
