/**
 * Emit a Typst document from the existing recipe loaders.
 *
 * Reads every recipe via `../site/src/lib/loadRecipes.ts` (no duplication,
 * no re-parsing), then writes a single `out/book.typ` that the Typst
 * compiler turns into a press-ready PDF.
 *
 * Run with: `npm run emit` (or `npm run build` to also compile).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked, type Tokens, type TokensList } from 'marked';

import {
  loadAllRecipes,
  groupBySection,
  SECTION_ORDER,
  SECTION_META,
  type Recipe,
  type Section,
} from '../site/src/lib/loadRecipes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'out');
const OUT_FILE = path.join(OUT_DIR, 'book.typ');
const JSON_FILE = path.join(OUT_DIR, 'recipes.json');

// ---------------------------------------------------------------------------
// Markdown -> Typst conversion
// ---------------------------------------------------------------------------

/** Escape a string for use inside Typst content (markup mode). */
function escapeTypstContent(s: string): string {
  // Order matters: backslash first so we don't double-escape.
  return s
    .replace(/\\/g, '\\\\')
    .replace(/([#@<>$\[\]_*=`])/g, '\\$1');
}

/** Escape a string for use as a Typst string literal: "...". */
function escapeTypstString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

interface MarkedToken {
  type: string;
  raw?: string;
  text?: string;
  tokens?: MarkedToken[];
  items?: { tokens: MarkedToken[] }[];
  depth?: number;
  ordered?: boolean;
  href?: string;
}

function renderInline(tokens: MarkedToken[] | undefined): string {
  if (!tokens) return '';
  return tokens
    .map((t) => {
      switch (t.type) {
        case 'text':
        case 'escape':
          return escapeTypstContent(t.text ?? '');
        case 'strong':
          // Use the function form `#strong[..]` rather than `*..*` markup so
          // adjacent letters (`**R**oast`) work. Trail with a zero-width
          // space (U+200B) to stop `#strong[..](text)` from being parsed as
          // a chained call.
          return '#strong[' + renderInline(t.tokens) + ']\u200B';
        case 'em':
          return '#emph[' + renderInline(t.tokens) + ']\u200B';
        case 'codespan':
          return '`' + (t.text ?? '').replace(/`/g, '') + '`';
        case 'link': {
          const href = (t.href ?? '').replace(/"/g, '');
          const label = renderInline(t.tokens) || escapeTypstContent(t.text ?? href);
          return `#link("${href}")[${label}]`;
        }
        case 'br':
          return ' \\\n';
        case 'del':
          return '#strike[' + renderInline(t.tokens) + ']';
        case 'html':
          return '';
        default:
          return escapeTypstContent(t.raw ?? '');
      }
    })
    .join('');
}

function renderBlock(tokens: MarkedToken[]): string {
  const out: string[] = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case 'paragraph':
        out.push(renderInline(tok.tokens));
        break;
      case 'heading': {
        const depth = Math.min(Math.max(tok.depth ?? 2, 1), 6);
        // Bump every heading one level deeper than chapter title (which is
        // emitted by the template), so an inline "## Method" becomes "===".
        const marker = '='.repeat(depth + 2);
        out.push(`${marker} ${renderInline(tok.tokens)}`);
        break;
      }
      case 'list': {
        const marker = tok.ordered ? '+ ' : '- ';
        const items = (tok.items ?? [])
          .map((it) => marker + renderInline(it.tokens))
          .join('\n');
        out.push(items);
        break;
      }
      case 'blockquote':
        out.push(
          '#quote(block: true)[' +
            renderBlock(tok.tokens ?? []).replace(/\n\n/g, ' \\\n') +
            ']'
        );
        break;
      case 'hr':
        out.push('#line(length: 100%, stroke: 0.4pt + rgb("#ece2c4"))');
        break;
      case 'code':
        // Recipe markdown rarely has fenced code; treat as raw.
        out.push('```\n' + (tok.text ?? '') + '\n```');
        break;
      case 'space':
        break;
      case 'html':
        // Ignore.
        break;
      default:
        if (tok.text) out.push(escapeTypstContent(tok.text));
    }
  }
  return out.join('\n\n');
}

function mdToTypst(md: string): string {
  if (!md) return '';
  const tokens = marked.lexer(md) as TokensList;
  return renderBlock(tokens as unknown as MarkedToken[]);
}

// ---------------------------------------------------------------------------
// Emit a single recipe call
// ---------------------------------------------------------------------------

function indexSortKey(title: string): { sortKey: string; initial: string } {
  // Strip accents and leading non-letters so "(NYT)" titles bucket under
  // their first real letter; e.g. "Älplermagronen" → "alplermagronen", "A".
  const stripped = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[^a-zA-Z]+/, '')
    .toLowerCase();
  const initial = (stripped.match(/[a-z]/)?.[0] ?? '?').toUpperCase();
  return { sortKey: stripped || title.toLowerCase(), initial };
}

function emitRecipe(r: Recipe): string {
  const title = `"${escapeTypstString(r.title)}"`;
  const source = r.source ? `"${escapeTypstString(r.source)}"` : 'none';
  const family = r.family ? 'true' : 'false';
  const motif = SECTION_META[r.section].motif;

  const ingredients = (r.ingredients ?? [])
    .map((ing) => `    [${escapeTypstContent(ing)}],`)
    .join('\n');

  const methodMd = r.instructions ?? r.body;
  const method = mdToTypst(methodMd);

  const sectionStr = `"${escapeTypstString(r.section)}"`;
  const slugStr = `"${escapeTypstString(r.slug)}"`;
  const { sortKey, initial } = indexSortKey(r.title);
  const sortKeyStr = `"${escapeTypstString(sortKey)}"`;
  const initialStr = `"${escapeTypstString(initial)}"`;

  return `#recipe(
  title: ${title},
  section: ${sectionStr},
  slug: ${slugStr},
  sort-key: ${sortKeyStr},
  initial: ${initialStr},
  source: ${source},
  family: ${family},
  motif: "${motif}",
  ingredients: (
${ingredients}
  ),
  method: [
${indent(method, 4)}
  ],
)
`;
}

function indent(s: string, n: number): string {
  const pad = ' '.repeat(n);
  return s
    .split('\n')
    .map((l) => (l.length ? pad + l : l))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build() {
  console.log('Loading recipes from existing site loaders…');
  const recipes = loadAllRecipes();
  console.log(`  loaded ${recipes.length} recipes across ${SECTION_ORDER.length} sections`);

  const grouped = groupBySection(recipes);

  // Index payload — used by the title/source/ingredient indexes in Typst.
  const indexPayload = recipes.map((r) => ({
    title: r.title,
    section: r.section,
    slug: r.slug,
    source: r.source ?? null,
    family: r.family,
    ingredients: r.ingredients ?? [],
  }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_FILE, JSON.stringify(indexPayload, null, 2), 'utf8');

  const lines: string[] = [];
  lines.push('// Generated by print/build.ts — do not edit.');
  lines.push('// Source data lives in /Indian, /Asian, /Fish, /Soup, /Salad,');
  lines.push('// /Dressing, /Desserts, /Sylvestre, /Other (one .md per recipe).');
  lines.push('');
  lines.push('#import "/print/template.typ": *');
  lines.push('');
  lines.push('#show: book');
  lines.push('');
  lines.push('#front-matter()');
  lines.push('');

  for (const group of grouped) {
    if (group.count === 0) continue;
    const meta = SECTION_META[group.section as Section];
    lines.push(
      `#chapter(name: "${escapeTypstString(group.section)}", motif: "${meta.motif}", count: ${group.count})`
    );
    lines.push('');
    for (const r of group.recipes) {
      lines.push(emitRecipe(r));
    }
  }

  lines.push('#back-matter()');
  lines.push('');

  fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
  console.log(`  wrote ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(`  wrote ${path.relative(process.cwd(), JSON_FILE)}`);
}

build();
