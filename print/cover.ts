/**
 * Compile the wraparound cover PDF.
 *
 * Reads the current page count from `dist/book.pdf` so the spine width is
 * always correct, then invokes Typst with `--input page-count=N`.
 *
 * Run with: `npm run cover` (or `npm run build`, which runs everything).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOK_PDF = path.join(__dirname, 'dist', 'book.pdf');
const COVER_TYP = path.join(__dirname, 'cover.typ');
const COVER_PDF = path.join(__dirname, 'dist', 'cover.pdf');

function getPageCount(pdfPath: string): number {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(
      `Book PDF not found at ${pdfPath}. Run \`npm run compile\` first.`
    );
  }
  const data = fs.readFileSync(pdfPath);
  // Count /Type /Page entries (not /Pages). This is naive but works for the
  // structured PDFs that Typst emits.
  const matches = data.toString('binary').match(/\/Type\s*\/Page[^s]/g) ?? [];
  return matches.length;
}

function build() {
  const pages = getPageCount(BOOK_PDF);
  console.log(`Book page count: ${pages}`);
  console.log('Compiling wraparound cover…');
  execFileSync(
    'typst',
    [
      'compile',
      COVER_TYP,
      COVER_PDF,
      '--root', '..',
      '--font-path', 'assets/fonts',
      '--input', `page-count=${pages}`,
    ],
    { cwd: __dirname, stdio: 'inherit' }
  );
  const stat = fs.statSync(COVER_PDF);
  console.log(`  wrote ${path.relative(process.cwd(), COVER_PDF)} (${(stat.size / 1e6).toFixed(2)} MB)`);
}

build();
