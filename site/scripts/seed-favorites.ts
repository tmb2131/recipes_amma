#!/usr/bin/env tsx
/**
 * One-shot seed: push every recipe with `family === true` (the title-prefix
 * heuristic in `cleanMarkdown.ts`) into the favorites store, so the heart
 * UI starts out matching what the site previously rendered as "From Amma's
 * own hand".
 *
 * Storage:
 *   - With `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or the
 *     `KV_REST_API_*` aliases injected by Vercel's marketplace Redis
 *     integration) we write to that Redis instance.
 *   - Otherwise we fall back to `site/.favorites-dev.json` — handy for
 *     local-only iteration.
 *
 * Usage:
 *   npm run seed-favorites -- --dry      # preview what will be added
 *   npm run seed-favorites -- --apply    # actually write
 *
 * Idempotent: re-running after the initial seed only inserts newly-added
 * recipes whose titles start with "Amma's …" / "Selvi's …" / "Sylvestre's …".
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAllRecipes } from '../src/lib/loadRecipes.js';
import { addFavorites, getBackend, listFavorites } from '../src/lib/favoritesStore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '..');

const args = new Set(process.argv.slice(2));
const dry = args.has('--dry');
const apply = args.has('--apply');
if (!dry && !apply) {
  console.error('Usage: seed-favorites.ts --dry | --apply');
  process.exit(2);
}

const recipes = loadAllRecipes();
const seedSlugs = recipes.filter((r) => r.family).map((r) => r.slug).sort();
const existing = new Set(await listFavorites());
const toAdd = seedSlugs.filter((s) => !existing.has(s));

const backend = await getBackend();
console.log(`Backend: ${backend}`);
console.log(`Recipes flagged as Amma's Favorites by title prefix: ${seedSlugs.length}`);
console.log(`Already in store: ${seedSlugs.length - toAdd.length}`);
console.log(`Will add: ${toAdd.length}`);
if (toAdd.length > 0) {
  console.log(toAdd.map((s) => `  + ${s}`).join('\n'));
}

if (dry) {
  console.log('\n(dry run — no writes)');
  process.exit(0);
}

if (toAdd.length === 0) {
  console.log('\nNothing to do.');
  process.exit(0);
}

const added = await addFavorites(toAdd);
console.log(`\nAdded ${added} slug${added === 1 ? '' : 's'} to ${backend} backend.`);
if (backend === 'file') {
  console.log(`  -> ${path.join(siteRoot, '.favorites-dev.json')}`);
}
