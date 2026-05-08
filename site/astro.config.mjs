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
    // Ship all recipe `.md` files into the Vercel serverless bundle so
    // `/api/edit/*` can load/save against real paths (`@astrojs/vercel` picks
    // these up via `mergeGlobbedIncludes` when a server bundle exists).
    assetsInclude: [
      '../Indian/**/*.md',
      '../Asian/**/*.md',
      '../Fish/**/*.md',
      '../Soup/**/*.md',
      '../Salad/**/*.md',
      '../Dressing/**/*.md',
      '../Desserts/**/*.md',
      '../Sylvestre/**/*.md',
      '../Other/**/*.md',
    ],
    build: {
      rollupOptions: {
        external: [/^\/pagefind\//],
      },
    },
  },
});
