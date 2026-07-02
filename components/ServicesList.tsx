'use client';

import { useState } from 'react';
import type { AvailableService } from '@/lib/db';

type ItemStatus = 'idle' | 'loading' | 'requested' | 'taken' | 'error';

interface ServicesListProps {
  token: string;
  cleanerName: string | null;
  city: string | null;
  services: AvailableService[];
}

function cityLabel(city: string | null): string {
  return (city || '').replace(/_/g, ' ');
}

// Fechas permitidas: día actual, mañana y pasado mañana (hora de Toronto).
// value = YYYY-MM-DD, label = la fecha real (ej. "viernes, 19 de junio").
function dateOptions(): { value: string; label: string }[] {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  const base = new Date(`${today}T12:00:00Z`);
  return [0, 1, 2].map((d) => {
    const x = new Date(base);
    x.setUTCDate(x.getUTCDate() + d);
    const iso = x.toISOString().slice(0, 10);
    const label = x.toLocaleDateString('es-ES', {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return { value: iso, label };
  });
}

// Horas: cada 30 min, hasta las 5:00 p. m.
function timeOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let h = 6; h <= 17; h++) {
    for (const m of [0, 30]) {
      if (h === 17 && m > 0) break;
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const h12 = h % 12 || 12;
      out.push({ value: `${hh}:${mm}`, label: `${h12}:${mm} ${h >= 12 ? 'p. m.' : 'a. m.'}` });
    }
  }
  return out;
}

