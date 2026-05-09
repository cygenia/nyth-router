/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"InterVariable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        display: ['"Cabinet Grotesk"', '"InterVariable"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          50: '#f6f7fb',
          100: '#eaecf5',
          200: '#cbd0e1',
          300: '#9aa1bd',
          400: '#6a728f',
          500: '#48506b',
          600: '#2d324a',
          700: '#1d2138',
          800: '#13162b',
          900: '#0b0d1d',
          950: '#06081a',
        },
        aurora: {
          rose: '#ff8fb6',
          peach: '#ffd2a4',
          lemon: '#fff4a4',
          mint: '#9ce4c5',
          sky: '#9ec9ff',
          violet: '#bca5ff',
          pink: '#f6a4ff',
        },
      },
      boxShadow: {
        soft: '0 24px 80px -28px rgba(78, 56, 132, 0.45)',
        glow: '0 0 0 1px rgba(255,255,255,0.08), 0 22px 60px -20px rgba(157,127,236,0.45)',
        'inner-soft': 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'grid-fade': 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
        'aurora-gradient': 'linear-gradient(135deg, #ff8fb6, #bca5ff 34%, #9ec9ff 58%, #9ce4c5 82%, #b7ffd8)',
      },
      animation: {
        float: 'float 9s ease-in-out infinite',
        floatSlow: 'float 16s ease-in-out infinite',
        spinSlow: 'spin 18s linear infinite',
        pulseSoft: 'pulseSoft 3.6s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(20px,-30px,0) scale(1.05)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.85' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-300px 0' },
          '100%': { backgroundPosition: '300px 0' },
        },
      },
      borderRadius: {
        '4xl': '2.4rem',
      },
    },
  },
  plugins: [],
};
