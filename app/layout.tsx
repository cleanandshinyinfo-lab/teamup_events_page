import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clean and Shiny - Eventos',
  description: 'Detalles de eventos de limpieza',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
