import type { UpcomingService } from '@/lib/scheduleChangeTypes';

interface UpcomingServicesListProps {
  services: UpcomingService[];
}

/** Lista de solo lectura: servicios próximos del cleaner (ventana +30 días). */
export default function UpcomingServicesList({ services }: UpcomingServicesListProps) {
  if (services.length === 0) {
    return (
      <div className="p-6 bg-white rounded-xl border border-gray-200 text-center">
        <div className="text-3xl">🗓️</div>
        <p className="text-gray-700 font-medium mt-2">No tienes servicios próximos agendados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {services.map((svc) => (
        <div
          key={svc.teamup_event_id}
          className="rounded-xl border border-gray-200 bg-white p-3.5 text-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-gray-900">{svc.client_name || 'Servicio'}</p>
            {svc.has_open_change_request && (
              <span className="shrink-0 text-xs font-medium bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                Cambio pendiente
              </span>
            )}
          </div>
          <div className="mt-1 space-y-0.5 text-gray-600">
            {svc.datetime_text && <p>📅 {svc.datetime_text}</p>}
            {svc.address && <p>📍 {svc.address}</p>}
            {svc.cleaning_type && <p>🧽 {svc.cleaning_type}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
