// =============================================================================
//  Amma's Kitchen — Wraparound Cover
//
//  A single landscape page laid out as back-cover | spine | front-cover for
//  upload to Lulu (or any short-run hardcover printer). Compile separately:
//
//    typst compile cover.typ dist/cover.pdf \
//      --root .. --font-path assets/fonts \
//      --input page-count=600
//
//  The spine width is computed from `page-count` × paper-thickness. See
//  Lulu's spine calculator and the README for the exact formula.
// =============================================================================

#import "template.typ": palette, fonts

// ---- Inputs ----------------------------------------------------------------
//
// Override these via Typst CLI `--input` flags before each print run.
//
//   --input page-count=600
//   --input paper-thickness=0.0025   // inches per page; Lulu 80lb uncoated ≈ 0.0025"

#let page-count = int(sys.inputs.at("page-count", default: "600"))
#let paper-thickness = float(sys.inputs.at("paper-thickness", default: "0.0025"))
#let spine = page-count * paper-thickness * 1in
#let wrap = 0.75in   // Lulu wrap-around allowance (cover folds inside boards)
#let bleed = 0.125in
#let trim-side = 8.5in
#let trim-height = 8.5in

// Total cover sheet dimensions including bleed + wrap on outside edges.
#let cover-width = (trim-side * 2) + spine + (wrap * 2) + (bleed * 2)
#let cover-height = trim-height + (wrap * 2) + (bleed * 2)

// ---- Page setup ------------------------------------------------------------

#set page(
  width: cover-width,
  height: cover-height,
  margin: 0pt,
  fill: palette.paper,
)

#set text(font: fonts.serif, fill: palette.ink, lang: "en")

// ---- Layout coordinates ----------------------------------------------------

#let back-x  = bleed + wrap
#let spine-x = back-x + trim-side
#let front-x = spine-x + spine
#let inner-y = bleed + wrap
#let inner-h = trim-height

// Back photo fills everything left of the spine (back cover + outer wrap + bleed).
#let back-w = spine-x
// Front photo fills everything right of the spine (front cover + outer wrap + bleed).
#let front-w = cover-width - front-x

// ---- Back-cover photo (left half, full-bleed to spine) --------------------

#place(
  top + left,
  dx: 0pt, dy: 0pt,
  image("/BackCover.jpeg", width: back-w, height: cover-height, fit: "cover"),
)

// ---- Spine: solid cream (so the spine title reads cleanly) ----------------

#place(
  top + left,
  dx: spine-x, dy: 0pt,
  rect(width: spine, height: cover-height, fill: palette.paper-deep, stroke: none),
)

// ---- Front-cover photo (right half, full-bleed to spine) ------------------

#place(
  top + left,
  dx: front-x, dy: 0pt,
  image("/Image.jpeg", width: front-w, height: cover-height, fit: "cover"),
)

// ---- Subtle bottom-gradient on the front so the title reads --------------
//
// Darkens only the lower third of the front cover, leaving the photograph
// itself untouched in the upper portion.

#place(
  top + left,
  dx: front-x, dy: 0pt,
  rect(
    width: front-w,
    height: cover-height,
    fill: gradient.linear(
      angle: 0deg,
      (rgb(20, 14, 10, 0), 0%),
      (rgb(20, 14, 10, 0), 55%),
      (rgb(20, 14, 10, 170), 100%),
    ),
    stroke: none,
  ),
)

// ---- Front-cover title ----------------------------------------------------
//
// Positioned over the darkened lower portion of the photo, centred within
// the trimmed front-cover area (so wrap-around and bleed never clip it).

#place(
  top + left,
  dx: front-x, dy: inner-y,
  block(width: trim-side, height: inner-h)[
    #set align(center + bottom)
    #block(inset: (bottom: 0.75in))[
      #text(font: fonts.display, size: 60pt, fill: rgb("#faf6ee"))[
        Amma's Kitchen
      ]
    ]
  ],
)

// ---- Spine title ----------------------------------------------------------
//
// Only renders if the spine is wide enough to hold readable type
// (~0.25" minimum for Lulu).

#if spine > 0.25in {
  place(
    top + left,
    dx: spine-x, dy: inner-y,
    block(width: spine, height: inner-h)[
      #set align(center + horizon)
      #rotate(90deg, origin: center + horizon, reflow: false)[
        #box(width: inner-h)[
          #set align(center + horizon)
          #text(font: fonts.display, size: 24pt, fill: palette.terracotta-deep)[
            Amma's Kitchen
          ]
        ]
      ]
    ],
  )
}

// ---- Trim & spine guides --------------------------------------------------
//
// Hair-line guides for our own preflight review; printers ignore these but
// they help when checking the PDF against Lulu's template.

#let guide-color = rgb(0, 0, 0, 25)

#place(top + left, dx: bleed, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
#place(top + left, dx: bleed + wrap, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
#place(top + left, dx: spine-x, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
#place(top + left, dx: front-x, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
#place(top + left, dx: cover-width - bleed - wrap, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
#place(top + left, dx: cover-width - bleed, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
