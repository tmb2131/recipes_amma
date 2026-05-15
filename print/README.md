# Amma's Kitchen — Print Edition

A print-ready hardcopy of the recipe book, typeset to match the website and ready to upload to Lulu (or any short-run book printer) for a layflat hardcover.

## What this is

A tiny pipeline that:

1. Reads every recipe via the existing site loaders (`../site/src/lib/loadRecipes.ts`) — no duplication, no re-parsing.
2. Emits a single Typst document (`out/book.typ`) with structured calls into the typesetting template.
3. Compiles to a press-ready PDF at `dist/book.pdf`, plus a separate `dist/cover.pdf` for the wraparound cover whose spine width is computed from the body's page count.

## Prerequisites

```bash
brew install typst              # the typesetter
brew install qpdf ghostscript   # optional, for PDF/X-1a post-processing
brew install imagemagick        # optional, for CMYK image conversion
npm install                     # inside this directory
```

## Build

```bash
npm run build
```

This runs three steps in order:

1. `npm run emit` — `tsx build.ts` walks recipes via the site loaders and writes `out/book.typ` + `out/recipes.json`.
2. `npm run compile` — `typst compile out/book.typ dist/book.pdf …` produces the body PDF.
3. `npm run cover` — `tsx cover.ts` reads the body's page count and compiles `dist/cover.pdf` with the matching spine width.

For tight iteration on `template.typ`, `npm run watch` re-runs Typst on every save.

## Physical spec

| Setting        | Value                                                     |
| -------------- | --------------------------------------------------------- |
| Trim           | 8.5 × 8.5 inch (square)                                   |
| Binding        | Premium Hardcover Layflat (Lulu)                          |
| Body paper     | 80 lb uncoated cream                                      |
| Cover finish   | Matte laminate                                            |
| Bleed (cover)  | 0.125 inch on all sides                                   |
| Bleed (body)   | None — content sits inside trim                           |
| Output profile | PDF/X-1a (after post-processing, see below)               |
| Page count     | ~1,000 (set after first compile; see `pdfinfo`)           |

The trim is a single constant in `template.typ` (`#let trim = (width: 8.5in, height: 8.5in)`) — flip it to 6×9", A5, or Crown Quarto in one place and rebuild.

## Spine-width formula

Lulu's exact formula for hardcover spine width is:

```
spine_in = (page_count × paper_thickness_in) + (2 × board_thickness_in)
```

For Premium Hardcover Layflat on 80 lb uncoated cream with standard greyboard:

| Component                | Value (inches) |
| ------------------------ | -------------- |
| Paper thickness per page | 0.0025         |
| Board thickness          | 0.080 each     |

`cover.ts` reads `page_count` from `dist/book.pdf` and passes it to Typst as `--input page-count=N`. The board allowance is **not** added — Lulu's preflight expects only the page-stack spine; their bindery adds the board allowance internally.

To override paper thickness for a different stock:

```bash
typst compile cover.typ dist/cover.pdf --root .. --font-path assets/fonts \
  --input page-count=1047 --input paper-thickness=0.0030
```

## Print-ready post-processing

Typst emits a PDF 1.7 file with subsetted embedded fonts and tagged structure — perfectly good for upload as-is. For maximum compatibility with Lulu's automated preflight (and short-run printers in general), convert to **PDF/X-1a**:

```bash
# 1. Linearise (fast-web-view) and tidy the PDF.
qpdf --linearize dist/book.pdf dist/book.linearised.pdf

# 2. Convert to PDF/X-1a:2001 with Ghostscript.
gs -dPDFX -dBATCH -dNOPAUSE -dNOOUTERSAVE \
   -sDEVICE=pdfwrite \
   -sColorConversionStrategy=CMYK \
   -dProcessColorModel=/DeviceCMYK \
   -sOutputICCProfile=/path/to/CoatedFOGRA39.icc \
   -sOutputFile=dist/book.pdfx.pdf \
   dist/book.linearised.pdf

# 3. Same for the cover.
gs -dPDFX -dBATCH -dNOPAUSE -dNOOUTERSAVE \
   -sDEVICE=pdfwrite \
   -sColorConversionStrategy=CMYK \
   -dProcessColorModel=/DeviceCMYK \
   -sOutputICCProfile=/path/to/CoatedFOGRA39.icc \
   -sOutputFile=dist/cover.pdfx.pdf \
   dist/cover.pdf
```

CoatedFOGRA39.icc is the ICC profile most European short-run printers use; Lulu's US presses prefer GRACoL2006_Coated1v2.icc. Download both from Adobe's free profile pack and point Ghostscript at the right one.

## CMYK conversion of the cover photograph

`Image.jpeg` is sRGB. Print is CMYK. Convert before final upload so on-screen colours match the press output:

