# Amma's Kitchen

A digital book of family recipes, lovingly rendered as a static website.

The book reads from your existing markdown — `Indian.md` is split into individual recipes, and every `.md` file under `Asian/`, `Fish/`, `Soup/`, `Salad/`, `Dressing/`, `Desserts/`, `Sylvestre/`, and `Other/` becomes a page. The cover photo is `Image.jpeg`. Source files are never modified.

## Run locally

```bash
cd site
npm install
npm run dev      # live preview at http://localhost:4321 (full stack, incl. /api/favorites)
npm run build    # prerenders every page + bundles the API as a Vercel function
```

`npm run build` runs Astro to prerender every static route, the `@astrojs/vercel` adapter packs the API endpoints into a serverless function, and Pagefind indexes the static HTML for search. The full output is `site/.vercel/output/`, ready for Vercel deployment via the Build Output API. There's no separate `preview` step — the dev server runs the same code paths as production.

## Deploy

Almost the whole site is statically prerendered, with a single pair of serverless API routes (`/api/favorites`, `/api/favorites/toggle`) that read and write the "Amma's Favorites" set.

- **Vercel** (recommended): the repo's `vercel.json` already wires this up. The Astro Vercel adapter emits both the static pages and the API functions automatically. See [Amma's Favorites — heart toggle](#ammas-favorites--heart-toggle) below for the env vars to set.
- **Netlify / Cloudflare Pages / GitHub Pages**: still possible for a read-only mirror — point them at the static output. The heart icon will degrade gracefully (it shows the build-time seed and silently fails to toggle).

## Amma's Favorites — heart toggle

Every recipe card and detail page has a heart icon. Clicking it adds or removes the recipe from "Amma's Favorites", a shared editorial set rendered on the contents page and called out on each section page.

### Storage

Favorites are stored as a Redis Set keyed `ammas-favorites:v1`.

| Environment            | Backend                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| Local dev (no env)     | `site/.favorites-dev.json` (gitignored)                                 |
| Vercel + Upstash Redis | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`                   |
| Vercel marketplace KV  | `KV_REST_API_URL` + `KV_REST_API_TOKEN` (auto-injected by integrations) |

The store transparently uses whichever pair is set; the API code is identical.

### Auth

Toggle requests must include `Authorization: Bearer <FAVORITES_TOKEN>`. Set `FAVORITES_TOKEN` in your environment to a strong shared secret.

- In `astro dev`, the token defaults to `dev` so editing works immediately. The browser prompts for it on first toggle and caches it in `localStorage` (`ammas-favorites:token`).
- In production, set `FAVORITES_TOKEN` on the Vercel project. Anyone with the token can edit; everyone else can only read.

### One-time seed

To prefill the store with the recipes whose titles already start with "Amma's …" / "Selvi's …" / "Sylvestre's …":

```bash
npm run seed-favorites -- --dry      # preview
npm run seed-favorites -- --apply    # write
```

## What's where

```
site/
  src/
    pages/                  routes (cover, contents, sections, recipes, search)
    layouts/                BookLayout (chrome) and RecipeLayout (paper page)
    components/             Floral motifs, RecipeCard, PageFlip, Drawer, Search
    lib/
      loadRecipes.ts        walks /Asian, /Fish, ... at build time
      splitIndian.ts        splits Indian.md into 228 individual recipes
      cleanMarkdown.ts      conservative text cleanup (escapes, dupes, ingredients)
      render.ts             markdown -> HTML
      slug.ts               url-safe slugs with collision dedupe
    styles/
      tailwind.css          Tailwind base + utilities
      tokens.css            palette, typography, paper background
      paper.css             page styling, drop caps, view transitions
  public/
    cover.jpeg              the cover photo (copy of /Image.jpeg)
    favicon.svg             marigold favicon
```

## Customizing

- **Title and dedication**: `src/pages/index.astro` (search for "Amma's Kitchen").
- **Sections, taglines, motifs**: `src/lib/loadRecipes.ts` → `SECTION_META`.
- **Source-tag mapping** (e.g. `(NYT)` → "NY Times"): `src/lib/cleanMarkdown.ts` → `SOURCE_MAP`.
- **Palette and fonts**: `src/styles/tokens.css`.
- **Floral motifs**: `src/components/Floral.astro` (inline SVGs).
- **Add a new recipe**: drop a markdown file into the matching folder at the workspace root and rebuild.

## Keyboard shortcuts

- `←` / `→` — flip to previous / next recipe
- `/` — focus the search box
- `g` — open the section drawer
- `Esc` — close the drawer
