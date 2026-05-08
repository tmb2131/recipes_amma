/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: '#faf6ee',
        'paper-deep': '#f3ecd9',
        ink: '#2a1f1a',
        'ink-soft': '#5b4a3f',
        terracotta: '#b04a2f',
        'terracotta-deep': '#8a3520',
        sage: '#6b8369',
        'sage-deep': '#4d6149',
        gold: '#c39d4e',
        marigold: '#e8b04a',
      },
      fontFamily: {
        display: ['"Italiana"', 'serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        script: ['"Caveat"', 'cursive'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        prose: '38rem',
        page: '46rem',
        spread: '70rem',
      },
    },
  },
  plugins: [],
};
