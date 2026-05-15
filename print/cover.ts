/**
 * Compile wraparound cover PDFs for each volume.
 *
 * Reads page counts from `dist/book-vol{N}.pdf` and passes them to Typst
 * with `--input page-count=N` and `--input volume=N`.
 *
 * Run with: `npm run cover` (or `npm run build`, which runs everything).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COVER_TYP = path.join(__dirname, 'cover.typ');
const VOLUMES = [1, 2] as const;

function getPageCount(pdfPath: string): number {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(
      `Book PDF not found at ${pdfPath}. Run \`npm run compile\` first.`
    );
  }
  const data = fs.readFileSync(pdfPath);
  const matches = data.toString('binary').match(/\/Type\s*\/Page[^s]/g) ?? [];
  return matches.length;
}

function build() {
  for (const vol of VOLUMES) {
    const bookPdf = path.join(__dirname, 'dist', `book-vol${vol}.pdf`);
    const coverPdf = path.join(__dirname, 'dist', `cover-vol${vol}.pdf`);
    const pages = getPageCount(bookPdf);
    console.log(`Volume ${vol} page count: ${pages}`);
    if (pages > 800) {
      console.warn(
        `  WARNING: Volume ${vol} exceeds Lulu's 800-page interior limit (${pages} pages).`
      );
    }
    console.log(`  Compiling cover for Volume ${vol}…`);
    execFileSync(
      'typst',
      [
        'compile',
        COVER_TYP,
        coverPdf,
        '--root', '..',
        '--font-path', 'assets/fonts',
        '--input', `page-count=${pages}`,
        '--input', `volume=${vol}`,
      ],
      { cwd: __dirname, stdio: 'inherit' }
    );
    const stat = fs.statSync(coverPdf);
    console.log(
      `  wrote ${path.relative(process.cwd(), coverPdf)} (${(stat.size / 1e6).toFixed(2)} MB)`
    );
  }
}

build();
