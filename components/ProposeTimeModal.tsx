'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  isAmbiguousMutationError,
  type AvailableSlot,
  type AvailableSlotsResult,
  type PendingChangeRequest,
} from '@/lib/scheduleChangeTypes';

interface ProposeTimeModalProps {
  token: string;
  request: PendingChangeRequest;
  onClose: () => void;
  /** Se llama cuando la propuesta se envió con éxito (el padre refresca la lista). */
  onSubmitted: () => void;
}

const MAX_DAYS_AHEAD = 120; // §3.7 del contrato

function todayLocalISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "2026-09-03T13:30:00" -> "13:30" (wall-clock del backend, sin tz del navegador). */
function slotTimeLabel(startLocal: string): string {
  return startLocal.slice(11, 16);
}

export default function ProposeTimeModal({ token, request, onClose, onSubmitted }: ProposeTimeModalProps) {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [slotsResult, setSlotsResult] = useState<AvailableSlotsResult | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Trae del backend SOLO los horarios sin solapamiento para el día elegido
  // (con el buffer de traslado 30/60 min ya aplicado). La UI nunca ofrece un
  // horario que chocaría; el envío se re-valida igual server-side (§3.6).
  const loadSlots = useCallback(
    async (forDate: string) => {
      setSlotsLoading(true);
      setSlotsError('');
      setSlotsResult(null);
      setSelectedSlot(null);
      try {
        const res = await fetch('/api/cambios/slots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, id: request.id, date: forDate }),
        });
        const data = await res.json();
        if (!data.ok) {
          setSlotsError(
            data.error_code === 'RATE_LIMITED'
              ? 'Demasiados intentos. Espera un momento antes de seguir probando fechas.'
              : data.error_code === 'AVAILABILITY_CHECK_UNAVAILABLE'
                ? 'No pudimos consultar tu calendario ahora mismo. Intenta de nuevo en un momento.'
                : data.message || 'No pudimos cargar tus horarios disponibles.',
          );
        } else {
          setSlotsResult(data as AvailableSlotsResult);
        }
      } catch {
        setSlotsError('Error de conexión al consultar tus horarios disponibles.');
      } finally {
        setSlotsLoading(false);
      }
    },
    [token, request.id],
  );

  useEffect(() => {
    if (!date) {
      setSlotsResult(null);
      setSlotsError('');
      setSelectedSlot(null);
      return;
    }
    loadSlots(date);
  }, [date, loadSlots]);

  const submit = async () => {
    if (!date || !selectedSlot) {
      setSubmitError('Selecciona la fecha y uno de los horarios disponibles.');
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
          proposed_start_local: selectedSlot.start_local,
          proposed_end_local: selectedSlot.end_local,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error_code === 'CONFLICT_DETECTED') {
          // El slot era libre al listarlo pero el calendario cambió en el
          // medio (§3.6: la re-validación server-side manda). Refrescar la
          // lista para que el horario ya tomado desaparezca de los chips.
          setSubmitError('Ese horario se acaba de ocupar en tu calendario. Elige otro.');
          loadSlots(date);
        } else if (data.error_code === 'REQUEST_ALREADY_RESOLVED') {
          setSubmitError('Esta solicitud ya fue resuelta.');
          onSubmitted();
        } else if (isAmbiguousMutationError(data.error_code)) {
          // A2 (code review): NETWORK_ERROR/BAD_RESPONSE del proxy no
          // confirman que la propuesta no se haya guardado. `onSubmitted`
          // cierra el modal y refresca; no tiene sentido setear
          // `submitError` porque el modal se desmonta en el mismo tick.
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
      // real en la card en vez de un "no se pudo" que podría ser falso.
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  const slots = slotsResult?.slots || [];
  const canSubmit = !!date && !!selectedSlot && !submitting;

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
          . Si no puedes, elige cuándo sí podrías. Te mostramos solo horarios que no chocan con
          tus otros compromisos (incluye tu tiempo de traslado). Le avisaremos al cliente; no se
          aplica automáticamente en tu calendario.
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

          {date && (
            <div>
              <span className="text-sm font-medium text-gray-700">Horarios disponibles</span>
              <div className="mt-1 rounded-lg border px-3 py-2.5 text-sm min-h-[2.5rem]">
                {slotsLoading ? (
                  <span className="text-gray-500 flex items-center gap-2">
                    <span className="animate-spin">⟳</span> Buscando tus horarios libres…
                  </span>
                ) : slotsError ? (
                  <div className="text-orange-600">
                    <p>{slotsError}</p>
                    <button
                      type="button"
                      onClick={() => loadSlots(date)}
                      className="mt-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : slotsResult?.all_day_absence ? (
                  <span className="text-red-700">
                    Ese día figuras como no disponible en tu calendario. Elige otra fecha.
                  </span>
                ) : slots.length === 0 ? (
                  <span className="text-red-700">
                    Ese día no tienes espacio libre para este servicio (contando tus traslados).
                    Elige otra fecha.
                  </span>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map((slot) => {
                        const selected = selectedSlot?.start_local === slot.start_local;
                        return (
                          <button
                            key={slot.start_local}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            disabled={submitting}
                            className={
                              selected
                                ? 'py-2 px-1 rounded-lg text-sm font-semibold bg-blue-600 text-white'
                                : 'py-2 px-1 rounded-lg text-sm font-medium bg-gray-100 text-gray-800 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60'
                            }
                          >
                            {slotTimeLabel(slot.start_local)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Horas de inicio libres, con {slotsResult?.buffer_minutes ?? 30} min de
                      traslado antes y después.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

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