```bash
magick Image.jpeg \
  -profile /System/Library/ColorSync/Profiles/sRGB\ Profile.icc \
  -intent perceptual \
  -profile /path/to/CoatedFOGRA39.icc \
  -strip \
  Image.cmyk.jpg
```

Then point `cover.typ` at `Image.cmyk.jpg` for the press-final cover.

## Uploading to Lulu

1. **Account** → Create a new "Premium Hardcover" book project at <https://www.lulu.com>.
2. **Trim**: 8.5 × 8.5".
3. **Binding**: Hardcover, Premium, Layflat.
4. **Interior**: Black & White on Cream or Full Colour on Cream (we use full colour because the chapter motifs are gold).
5. **Cover**: Matte Laminate.
6. **Upload** `dist/book.pdfx.pdf` as the interior and `dist/cover.pdfx.pdf` as the cover.
7. **Preflight**: Lulu's preflight will flag any low-resolution images, RGB elements, or trim mismatches. Fix and re-upload until clean.
8. **Proof**: order **one proof copy** before doing a final run.

## Alternative: Mixam (UK)

For Smyth-sewn case-bound copies with a real dust jacket and headband:

1. <https://mixam.com> → Print → Hardcover Books.
2. Choose **Premium Hardcover** + **Section Sewn** + **Dust Jacket**.
3. Trim: closest standard is **210 × 210mm** (8.27 × 8.27"). Update `trim` in `template.typ` accordingly.
4. Upload interior + cover PDFs separately.

## Proof-copy checklist

Run through this before placing a final order. Two iterations of "proof → fix → reorder" is typical.

### Typography
- [ ] **Orphans and widows** — single-word lines at top/bottom of pages. Tweak `widows`/`orphans` in `paper.css`-style overrides, or rephrase the offending recipe.
- [ ] **Hyphenation** — no awkward word breaks in titles or running heads (look at the Asian and Sylvestre sections especially).
- [ ] **Drop caps / first paragraphs** — first paragraph of each method renders correctly; no orphaned drop cap.
- [ ] **Ingredients sidebar** — no entries broken across pages; long ingredient strings wrap without overflow.
- [ ] **Em dashes vs. hyphens** — eyeball a few recipes (e.g. Aloo Gobi) — should be em.

### Layout and binding
- [ ] **Inner margin (gutter)** — text doesn't disappear into the spine. Lulu Layflat needs at least 18mm of inside margin.
- [ ] **Outer margin** — folios sit comfortably away from the trim.
- [ ] **Chapter openers** — full-page motif is centred on the page, not drifting toward the spine.
- [ ] **Recipe titles** — no titles get split across a page break.

### Running heads and folios
- [ ] **Verso shows chapter**, recto shows recipe — check 5 spreads from different chapters.
- [ ] **No running head on chapter opener pages** (suppress-chrome must work).
- [ ] **No folio on the cover** or the half-title.
- [ ] **First arabic-numbered page is the first recipe page**, not before.

### Photos and ink
- [ ] **Cover photo darkness** — proof copies often print darker than on-screen. Lighten by ~10% if needed.
- [ ] **Floral motifs print sharply** in gold — not muddy, not over-bright.
- [ ] **Ingredients sidebar fill** — cream background is visible but not muddy.

### Cover specifics
- [ ] **Spine title centred** between front and back boards (not creeping onto the front).
- [ ] **Spine text legible** at the spine's actual width (proof copy in hand).
- [ ] **Bleed is fully painted** — no white edge on any side of the cover.
- [ ] **Back-cover blurb** — re-read for typos at print size.

### Sanity
- [ ] **TOC page numbers** match where chapters actually begin.
- [ ] **Index page numbers** match where recipes actually appear (spot-check 10).
- [ ] **Source index** doesn't accidentally include unattributed recipes.

## Files

```
print/
  build.ts            Node entrypoint: loads recipes, emits Typst
  cover.ts            Compiles cover with correct spine width
  template.typ        Page master, palette, fonts, recipe/chapter layouts
  cover.typ           Front + spine + back wraparound cover
  assets/
    floral/           SVG motifs lifted from site/src/components/Floral.astro
    fonts/            Self-hosted display + body fonts (Italiana, Cormorant, Inter)
  out/                Generated Typst source (gitignored)
  dist/               Final PDFs (gitignored)
```

## Stretch ideas (after the first proof)

- **Per-recipe header** showing section + recipe title on every spread.
- **Ingredient index** — top 50 ingredients with page references.
- **Photo plates** between chapters on glossy stock.
- **Ribbon marker** — Mixam supports a sewn-in fabric ribbon at extra cost.
- **ISBN + barcode** on back cover for distribution beyond family.
