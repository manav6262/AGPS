/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Institutional Stone Palette (Warm Grey)
        stone: {
          50: '#FAFAF9',
          100: '#F5F5F4',
          200: '#E7E5E4',
          300: '#D6D3D1',
          400: '#A8A29E',
          500: '#78716C',
          600: '#57534E',
          700: '#44403C',
          800: '#292524',
          900: '#1C1917',
        },
        // Deep Institutional Brand Green (Header, active nav, primary actions only)
        brand: {
          DEFAULT: '#14532D',
          hover: '#166534',
        },
        // Semantic status colors (Strictly for state indicators only)
        status: {
          passedText: '#15803D',
          passedBg: '#F0FDF4',
          passedBorder: '#BBF7D0',
          failedText: '#B91C1C',
          failedBg: '#FEF2F2',
          failedBorder: '#FECACA',
          warningText: '#B45309',
          warningBg: '#FFFBEB',
          warningBorder: '#FDE68A',
          neutralText: '#57534E',
          neutralBg: '#F5F5F4',
          neutralBorder: '#E7E5E4',
        },
      },
      fontFamily: {
        sans: [
          'IBM Plex Sans',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        lg: '4px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '4px',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        DEFAULT: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        md: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        lg: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        xl: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
}
