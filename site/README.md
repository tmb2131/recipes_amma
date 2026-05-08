# Amma's Kitchen

A digital book of family recipes, lovingly rendered as a static website.

The book reads from your existing markdown — `Indian.md` is split into individual recipes, and every `.md` file under `Asian/`, `Fish/`, `Soup/`, `Salad/`, `Dressing/`, `Desserts/`, `Sylvestre/`, and `Other/` becomes a page. The cover photo is `Image.jpeg`. Source files are never modified.

## Run locally

```bash
cd site
npm install
npm run dev      # live preview at http://localhost:4321
npm run build    # produces site/dist/ (the entire site)
npm run preview  # serves the built site for QA
```

`npm run build` runs Astro to produce static HTML, then runs Pagefind to generate the search index inside `dist/pagefind/`.

## Deploy

The `dist/` folder is the entire site — no server, no build step, just static files.

- **Netlify**: drag `dist/` onto <https://app.netlify.com/drop>. Custom domain in two minutes.
- **Vercel**: `npx vercel deploy dist --prod` (or import the repo and set the build command to `npm run build` and the output directory to `site/dist`).
- **GitHub Pages**: push `dist/` to a `gh-pages` branch (or use [actions/deploy-pages](https://github.com/actions/deploy-pages)).
- **Cloudflare Pages**: `npx wrangler pages deploy dist`.
- **Locally / on a USB stick**: open `dist/index.html` in any browser. Search and navigation work entirely offline once Pagefind has loaded its index.

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
