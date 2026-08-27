import { Metadata } from 'next';
import { getCleanerScheduleData } from '@/lib/scheduleChangeApi';
import CambiosClient from '@/components/CambiosClient';

interface PageProps {
  searchParams: Promise<{ c?: string }>;
}

export const metadata: Metadata = {
  title: 'Mis cambios de horario | Clean and Shiny',
};

// La carga inicial (SSR) llama GET /schedule-change/cleaner, que hace un
// round-trip a TeamUp por cada solicitud pendiente, en serie (hasta 15s
// c/u) — con 2-3 pendientes supera el límite serverless por defecto de
// Vercel. Code review I3. Requiere plan Pro (ya en uso).
export const maxDuration = 60;

function ErrorScreen({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-2">
        <div className="text-4xl">{icon}</div>
        <p className="text-gray-800 font-semibold text-lg">{title}</p>
        <p className="text-gray-600 text-sm">{message}</p>
      </div>
    </main>
  );
}

export default async function CambiosPage({ searchParams }: PageProps) {
  const { c: token } = await searchParams;

  if (!token) {
    return (
      <ErrorScreen
        icon="🔒"
        title="Link no válido"
        message="Falta el identificador del cleaner en el link."
      />
    );
  }

  const data = await getCleanerScheduleData(token);

  if (!data.ok) {
    // Mapeo de error_code -> pantalla, según §3.1 del contrato. Cualquier otro
    // código (fallas de red/servidor) cae en el mensaje genérico de abajo.
    if (data.error_code === 'INVALID_TOKEN') {
      return (
        <ErrorScreen
          icon="🔒"
          title="Link no válido"
          message="Este link no es válido. Contacta a nuestro equipo para conseguir uno nuevo."
        />
      );
    }
    if (data.error_code === 'TOKEN_REVOKED') {
      return (
        <ErrorScreen
          icon="🚫"
          title="Enlace no válido"
          message="Este enlace ya no está activo. Contacta a nuestro equipo si crees que es un error."
        />
      );
    }
    if (data.error_code === 'CLEANER_INACTIVE') {
      return (
        <ErrorScreen
          icon="⏸️"
          title="Cuenta inactiva"
          message="Tu cuenta no está activa en este momento. Contacta a nuestro equipo."
        />
      );
    }
    if (data.error_code === 'FEATURE_DISABLED') {
      return (
        <ErrorScreen
          icon="🛠️"
          title="En mantenimiento"
          message="Esta función está temporalmente desactivada. Intenta de nuevo más tarde."
        />
      );
    }
    if (data.error_code === 'RATE_LIMITED') {
      // A5 (code review): 429 del rate limiter (I7, src/lib/rateLimit.js).
      return (
        <ErrorScreen
          icon="⏳"
          title="Demasiados intentos"
          message="Espera un momento y vuelve a abrir este enlace."
        />
      );
    }
    return (
      <ErrorScreen
        icon="⚠️"
        title="No se pudo cargar"
        message={data.message || 'Ocurrió un error. Intenta de nuevo en unos minutos.'}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] py-6 px-4">
      <div className="max-w-lg mx-auto">
        <header className="mb-5">
          <h1 className="text-[25px] font-bold tracking-tight text-[#16202b]">Mis cambios de horario</h1>
          <p className="text-[#48586a] text-[13.5px] leading-relaxed mt-2">
            {data.cleaner.name ? `Hola ${data.cleaner.name} 👋. ` : ''}
            Aquí puedes ver tus próximos servicios y responder las solicitudes de cambio de
            horario que hagan tus clientes.
          </p>
        </header>
        <CambiosClient token={token} initialData={data} />
      </div>
    </main>
  );
}

export const revalidate = 0;
