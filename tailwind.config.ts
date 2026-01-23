import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00a8e8',
          dark: '#0077b6',
        },
        secondary: '#2c3e50',
        accent: '#f7b733',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #00a8e8 0%, #0077b6 100%)',
        'gradient-accent': 'linear-gradient(135deg, #f7b733 0%, #fc4a1a 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