export default function ServicesList({ token, cleanerName, city, services }: ServicesListProps) {
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [proposedFor, setProposedFor] = useState<Record<string, boolean>>({});

  // Pop-up de reconfirmación al aceptar (evita accepts accidentales al navegar)
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  // Modal "otro horario"
  const [timeModalFor, setTimeModalFor] = useState<string | null>(null);
  const [proposedDate, setProposedDate] = useState('');
  const [proposedTime, setProposedTime] = useState('');
  const [submittingTime, setSubmittingTime] = useState(false);
  const [timeError, setTimeError] = useState('');

  const request = async (eventId: string) => {
    setStatuses((s) => ({ ...s, [eventId]: 'loading' }));
    try {
      const res = await fetch('/api/servicios/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, teamup_event_id: eventId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatuses((s) => ({ ...s, [eventId]: 'error' }));
        setMessages((m) => ({ ...m, [eventId]: data.error || 'No se pudo solicitar.' }));
        return;
      }
      if (data.outcome === 'success') {
        setStatuses((s) => ({ ...s, [eventId]: 'requested' }));
        setMessages((m) => ({ ...m, [eventId]: data.message || '' }));
      } else if (data.outcome === 'already_assigned') {
        setStatuses((s) => ({ ...s, [eventId]: 'taken' }));
        setMessages((m) => ({ ...m, [eventId]: data.message || 'Este servicio ya fue tomado.' }));
      } else {
        setStatuses((s) => ({ ...s, [eventId]: 'error' }));
        setMessages((m) => ({ ...m, [eventId]: data.message || 'No se pudo solicitar.' }));
      }
    } catch {
      setStatuses((s) => ({ ...s, [eventId]: 'error' }));
      setMessages((m) => ({ ...m, [eventId]: 'Error de conexión. Intenta de nuevo.' }));
    }
  };

  const openTimeModal = (eventId: string) => {
    setTimeModalFor(eventId);
    setProposedDate('');
    setProposedTime('');
    setTimeError('');
  };

  const submitProposedTime = async () => {
    if (!timeModalFor) return;
    if (!proposedDate || !proposedTime) {
      setTimeError('Selecciona la fecha y la hora.');
      return;
    }
    setTimeError('');
    setSubmittingTime(true);
    try {
      const res = await fetch('/api/servicios/propose-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          teamup_event_id: timeModalFor,
          proposed_date: proposedDate,
          proposed_time: proposedTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTimeError(data.error || 'No se pudo enviar tu propuesta.');
        return;
      }
      setProposedFor((p) => ({ ...p, [timeModalFor]: true }));
      setTimeModalFor(null);
    } catch {
      setTimeError('Error de conexión. Por favor intenta de nuevo.');
    } finally {
      setSubmittingTime(false);
    }
  };

  if (services.length === 0) {
    return (
      <div className="mt-6 p-6 bg-gray-50 rounded-xl border border-gray-200 text-center">
        <div className="text-3xl">📭</div>
        <p className="text-gray-700 font-medium mt-2">No hay servicios disponibles ahora mismo.</p>
        <p className="text-sm text-gray-500 mt-1">Vuelve a abrir este link más tarde.</p>
      </div>
    );
  }

  const confirmSvc = confirmFor ? services.find((s) => s.teamup_event_id === confirmFor) : null;
  const confirmFecha = confirmSvc
    ? [confirmSvc.service_date_text, confirmSvc.service_time_text].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="space-y-4">
      {services.map((svc) => {
        const id = svc.teamup_event_id;
        const status = statuses[id] || 'idle';
        const msg = messages[id] || '';
        const proposed = !!proposedFor[id];
        // Último minuto a <1h del inicio (o ya empezado): se deshabilita tomarlo en el
        // horario original; solo queda "puedo en otro horario".
        const originalDisabled = !!svc.last_min && !!svc.menos_1h;

        return (
          <div
            key={id}
            className={`rounded-xl border p-4 ${
              status === 'requested'
                ? 'border-green-300 bg-green-50'
                : status === 'taken'
                ? 'border-gray-300 bg-gray-100'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900">{svc.name || 'Servicio'}</h3>
                {svc.cleaning_type && (
                  <p className="text-sm text-gray-500">{svc.cleaning_type}</p>
                )}
              </div>
              {svc.vacuum_required && (
                <span className="shrink-0 text-xs font-medium bg-amber-100 text-amber-800 rounded-full px-2 py-1">
                  🖲 Aspiradora
                </span>
              )}
            </div>

            <div className="mt-3 space-y-1 text-sm text-gray-700">
              {svc.address && <p>📍 {svc.address}</p>}
              {(svc.service_date_text || svc.service_time_text) && (
                <p>
                  📅 {svc.service_date_text || ''}
                  {svc.service_time_text ? ` · ${svc.service_time_text}` : ''}
                </p>
              )}
              {svc.hours && <p>⏱️ {svc.hours} hora{Number(svc.hours) !== 1 ? 's' : ''}</p>}
              {svc.frequency && <p>🔁 {svc.frequency}</p>}
            </div>

            <div className="mt-4">
              {status === 'requested' ? (
                <p className="text-green-800 font-semibold">✅ {msg || '¡Servicio solicitado!'}</p>
              ) : status === 'taken' ? (
                <p className="text-gray-600 font-medium">🔒 {msg || 'Este servicio ya fue tomado.'}</p>
              ) : (
                <div className="space-y-2">
                  {originalDisabled ? (
                    <p className="text-center text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3">
                      ⏰ Ya no se puede tomar en el horario original (falta menos de 1 hora).
                      Si puedes llegar más tarde, propón otro horario 👇
                    </p>
                  ) : (
                    <button
                      onClick={() => setConfirmFor(id)}
                      disabled={status === 'loading'}
                      className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold rounded-xl text-base transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {status === 'loading' ? (
                        <span className="animate-spin text-lg">⟳</span>
                      ) : (
                        'Solicitar este servicio'
                      )}
                    </button>
                  )}

                  {/* "Otro horario" solo para cancelados de último minuto. Los declinados
                      solo se pueden tomar en su horario original (§13 de la guía). */}
                  {svc.last_min &&
                    (proposed ? (
                      <p className="text-center text-sm text-blue-700 font-medium">
                        🕐 Propuesta de horario enviada al equipo
                      </p>
                    ) : (
                      <button
                        onClick={() => openTimeModal(id)}
                        disabled={status === 'loading'}
                        className="w-full py-2.5 px-6 bg-white hover:bg-blue-50 active:bg-blue-100 text-blue-700 font-semibold rounded-xl text-sm border border-blue-300 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        🕐 Puedo, pero en otro horario
                      </button>
                    ))}

                  {status === 'error' && msg && (
                    <p className="text-sm text-red-600 text-center">{msg}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <p className="text-center text-xs text-gray-400 pt-2">
        {cleanerName ? `${cleanerName} · ` : ''}
        {cityLabel(city)}
      </p>

      {confirmFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmFor(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-blue-700">Confirma que puedes llegar</h3>
            <p className="text-sm text-gray-700">
              Estás aceptando este servicio para el{' '}
              <span className="font-bold bg-blue-50 text-blue-700 rounded px-1">
                {confirmFecha || 'la fecha indicada'}
              </span>
              .
            </p>
            <p className="text-sm text-gray-700">
              Debes llegar <strong>exactamente ese día y a esa hora</strong>.
            </p>

            <div className="rounded-xl border border-red-200 bg-red-50 py-3 px-3 text-center">
              <p className="text-sm text-gray-600 mb-1">Se aceptará en nombre de:</p>
              <p className="text-2xl font-extrabold text-red-600 leading-tight break-words">
                {cleanerName || 'ti'}
              </p>
            </div>

            <div className="rounded-md border-l-4 border-orange-500 bg-orange-50 px-3 py-2.5 text-sm font-bold text-gray-800">
              Si tú no eres la cleaner {cleanerName || 'indicada'}, por favor comunícate con nosotros.
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirmFor(null)}
                className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const id = confirmFor;
                  setConfirmFor(null);
                  request(id);
                }}
                className="flex-1 py-2.5 px-4 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                ✓ Sí, confirmo
              </button>
            </div>
          </div>
        </div>
      )}

      {timeModalFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !submittingTime && setTimeModalFor(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900">¿Qué día y hora podrías llegar?</h3>
            <p className="text-sm text-gray-500">
              Elige cuándo sí podrías hacer este servicio. El equipo coordinará con el cliente.
            </p>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Fecha</span>
                <select
                  value={proposedDate}
                  onChange={(e) => setProposedDate(e.target.value)}
                  disabled={submittingTime}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-base bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                >
                  <option value="">Selecciona una fecha…</option>
                  {dateOptions().map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Hora (hasta las 5:00 p. m.)</span>
                <select
                  value={proposedTime}
                  onChange={(e) => setProposedTime(e.target.value)}
                  disabled={submittingTime}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-base bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                >
                  <option value="">Selecciona una hora…</option>
                  {timeOptions().map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {timeError && <p className="text-sm text-red-600">{timeError}</p>}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setTimeModalFor(null)}
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
