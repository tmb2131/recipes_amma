import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import { devEdit } from './src/integrations/devEdit.ts';

export default defineConfig({
  site: 'https://ammas-kitchen.local',
  integrations: [tailwind({ applyBaseStyles: false }), sitemap(), devEdit()],
  vite: {
    server: { fs: { allow: ['..'] } },
    build: {
      rollupOptions: {
        external: [/^\/pagefind\//],
      },
    },
  },
});
