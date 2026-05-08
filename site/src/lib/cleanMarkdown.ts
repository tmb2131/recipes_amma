/**
 * Markdown cleanup for "Amma's Kitchen".
 *
 * Pure, deterministic, conservative — never modifies source files. Applied
 * at build-time to a copy. Failures are silent: if a heuristic isn't
 * confident, we render the prose as-is.
 */

const SOURCE_MAP: Record<string, string> = {
  O: 'Ottolenghi',
  G: 'Guardian',
  NYT: 'NY Times',
  WP: 'Washington Post',
  WSJ: 'WSJ',
  BBC: 'BBC',
  F52: 'Food52',
  PBS: 'PBS',
  'BBC Food': 'BBC',
  'BBC Good Food': 'BBC Good Food',
  'BBCFood': 'BBC',
  'BBC GOODFOOD': 'BBC Good Food',
  'NYT!': 'NY Times',
  'cookie & Kate': 'Cookie + Kate',
  'pegsandpitches.co.uk': 'Pegs & Pitches',
  'Goya.inc': 'Goya',
  'The modern Nonna': 'The Modern Nonna',
  'Bong Eats Adda': 'Bong Eats',
  'Nigella Lawson': 'Nigella Lawson',
  'BBC Good Food)': 'BBC Good Food',
};

export type CleanedTitle = {
  title: string;
  source?: string;
  family: boolean;
};

