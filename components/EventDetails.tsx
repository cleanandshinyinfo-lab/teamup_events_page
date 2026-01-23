import { Event } from '@/lib/types';
import {
  formatDate,
  formatDuration,
  getCityDisplayName,
  getCityBadge,
  formatVacuumRequired,
  formatPhotosRequired,
} from '@/lib/utils';
import InfoBox from './InfoBox';
import InstructionsSection from './InstructionsSection';

interface EventDetailsProps {
  event: Event;
}

/**
 * Main component displaying all event details
 */
export default function EventDetails({ event }: EventDetailsProps) {
  const cityName = getCityDisplayName(event.city);
  const cityBadge = getCityBadge(event.city);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header with brand gradient */}
          <div className="bg-gradient-primary px-6 py-8">
            {cityBadge && (
              <div className="inline-block bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 mb-3">
                <span className="text-white text-sm font-medium">
                  {cityBadge} {cityName}
                </span>
              </div>
            )}

            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              {event.client_name || 'Evento de Limpieza'}
            </h1>

            {event.cleaning_type && (
              <p className="text-blue-100 text-lg">{event.cleaning_type}</p>
            )}
          </div>

          {/* Basic information */}
          <div className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <InfoBox
                icon="📍"
                label="Direccion"
                value={event.address}
              />
              <InfoBox
                icon="📅"
                label="Fecha y hora"
                value={formatDate(event.start_dt)}
              />
              <InfoBox
                icon="⏱️"
                label="Duracion"
                value={formatDuration(event.duration_hours)}
              />
              {event.frequency && (
                <InfoBox
                  icon="🔁"
                  label="Frecuencia"
                  value={event.frequency}
                />
              )}
              {event.requires_vacuum && (
                <InfoBox
                  icon="🧹"
                  label="Aspiradora"
                  value={formatVacuumRequired(event.requires_vacuum)}
                />
              )}
              {event.photos_required && (
                <InfoBox
                  icon="📸"
                  label="Fotos"
                  value={formatPhotosRequired(event.photos_required)}
                />
              )}
            </div>

            {/* Instructions section */}
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
                Instrucciones especiales
              </h2>
              <InstructionsSection html={event.description_html} />
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <div className="text-center text-gray-600">
              <p className="font-semibold text-lg text-primary">Clean and Shiny</p>
              <p className="text-sm">Servicio profesional de limpieza</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
