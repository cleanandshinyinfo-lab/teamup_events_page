/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Fotos de TeamUp achicadas por Vercel (plan gratis: 5.000 al mes; usamos ~350-500). Se guardan 31 días para que
    // la misma foto no vuelva a contar como nueva (2-oct-2026).
    minimumCacheTTL: 2678400,
    formats: ['image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'files.teamup.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
