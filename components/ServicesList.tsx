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

export default function ServicesList({ token, cleanerName, city, services }: ServicesListProps) {
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

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

  if (services.length === 0) {
    return (
      <div className="mt-6 p-6 bg-gray-50 rounded-xl border border-gray-200 text-center">
        <div className="text-3xl">📭</div>
        <p className="text-gray-700 font-medium mt-2">No hay servicios disponibles ahora mismo.</p>
        <p className="text-sm text-gray-500 mt-1">Vuelve a abrir este link más tarde.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {services.map((svc) => {
        const id = svc.teamup_event_id;
        const status = statuses[id] || 'idle';
        const msg = messages[id] || '';
        const done = status === 'requested' || status === 'taken';

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
                <>
                  <button
                    onClick={() => request(id)}
                    disabled={status === 'loading' || done}
                    className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold rounded-xl text-base transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {status === 'loading' ? (
                      <span className="animate-spin text-lg">⟳</span>
                    ) : (
                      'Solicitar este servicio'
                    )}
                  </button>
                  {status === 'error' && msg && (
                    <p className="mt-2 text-sm text-red-600 text-center">{msg}</p>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-center text-xs text-gray-400 pt-2">
        {cleanerName ? `${cleanerName} · ` : ''}
        {cityLabel(city)}
      </p>
    </div>
  );
}
