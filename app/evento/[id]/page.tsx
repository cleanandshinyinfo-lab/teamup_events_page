import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEventById } from '@/lib/db';
import EventDetails from '@/components/EventDetails';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventById(id);

  if (!event) {
    return {
      title: 'Evento no encontrado | Clean and Shiny',
    };
  }

  return {
    title: `Limpieza - ${event.client_name || 'Evento'} | Clean and Shiny`,
    description: `Detalles del evento de limpieza en ${event.city}`,
  };
}

export default async function EventPage({ params }: PageProps) {
  const { id } = await params;
  const event = await getEventById(id);

  if (!event) {
    notFound();
  }

  return <EventDetails event={event} />;
}

export const revalidate = 300;
