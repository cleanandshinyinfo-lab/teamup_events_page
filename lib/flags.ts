// Interruptor de la bolsa de servicios (/servicios).
// APAGADA por defecto: la página y sus acciones (Solicitar / otro horario) solo
// están activas si la env var BOLSA_DISPONIBLE === 'on'.
// Para reactivar sin deploy de código: poner BOLSA_DISPONIBLE=on en Vercel y redeploy.
export const BOLSA_DISPONIBLE = process.env.BOLSA_DISPONIBLE === 'on';
