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

#import "template.typ": palette, fonts, floral, small-caps

// ---- Inputs ----------------------------------------------------------------
//
// Override these via Typst CLI `--input` flags before each print run.
//
//   --input page-count=600
//   --input paper-thickness=0.0025   // inches per page; Lulu 80lb uncoated ≈ 0.0025"
//
// Defaults below assume a ~600-page book on 80lb uncoated stock.

#let page-count = int(sys.inputs.at("page-count", default: "600"))
#let paper-thickness = float(sys.inputs.at("paper-thickness", default: "0.0025"))
#let spine = page-count * paper-thickness * 1in
#let wrap = 0.75in  // Lulu wrap-around allowance (cover folds inside boards)
#let bleed = 0.125in
#let trim-side = 8.5in
#let trim-height = 8.5in

// Total cover sheet dimensions including bleed on outside edges only.
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

// ---- Photograph fills entire cover ----------------------------------------

#place(
  top + left,
  image("/Image.jpeg", width: 100%, height: 100%, fit: "cover"),
)

// ---- Subtle dark gradient overlay so type reads on any photo --------------

#place(
  top + left,
  rect(
    width: 100%,
    height: 100%,
    fill: gradient.linear(
      angle: 90deg,
      (rgb(20, 14, 10, 100), 0%),
      (rgb(20, 14, 10, 30), 40%),
      (rgb(20, 14, 10, 30), 60%),
      (rgb(20, 14, 10, 110), 100%),
    ),
  ),
)

// ---- Layout zones ----------------------------------------------------------
//
// Coordinate system origin is top-left; everything is placed absolutely.

#let zone(x, y, w, h, body) = place(
  top + left,
  dx: x, dy: y,
  block(width: w, height: h, body),
)

#let back-x  = bleed + wrap
#let spine-x = back-x + trim-side
#let front-x = spine-x + spine
#let inner-y = bleed + wrap
#let inner-h = trim-height

// ---- Front cover (right) --------------------------------------------------

#zone(front-x, inner-y, trim-side, inner-h)[
  #set align(center + horizon)
  #block(
    width: 5.6in,
    fill: rgb(250, 246, 238, 235),
    inset: (x: 0.5in, y: 0.55in),
    radius: 2pt,
  )[
    #floral("marigold", color: palette.gold, size: 0.7in)
    #v(10pt)
    #text(font: fonts.display, size: 48pt, fill: palette.terracotta-deep)[Amma's Kitchen]
    #v(8pt)
    #small-caps("A family book of recipes", color: palette.ink-soft, size: 10pt, tracking: 0.3em)
  ]
]

// ---- Spine ----------------------------------------------------------------
//
// Rotated 90° — set on a tall block matching the spine width.

#if spine > 0.25in {
  zone(spine-x, inner-y, spine, inner-h)[
    #set align(center + horizon)
    #rotate(90deg, origin: center + horizon, reflow: false)[
      #box(width: inner-h)[
        #set align(center + horizon)
        #text(font: fonts.display, size: 22pt, fill: palette.terracotta-deep)[
          Amma's Kitchen
        ]
        #h(0.6in)
        #small-caps("A family book of recipes", color: palette.ink-soft, size: 8pt, tracking: 0.3em)
      ]
    ]
  ]
}

// ---- Back cover (left) ----------------------------------------------------

#zone(back-x, inner-y, trim-side, inner-h)[
  #set align(left + horizon)
  #block(
    width: 5.6in,
    fill: rgb(250, 246, 238, 235),
    inset: (x: 0.5in, y: 0.5in),
    radius: 2pt,
  )[
    #set text(font: fonts.serif, size: 11pt, fill: palette.ink)
    #set par(leading: 0.7em, justify: true)
    #text(font: fonts.display, size: 20pt, fill: palette.terracotta-deep)[
      A family book.
    ]
    #v(10pt)
    The kitchen as a place — a record of the dals and curries from Amma's
    table, the weeknight soups and salads, and a long roll of recipes we've
    collected over the years from the people whose cooking we love.

    Printed to lie flat on the counter, to be spattered with coriander, and
    to outlive any phone screen.
    #v(18pt)
    #align(center, floral("divider", color: palette.gold-soft, size: 1.4in))
  ]
]

// ---- Trim & spine guides (printed lightly — Lulu's preflight reads these) -

#let guide-color = rgb(0, 0, 0, 25)

// Vertical guides at spine edges and trim edges.
#place(top + left, dx: bleed, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
#place(top + left, dx: bleed + wrap, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
#place(top + left, dx: spine-x, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
#place(top + left, dx: front-x, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
#place(top + left, dx: cover-width - bleed - wrap, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
#place(top + left, dx: cover-width - bleed, line(angle: 90deg, length: cover-height, stroke: 0.1pt + guide-color))
