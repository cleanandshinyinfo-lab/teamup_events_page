import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEventById, getInvitationSnapshot } from '@/lib/db';
import EventDetails from '@/components/EventDetails';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
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

export default async function EventPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { token } = await searchParams;
  const [event, invitation] = await Promise.all([
    getEventById(id),
    token ? getInvitationSnapshot(token) : Promise.resolve(null),
  ]);

  if (!event) {
    notFound();
  }

  return <EventDetails event={event} token={token} initialInvitation={invitation} />;
}

export const revalidate = 0;
