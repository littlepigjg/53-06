/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif SC"', 'Georgia', 'serif'],
      },
      colors: {
        brand: {
          50: '#f1f5f9',
          100: '#e2e8f0',
          500: '#1e3a5f',
          600: '#2e4e7a',
          700: '#0f2744',
        },
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: '720px',
          },
        },
      },
    },
  },
  plugins: [],
};