const FAMILY_PREFIXES = [
  /^amma['’]?s\b/i,
  /^selvi['’]?s\b/i,
  /^sylvestre['’]?s\b/i,
];

/** Extract a `(...)`-suffixed source tag and detect "family" titles. */
export function cleanTitle(rawTitle: string): CleanedTitle {
  let t = rawTitle.trim();

  // Strip surrounding bold markers e.g. "**Amma's Yogurt**"
  t = t.replace(/^\*+|\*+$/g, '').trim();

  // Unescape common backslash escapes in the title.
  t = unescapeBackslashes(t);

  // Strip a trailing source tag like "Foo (NYT)" or "Foo ( WP)".
  // Only accept tags from our known map — otherwise a parenthetical like
  // "(for 4)" or "(Paneer Makhani)" would be mis-extracted.
  let source: string | undefined;
  const sourceMatch = t.match(/^(.*?)\s*\(\s*([^()]+?)\s*\)\s*$/);
  if (sourceMatch) {
    const candidate = sourceMatch[2].trim();
    const mapped =
      SOURCE_MAP[candidate] ??
      SOURCE_MAP[candidate.toUpperCase()] ??
      SOURCE_MAP[candidate.replace(/\s+/g, ' ').trim()];
    if (mapped) {
      t = sourceMatch[1].trim();
      source = mapped;
    }
  }

  // Replace stray underscores used as apostrophes ("Day_s" -> "Day's").
  t = t.replace(/(\w)_s\b/g, "$1's");

  // Collapse whitespace.
  t = t.replace(/\s+/g, ' ').trim();

  const family = FAMILY_PREFIXES.some((re) => re.test(t));

  return { title: t, source, family };
}

/** Unescape backslash-escaped chars commonly emitted by Notion/Docs export. */
export function unescapeBackslashes(input: string): string {
  return input.replace(/\\([!\-(){}\[\].?,*_+&])/g, '$1');
}

/**
 * Clean recipe body markdown. Returns the cleaned markdown plus an optional
 * extracted ingredients list (heuristic).
 */
export type CleanedBody = {
  body: string;
  ingredients?: string[];
  instructions?: string;
};

const MEASURE_WORDS = [
  'cup', 'cups', 'tsp', 'tbsp', 'teaspoon', 'tablespoon', 'teaspoons',
  'tablespoons', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'g', 'gram', 'grams', 'kg', 'ml', 'l', 'litre', 'liter', 'litres', 'liters',
  'pinch', 'clove', 'cloves', 'can', 'cans', 'inch', 'inches', 'piece',
  'pieces', 'sprig', 'sprigs', 'slice', 'slices', 'handful', 'bunch',
  'bunches', 'stick', 'sticks',
  // Bare quantities e.g. "Fine sea salt", "black pepper"
  'salt', 'pepper',
];

const MEASURE_RE = new RegExp(
  `(?:^|[\\s(])(?:${MEASURE_WORDS.join('|')})(?:[\\s.,)]|$)`,
  'i'
);

const NUM_RE = /\d|½|¼|¾|⅓|⅔|⅛|⅜|⅝|⅞/;

export function cleanBody(rawBody: string, displayTitle?: string): CleanedBody {
  let body = rawBody;

  // Normalize line endings.
  body = body.replace(/\r\n?/g, '\n');

  // PDF/browser copy-paste often uses LINE/PARAGRAPH SEPARATOR instead of LF;
  // markdown treats those as intra-paragraph whitespace, which collapses layout.
  body = body.replace(/\u2028|\u2029/g, '\n');

  // Unescape backslashes.
  body = unescapeBackslashes(body);

  // Strip trailing double-spaces (markdown-line-break artifact) and trailing
  // whitespace. We keep deliberate blank lines.
  body = body
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n');

  // Collapse 3+ consecutive blank lines into a single blank line.
  body = body.replace(/\n{3,}/g, '\n\n');

  // Remove exact-duplicate consecutive *non-empty* lines (e.g. "Heat oven..."
  // repeated three times in Älplermagronen.md).
  body = dedupeConsecutiveLines(body);

  // Drop a leading H1/title that just repeats the filename's title.
  if (displayTitle) {
    const titleSlug = simplify(displayTitle);
    const lines = body.split('\n');
    while (lines.length && lines[0].trim() === '') lines.shift();
    if (lines.length) {
      const first = lines[0]
        .replace(/^#+\s*/, '')
        .replace(/^\*+|\*+$/g, '')
        .trim();
      if (titleMatchesDisplay(first, titleSlug)) {
        lines.shift();
        while (lines.length && lines[0].trim() === '') lines.shift();
      }
    }
    body = lines.join('\n');
  }

  // Ingredients/method split: prefer the markdown shape emitted by the dev
  // recipe editor (`- line` bullets, optional blank separator, then method).
  // That keeps free-text lines like "fresh coriander" in the ingredient list —
  // the heuristic below would classify them as "short prose" and drop them
  // into instructions when they're the last bullets before method.
  const split =
    splitLeadingIngredientBlock(body) ??
    splitIngredientsAndInstructions(body);

  return {
    body: body.trim(),
    ingredients: split?.ingredients,
    instructions: split?.instructions,
  };
}

function simplify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function titleMatchesDisplay(titleLine: string, displayTitleSlug: string): boolean {
  if (simplify(titleLine) === displayTitleSlug) return true;
  // Structured saves include the source in the H1 (`Title (Source)`) while the
  // display title passed to the cleaner is source-free.
  return simplify(titleLine.replace(/\s*\([^()]+\)\s*$/, '')) === displayTitleSlug;
}

function dedupeConsecutiveLines(input: string): string {
  const out: string[] = [];
  let prev = '';
  for (const line of input.split('\n')) {
    if (line.trim() !== '' && line === prev) continue;
    out.push(line);
    prev = line;
  }
  return out.join('\n');
}

function stripEmphasis(line: string): string {
  // Strip leading/trailing `*` and `_` runs and surrounding markdown bold.
  return line
    .replace(/^[*_]+/, '')
    .replace(/[*_]+$/, '')
    .trim();
}

function looksLikeIngredient(line: string): boolean {
  const trimmed = stripEmphasis(stripMarkdownListPrefix(line).trim());
  if (!trimmed) return false;
  if (trimmed.length > 220) return false;
  // Starts with a digit or fraction (most common ingredient pattern).
  if (/^[\d½¼¾⅓⅔⅛⅜⅝⅞]/.test(trimmed)) return true;
  // Contains a measure word as its own token.
  if (MEASURE_RE.test(trimmed)) return true;
  // Hyphen-separator pattern: "Cumin - 1 tsp" or "Salt - to taste".
  if (/\s[\-—–]\s/.test(trimmed) && trimmed.length < 80 && /\d|to taste|pinch|salt|pepper/i.test(trimmed)) {
    return true;
  }
  // Trailing number+unit pattern: "Garbanzo beans   2 cans".
  if (/\s\d+(?:\s|$)/.test(trimmed) && trimmed.length < 80) return true;
  return false;
}

/** Strip a leading GFM list marker (ASCII or common Unicode dashes from Word/Notion). */
function stripMarkdownListPrefix(line: string): string {
  return line.replace(/^\s*(?:[*•]|[\u2212\u2010\u2011\u2012\u2013\u2014\u2015-])\s+/, '');
}

/** Markdown list marker + content (hyphen, unicode dash, asterisk, or bullet). */
function isMarkdownIngredientLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return /^(?:[*•]|[\u2212\u2010\u2011\u2012\u2013\u2014\u2015-])\s+\S/.test(t);
}

/**
 * Opens with markdown bullets (`-`), then keeps absorbing ingredient-shaped
 * content: subsection headings ("For the ..."), headings, `\` separators from
 * exports, `<br />` break before method, and bare quantities — until narrative
 * method steps (`First, ...`) or standalone `<br />` (often before method HTML).
 *
 * Mirrors the structured editor (`- ingredient` bullets first, then multipart
 * blocks on some scraped recipes).
 */
function splitLeadingIngredientBlock(body: string):
  | { ingredients: string[]; instructions: string }
  | null {
  const rawLines = body.split('\n');
  let i = 0;
  while (i < rawLines.length && rawLines[i].trim() === '') i++;
  if (i >= rawLines.length) return null;
  if (!isMarkdownIngredientLine(rawLines[i])) return null;

  const ingredientRows: number[] = [];
  while (i < rawLines.length) {
    const ln = rawLines[i];
    if (isMarkdownIngredientLine(ln)) {
      ingredientRows.push(i);
      i++;
      continue;
    }
    if (ln.trim() === '' && ingredientRows.length > 0) {
      let j = i + 1;
      while (j < rawLines.length && rawLines[j].trim() === '') j++;
      if (j >= rawLines.length) break;
      if (!isMarkdownIngredientLine(rawLines[j])) break;
      i = j;
      continue;
    }
    break;
  }

  if (ingredientRows.length === 0) return null;

  const ingredients = ingredientRows.map((idx) =>
    cleanIngredientLine(rawLines[idx]),
  );

  // Continuation: Ottolenghi / Guardian-style multipart ingredients after `\`
  // or blank gaps (subsection titles and non-bulleted lines).
  while (i < rawLines.length) {
    const ln = rawLines[i];
    const t = ln.trim();

    if (looksLikeMethodStepStart(ln)) break;

    const brOnly = /^<br\s*\/?>$/i.test(t);
    if (brOnly) {
      i++;
      while (i < rawLines.length && rawLines[i].trim() === '') i++;
      break;
    }

    if (t === '' || t === '\\') {
      let j = i + 1;
      while (j < rawLines.length) {
        const u = rawLines[j].trim();
        if (u === '' || u === '\\') {
          j++;
          continue;
        }
        break;
      }
      if (j >= rawLines.length || looksLikeMethodStepStart(rawLines[j])) break;
      i = j;
      continue;
    }

    if (isMarkdownIngredientLine(ln)) {
      ingredients.push(cleanIngredientLine(ln));
      i++;
      continue;
    }
    if (isIngredientSectionHeading(ln)) {
      ingredients.push(cleanSectionHeading(ln));
      i++;
      continue;
    }
    if (looksLikeIngredient(ln)) {
      ingredients.push(cleanIngredientLine(ln));
      i++;
      continue;
    }

    const bare = stripEmphasis(stripMarkdownListPrefix(ln).trim());
    if (
      bare &&
      bare.length <= 110 &&
      !/[.!?]/.test(bare) &&
      bare.split(/\s+/).length <= 16
    ) {
      ingredients.push(
        bare.replace(/[ \t]{2,}/g, ' ').replace(/\s*[-—–]\s*/g, ' — '),
      );
      i++;
      continue;
    }

    break;
  }

  while (i < rawLines.length && rawLines[i].trim() === '') i++;
  const instructions = rawLines.slice(i).join('\n').trim();

  return { ingredients, instructions };
}

function cleanSectionHeading(line: string): string {
  let t = line.trim().replace(/^#{1,6}\s*/, '');
  return stripEmphasis(t);
}

/** Subsection title before more ingredients (exported recipe layout). */
function isIngredientSectionHeading(line: string): boolean {
  const t = stripEmphasis(line.trim());
  if (!t) return false;
  if (/^#{1,6}\s+\S/.test(line.trim())) return true;
  return /^for the\b/i.test(t) && t.length <= 80;
}

/** Imperative prose that belongs in method — not multipart ingredients */
function looksLikeMethodStepStart(line: string): boolean {
  const trimmed = stripEmphasis(line.trim());
  const withoutHeading = trimmed.replace(/^#{1,6}\s+/, '').trim();
  if (/^step\s+\d+\b/i.test(withoutHeading)) return true;
  if (looksLikeInstruction(trimmed)) return true;
  if (trimmed.length < 8) return false;
  const firstWord =
    withoutHeading
      .normalize('NFKC')
      .replace(/^[^A-Za-z0-9'*]+/, '')
      .match(/^[A-Za-z]+/)
      ?.[0]?.toLowerCase() ?? '';
  if (METHOD_STEP_VERBS.has(firstWord)) return true;
  return METHOD_LINE_HEAD_RE.test(withoutHeading.slice(0, 56));
}

/** Verbs/phrases missed when commas split the obvious first-token match. */
const METHOD_LINE_HEAD_RE =
  /^next,\s|^pre-heat|^preheat|^heat\b|^bring\b|^put\b|^pour\b|^stir\b|^combine\b|^mix\b|^add\b|^scatter\b|^drizzle\b|^drain\b|^tip\b|^spoon\b|^transfer\b|^return\b|^toast\b|^bake|^roast\b|^simmer\b|^boil\b|^whisk\b|^beat\b|^fold\b|^uncover|^cover\b|^line\b|^fry\b|^grill\b|^serve\b|^set\b|^rub\b|^soak,/i;

const METHOD_STEP_VERBS = new Set([
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'meanwhile',
  'next',
  'heat',
  'preheat',
  'put',
  'pour',
  'stir',
  'combine',
  'add',
  'transfer',
  'return',
  'remove',
  'discard',
  'drain',
  'line',
  'toast',
  'bake',
  'roasted',
  'roast',
  'simmer',
  'boil',
  'whisk',
  'mix',
  'beat',
  'fold',
  'scatter',
  'drizzle',
  'cover',
  'uncover',
  'set',
  'rub',
  'fry',
  'grill',
  'serve',
  'spoon',
  'tip',
  'soak',
]);

function looksLikeInstruction(line: string): boolean {
  const trimmed = stripEmphasis(line);
  if (trimmed.length < 30) return false;
  if (/[.!?]\s|[.!?]$/.test(trimmed) && trimmed.split(/\s+/).length >= 6) return true;
  return false;
}

function cleanIngredientLine(line: string): string {
  return stripEmphasis(stripMarkdownListPrefix(line).trim())
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*[-—–]\s*/g, ' — ')
    .trim();
}

type LineKind = 'ingredient' | 'instruction' | 'short' | 'blank';

function classify(line: string): LineKind {
  const trimmed = line.trim();
  if (trimmed === '') return 'blank';
  if (looksLikeInstruction(trimmed)) return 'instruction';
  if (looksLikeIngredient(trimmed)) return 'ingredient';
  return 'short';
}

/**
 * Find the ingredients block. Treat any contiguous run of "ingredient" or
 * "short" lines (with single blank-line gaps) as a candidate block; take the
 * earliest block that contains at least 4 lines and at least half of those
 * lines have a digit or measure word — that filters prose from real
 * ingredient lists.
 */
function splitIngredientsAndInstructions(body: string):
  | { ingredients: string[]; instructions: string }
  | null {
  const lines = body.split('\n');
  const kinds = lines.map(classify);

  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && (kinds[i] === 'blank' || kinds[i] === 'instruction')) i++;
    if (i >= lines.length) break;

    const blockStart = i;
    const blockLines: number[] = [];
    let consecBlanks = 0;
    while (i < lines.length) {
      const k = kinds[i];
      if (k === 'ingredient') {
        blockLines.push(i);
        consecBlanks = 0;
        i++;
        continue;
      }
      if (k === 'blank' && consecBlanks === 0) {
        consecBlanks++;
        i++;
        continue;
      }
      if (k === 'short') {
        // Only consume a 'short' line if we already have at least one
        // ingredient in the block AND, looking past a small run of
        // short/blank lines, the next "decisive" line is another
        // ingredient (not an instruction). This protects against:
        //   - bold subheaders before the list (no preceding ingredient)
        //   - the first short instruction-intro line (next line is prose)
        if (blockLines.length === 0) break;
        let p = i + 1;
        let shortRun = 0;
        while (p < lines.length && shortRun < 3) {
          if (kinds[p] === 'blank') { p++; continue; }
          if (kinds[p] === 'short') { shortRun++; p++; continue; }
          break;
        }
        if (p < lines.length && kinds[p] === 'ingredient') {
          blockLines.push(i);
          consecBlanks = 0;
          i++;
          continue;
        }
        break;
      }
      break;
    }

    // Block is valid if it has 4+ short/ingredient lines AND at least half
    // of them are "ingredient" (number/measure). The latter rule keeps us
    // from mis-classifying a paragraph of prose with a single number.
    const numIngredient = blockLines.filter((idx) => kinds[idx] === 'ingredient').length;
    const numShort = blockLines.length;
    if (numShort >= 4 && numIngredient * 2 >= numShort) {
      const ingredients = blockLines.map((idx) => cleanIngredientLine(lines[idx]));
      // Trim trailing blanks consumed.
      let endIdx = i;
      while (endIdx > 0 && kinds[endIdx - 1] === 'blank') endIdx--;
      const remainder = lines.slice(endIdx).join('\n').trim();
      if (remainder.length >= 40) {
        return { ingredients, instructions: remainder };
      }
      // Fall through and keep looking — perhaps this was a tiny ingredient
      // pre-list and the real block is later.
    }
    if (i === blockStart) i++;
  }

  return null;
}
