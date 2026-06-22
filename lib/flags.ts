// Interruptor de la bolsa de servicios (/servicios).
// ENCENDIDA por defecto. Para pausarla: poner BOLSA_DISPONIBLE=off en Vercel y redeploy.
export const BOLSA_DISPONIBLE = process.env.BOLSA_DISPONIBLE !== 'off';
