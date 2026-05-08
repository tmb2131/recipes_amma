#!/usr/bin/env node
/**
 * One-shot migration: split <repoRoot>/Indian.md into one .md per recipe
 * under <repoRoot>/Indian/, then archive the original to site/.trash/.
 *
 * Usage:
 *   node site/scripts/migrate-indian.mjs --dry      # preview filenames
 *   node site/scripts/migrate-indian.mjs --apply    # actually do it
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const sourceFile = path.join(repoRoot, 'Indian.md');
const targetDir = path.join(repoRoot, 'Indian');
const trashDir = path.join(repoRoot, 'site', '.trash');

const args = new Set(process.argv.slice(2));
const dry = args.has('--dry');
const apply = args.has('--apply');
if (!dry && !apply) {
  console.error('Usage: migrate-indian.mjs --dry | --apply');
  process.exit(2);
}

if (!fs.existsSync(sourceFile)) {
  console.error(`Source file not found: ${sourceFile}`);
  process.exit(1);
}

/** Split Indian.md into { rawTitle, body } chunks on `^# ` headings. */
function split(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) {
      if (current) out.push(current);
      current = { rawTitle: m[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) out.push(current);
  return out.map((c) => ({
    rawTitle: c.rawTitle,
    body: c.lines.join('\n').replace(/^\n+|\n+$/g, '') + '\n',
  }));
}

/** Strip surrounding bold markers and unescape backslash sequences,
 *  matching the cleanup that `cleanMarkdown.unescapeBackslashes` does
 *  at load time. */
function rawToFilename(rawTitle) {
  let t = rawTitle.trim();
  // Strip ALL `*` runs — they're markdown bold artifacts and illegal in
  // filenames anyway. Avoids the "Dal Makhani**(CwM)" -> "Dal Makhani--(CwM)"
  // ugliness from a literal sanitisation pass.
  t = t.replace(/\*+/g, '');
  // Unescape backslash sequences (mirrors cleanMarkdown.unescapeBackslashes).
  t = t.replace(/\\([!\-(){}\[\].?,*_+&])/g, '$1');
  // Sanitise the remaining filesystem-illegal chars.
  t = t.replace(/[\/\\:?"<>|]/g, '-');
  t = t.replace(/\s+/g, ' ').trim();
  return `${t}.md`;
}

function dedupe(name, taken) {
  // Case-insensitive: APFS (default on macOS) is case-preserving but
  // case-insensitive, so `Foo.md` and `foo.md` collide on disk.
  const key = name.toLowerCase();
  if (!taken.has(key)) {
    taken.add(key);
    return name;
  }
  const base = name.replace(/\.md$/i, '');
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i}).md`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
  throw new Error(`Could not dedupe filename: ${name}`);
}

const text = fs.readFileSync(sourceFile, 'utf8');
const chunks = split(text);
console.log(`Parsed ${chunks.length} recipes from Indian.md`);

if (chunks.length === 0) {
  console.error('No recipes found — aborting.');
  process.exit(1);
}

const taken = new Set();
const plan = chunks.map((c) => ({
  rawTitle: c.rawTitle,
  filename: dedupe(rawToFilename(c.rawTitle), taken),
  bodyBytes: Buffer.byteLength(c.body, 'utf8'),
  body: c.body,
}));

if (dry) {
  console.log('\nProposed files (first 20 + last 5):');
  for (const p of plan.slice(0, 20)) {
    console.log(`  ${p.filename}  (${p.bodyBytes} B)`);
  }
  if (plan.length > 25) console.log('  …');
  for (const p of plan.slice(-5)) {
    console.log(`  ${p.filename}  (${p.bodyBytes} B)`);
  }

  const dupes = plan.filter((p) => /\(\d+\)\.md$/.test(p.filename));
  if (dupes.length) {
    console.log(`\nCollision-suffixed filenames (${dupes.length}):`);
    for (const d of dupes) console.log(`  ${d.filename}`);
  } else {
    console.log('\nNo filename collisions.');
  }

  const flagged = plan.filter((p) =>
    /[\/\\:?"<>|]/.test(
      p.rawTitle.replace(/\*+/g, '').replace(/\\[!\-(){}\[\].?,*_+&]/g, '')
    )
  );
  if (flagged.length) {
    console.log(`\nIllegal-char sanitisation (${flagged.length}):`);
    for (const f of flagged) {
      console.log(`  ${f.rawTitle}\n    -> ${f.filename}`);
    }
  }

  console.log(`\n[dry] Would write ${plan.length} files to ${targetDir}`);
  console.log('[dry] Would archive Indian.md to site/.trash/');
  process.exit(0);
}

if (fs.existsSync(targetDir)) {
  const existing = fs.readdirSync(targetDir).filter((n) => n.toLowerCase().endsWith('.md'));
  if (existing.length > 0) {
    console.error(
      `Refusing to apply: ${targetDir} already contains ${existing.length} .md files. ` +
        'Move them aside first.'
    );
    process.exit(1);
  }
} else {
  fs.mkdirSync(targetDir, { recursive: true });
}

for (const p of plan) {
  fs.writeFileSync(path.join(targetDir, p.filename), p.body);
}
console.log(`Wrote ${plan.length} files to ${targetDir}`);

fs.mkdirSync(trashDir, { recursive: true });
const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .slice(0, 19);
const trashTarget = path.join(trashDir, `${stamp}__Indian.md`);
fs.renameSync(sourceFile, trashTarget);
console.log(`Archived Indian.md -> ${path.relative(repoRoot, trashTarget)}`);
