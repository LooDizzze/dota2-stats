/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './providers/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Maps every CSS variable to a named Tailwind color token.
        // Usage: bg-card, text-radiant, border-border, etc.
        card: {
          DEFAULT: 'var(--color-card)',
          hover: 'var(--color-card-hover)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          bright: 'var(--color-border-bright)',
        },
        gold: {
          DEFAULT: 'var(--color-gold)',
          bright: 'var(--color-gold-bright)',
        },
        radiant: 'var(--color-radiant)',
        dire: 'var(--color-dire)',
        content: 'var(--color-text)',
        muted: 'var(--color-muted)',
        dim: 'var(--color-dim)',
        upcoming: '#7c9cbf',
      },
    },
  },
  plugins: [],
};
