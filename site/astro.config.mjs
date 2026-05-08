import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://ammas-kitchen.local',
  // Astro 5 `static` output supports per-route opt-out via
  // `export const prerender = false` — used for the API routes under
  // `src/pages/api/` so they run as Vercel serverless functions while
  // every other page stays statically prerendered.
  output: 'static',
  adapter: vercel(),
  integrations: [tailwind({ applyBaseStyles: false }), sitemap()],
  vite: {
    server: { fs: { allow: ['..'] } },
    build: {
      rollupOptions: {
        external: [/^\/pagefind\//],
      },
    },
  },
});
