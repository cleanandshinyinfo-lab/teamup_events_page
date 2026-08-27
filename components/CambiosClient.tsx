'use client';

import { useCallback, useState } from 'react';
import type {
  CleanerScheduleData,
  PendingChangeRequest,
  ResolvedChangeRequest,
} from '@/lib/scheduleChangeTypes';
import ChangeRequestCard from './ChangeRequestCard';

interface CambiosClientProps {
  token: string;
  initialData: CleanerScheduleData;
}

export default function CambiosClient({ token, initialData }: CambiosClientProps) {
  const [pending, setPending] = useState<PendingChangeRequest[]>(initialData.pending_requests);
  const [resolved, setResolved] = useState<ResolvedChangeRequest[]>(initialData.resolved_requests);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  // Se llama después de cada acción (aceptar/rechazar/proponer) y también
  // cuando una acción falla con REQUEST_ALREADY_RESOLVED / CONFLICT_DETECTED:
  // el chequeo de disponibilidad y el estado de la solicitud son "en vivo",
  // así que la fuente de verdad después de cualquier intento es refrescar,
  // nunca asumir el resultado localmente (caso borde 12/13 del PM).
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError('');
    try {
      const res = await fetch(`/api/cambios/data?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        // A5 (code review): RATE_LIMITED (429) ahora se propaga con su
        // status real desde el proxy (ERROR_HTTP_STATUS en scheduleChangeTypes.ts);
        // acá se muestra un mensaje específico en vez del genérico.
        setRefreshError(
          data.error_code === 'RATE_LIMITED'
            ? 'Demasiados intentos. Espera un momento y vuelve a intentar.'
            : data.message || 'No se pudo actualizar la lista. Vuelve a intentar.',
        );
        return;
      }
      setPending(data.pending_requests);
      setResolved(data.resolved_requests);
    } catch {
      setRefreshError('Error de conexión al actualizar.');
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  const hasRequests = pending.length > 0 || resolved.length > 0;

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center gap-[9px] mb-3">
          <h2 className="text-[17px] font-bold text-[#16202b]">Solicitudes de cambio</h2>
          {pending.length > 0 && (
            <span className="text-[11.5px] font-bold bg-[#eef6fd] text-[#1b74c4] border border-[#dbeafc] rounded-full px-2.5 py-1">
              {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
            </span>
          )}
          {refreshing && <span className="text-xs text-[#7a8899] animate-pulse">Actualizando…</span>}
        </div>

        {refreshError && (
          <p className="text-sm text-red-600 mb-2">
            {refreshError}{' '}
            <button onClick={refresh} className="underline font-medium">
              Reintentar
            </button>
          </p>
        )}

        {!hasRequests ? (
          <div className="p-6 bg-white rounded-[14px] border border-[#d7dee6] text-center">
            <p className="text-[#48586a] font-medium">
              No tienes solicitudes de cambio de horario por ahora.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((r) => (
              <ChangeRequestCard key={r.id} token={token} request={r} onChanged={refresh} />
            ))}
            {resolved.map((r) => (
              <ChangeRequestCard key={r.id} token={token} request={r} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
