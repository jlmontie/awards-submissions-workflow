/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#F5CF00', // Brand yellow
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        secondary: {
          400: '#F4BC5E', // Brand gold
          500: '#F4BC5E',
          600: '#d89d3a',
        },
        navy: {
          500: '#2C3E48', // Brand navy
          600: '#1f2d35',
          700: '#16212a',
        },
        charcoal: {
          500: '#463939', // Link color
          600: '#3a2f2f',
        },
      },
      fontFamily: {
        sans: ['Roboto', 'ui-sans-serif', 'system-ui'],
        heading: ['Montserrat', 'ui-sans-serif', 'system-ui'],
        subheading: ['Arial', 'Helvetica', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

