import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanBody, cleanTitle } from './cleanMarkdown.js';
import { dedupeSlug, slugify } from './slug.js';

export type Section =
  | 'Indian'
  | 'Asian'
  | 'Fish'
  | 'Soup'
  | 'Salad'
  | 'Dressing'
  | 'Desserts'
  | 'Sylvestre'
  | 'Other';

export const SECTION_ORDER: Section[] = [
  'Indian',
  'Asian',
  'Fish',
  'Soup',
  'Salad',
  'Dressing',
  'Desserts',
  'Sylvestre',
  'Other',
];

export const SECTION_META: Record<Section, { tagline: string; motif: string }> = {
  Indian: { tagline: "Amma's home — dal, curries, and the spice of every meal", motif: 'paisley' },
  Asian: { tagline: 'Tofu, noodles, and stir-fries from across the East', motif: 'leaf' },
  Fish: { tagline: 'Fish from the sea, the river, and the kitchen', motif: 'wave' },
  Soup: { tagline: 'Slow simmers and weeknight bowls', motif: 'steam' },
  Salad: { tagline: 'Crisp, bright, and leafy', motif: 'sprig' },
  Dressing: { tagline: 'The little jars that lift everything', motif: 'drop' },
  Desserts: { tagline: 'Cakes, cookies, and the sweet of the meal', motif: 'marigold' },
  Sylvestre: { tagline: "Sylvestre's pages", motif: 'lotus' },
  Other: { tagline: 'Everything else, the everyday and the unusual', motif: 'star' },
};

export type Recipe = {
  section: Section;
  title: string;
  source?: string;
  family: boolean;
  slug: string;
  ingredients?: string[];
  body: string;
  instructions?: string;
  raw: string;
  sourceFile: string;
  href: string;
  searchText: string;
  /** Absolute path to the source markdown file. */
  absolutePath: string;
};

const FOLDER_SECTIONS: Section[] = [
  'Indian',
  'Asian',
  'Fish',
  'Soup',
  'Salad',
  'Dressing',
  'Desserts',
  'Sylvestre',
  'Other',
];

function repoRoot(): string {
  // src/lib/loadRecipes.ts -> .. -> .. -> .. (workspace root)
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..');
}

export function loadAllRecipes(): Recipe[] {
  const root = repoRoot();
  const taken = new Set<string>();
  const recipes: Recipe[] = [];

  // Per-folder sections — every recipe is one .md file.
  for (const section of FOLDER_SECTIONS) {
    const dir = path.join(root, section);
    if (!fs.existsSync(dir)) continue;
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      const raw = fs.readFileSync(filePath, 'utf8');
      const baseName = entry.name.replace(/\.md$/i, '');
      const titleInfo = cleanTitle(baseName);
      if (!titleInfo.title) continue;
      const cleaned = cleanBody(raw, titleInfo.title);
      const slug = dedupeSlug(slugify(titleInfo.title), taken);
      const sectionSlug = slugify(section);
      recipes.push({
        section,
        title: titleInfo.title,
        source: titleInfo.source,
        family: titleInfo.family,
        slug,
        ingredients: cleaned.ingredients,
        body: cleaned.body,
        instructions: cleaned.instructions,
        raw,
        sourceFile: `${section}/${entry.name}`,
        href: `/${sectionSlug}/${slug}/`,
        searchText: searchText(titleInfo.title, cleaned.body),
        absolutePath: filePath,
      });
    }
  }

  return recipes;
}

function searchText(title: string, body: string): string {
  return `${title}\n${body}`.replace(/\s+/g, ' ').trim();
}

export type SectionGroup = {
  section: Section;
  slug: string;
  count: number;
  recipes: Recipe[];
};

export function groupBySection(recipes: Recipe[]): SectionGroup[] {
  const map = new Map<Section, Recipe[]>();
  for (const s of SECTION_ORDER) map.set(s, []);
  for (const r of recipes) {
    map.get(r.section)!.push(r);
  }
  return SECTION_ORDER.map((section) => {
    const list = (map.get(section) ?? []).sort((a, b) =>
      a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })
    );
    return {
      section,
      slug: slugify(section),
      count: list.length,
      recipes: list,
    };
  }).filter((g) => g.count > 0);
}

/**
 * Linear "book order": within a section, A–Z; sections cycle in
 * SECTION_ORDER. Returns prev/next neighbours for each recipe.
 */
export function buildBookOrder(recipes: Recipe[]): Map<string, { prev?: Recipe; next?: Recipe }> {
  const grouped = groupBySection(recipes);
  const linear: Recipe[] = [];
  for (const g of grouped) linear.push(...g.recipes);

  const map = new Map<string, { prev?: Recipe; next?: Recipe }>();
  for (let i = 0; i < linear.length; i++) {
    map.set(linear[i].href, {
      prev: i > 0 ? linear[i - 1] : undefined,
      next: i < linear.length - 1 ? linear[i + 1] : undefined,
    });
  }
  return map;
}

let cached: Recipe[] | null = null;
export function getRecipes(): Recipe[] {
  // In dev, always re-read from disk so deletions show up after a reload.
  if (import.meta.env.DEV) return loadAllRecipes();
  if (!cached) cached = loadAllRecipes();
  return cached;
}

export type DuplicateGroup = { key: string; recipes: Recipe[] };

/**
 * Group recipes whose titles collapse to the same normalized key. Strict
 * mode: drops parenthetical content, accents, and punctuation but does not
 * apply spelling or token-order fuzziness.
 */
export function findDuplicateGroups(recipes: Recipe[]): DuplicateGroup[] {
  const map = new Map<string, Recipe[]>();
  for (const r of recipes) {
    const key = dupKey(r.title);
    if (!key) continue;
    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    list.push(r);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      recipes: list.sort(
        (a, b) =>
          a.section.localeCompare(b.section) ||
          a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })
      ),
    }))
    .sort(
      (a, b) =>
        b.recipes.length - a.recipes.length || a.key.localeCompare(b.key)
    );
}

function dupKey(title: string): string {
  return title
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
