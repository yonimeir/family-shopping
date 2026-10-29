import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          surface: 'var(--surface)',
          elevated: 'var(--surface-elevated)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          elevated: 'var(--surface-elevated)',
        },
        text: {
          primary: 'var(--text)',
          muted: 'var(--muted)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          dark: 'var(--brand-dark)',
          soft: 'var(--brand-soft)',
        },
        cart: {
          on: 'var(--on)',
          'on-bg': 'var(--on-bg)',
          'on-line': 'var(--on-line)',
        },
        border: {
          line: 'var(--line)',
        },
      },
      borderRadius: {
        card: 'var(--radius)',
      },
      boxShadow: {
        hairline: '0 1px 2px 0 rgba(15, 23, 42, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.65)',
        elevated: '0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
} satisfies Config;
