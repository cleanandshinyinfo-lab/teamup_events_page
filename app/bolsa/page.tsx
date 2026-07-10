import { Metadata } from 'next';
import { getBrowseCleanerByToken, getBolsaServicesForCleaner } from '@/lib/db';
import { BOLSA_DISPONIBLE } from '@/lib/flags';
import ServicesList from '@/components/ServicesList';

interface PageProps {
  searchParams: Promise<{ c?: string }>;
}

export const metadata: Metadata = {
  title: 'Bolsa de servicios | Clean and Shiny',
};

function cityLabel(city: string | null): string {
  return (city || '').replace(/_/g, ' ');
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-2">
        <div className="text-4xl">🔒</div>
        <p className="text-gray-800 font-semibold text-lg">Link no válido</p>
        <p className="text-gray-600 text-sm">{message}</p>
      </div>
    </main>
  );
}

function PausedScreen() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-2">
        <div className="text-4xl">⏸️</div>
        <p className="text-gray-800 font-semibold text-lg">Bolsa de servicios en pausa</p>
        <p className="text-gray-600 text-sm">
          Por el momento no hay servicios disponibles para tomar. Te avisaremos cuando se reactive. ¡Gracias!
        </p>
      </div>
    </main>
  );
}

export default async function BolsaPage({ searchParams }: PageProps) {
  if (!BOLSA_DISPONIBLE) {
    return <PausedScreen />;
  }

  const { c: token } = await searchParams;

  if (!token) {
    return <ErrorScreen message="Falta el identificador del cleaner en el link." />;
  }

  const cleaner = await getBrowseCleanerByToken(token);
  if (!cleaner) {
    return <ErrorScreen message="Este link no es válido o ya expiró. Pide uno nuevo al equipo." />;
  }

  const services = await getBolsaServicesForCleaner(cleaner);

  return (
    <main className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-lg mx-auto">
        <header className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Servicios disponibles</h1>
          <p className="text-gray-500 text-sm mt-1">
            {cleaner.cleaner_name ? `Hola ${cleaner.cleaner_name} 👋. ` : ''}
            Estos son los servicios disponibles en {cityLabel(cleaner.ciudad)}. Solicita el que más te convenga.
          </p>
        </header>
        <ServicesList
          token={token}
          cleanerName={cleaner.cleaner_name}
          city={cleaner.ciudad}
          services={services}
          source="bolsa"
        />
      </div>
    </main>
  );
}

export const revalidate = 0;
