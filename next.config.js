/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
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
