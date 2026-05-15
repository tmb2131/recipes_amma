// =============================================================================
//  Amma's Kitchen — Print Template
//
//  Page master, palette, fonts, running heads, recipe + chapter layouts,
//  front and back matter. The companion `build.ts` emits a `book.typ` that
//  imports this file and calls #recipe(...) / #chapter(...) for each entry.
//
//  Trim and palette are centralised at the top — swap them in one place to
//  retarget the book.
// =============================================================================

// ---- Trim & paper ----------------------------------------------------------

#let trim = (width: 8.5in, height: 8.5in)
#let page-margins = (top: 20mm, bottom: 22mm, inside: 24mm, outside: 16mm)

// ---- Palette (mirrors site/src/styles/tokens.css) --------------------------

#let palette = (
  paper:           rgb("#faf6ee"),
  paper-deep:      rgb("#f3ecd9"),
  paper-edge:      rgb("#ece2c4"),
  ink:             rgb("#2a1f1a"),
  ink-soft:        rgb("#5b4a3f"),
  ink-faint:       rgb("#8a7a6c"),
  terracotta:      rgb("#b04a2f"),
  terracotta-deep: rgb("#8a3520"),
  gold:            rgb("#c39d4e"),
  gold-soft:       rgb("#d9bd7e"),
  marigold:        rgb("#e8b04a"),
)

// ---- Fonts (vendored in assets/fonts) --------------------------------------

#let fonts = (
  display: "Italiana",
  serif:   "Cormorant Garamond",
  sans:    "Inter",
)

// ---- Running-head state ----------------------------------------------------

#let chapter-state   = state("chapter", "")
#let recipe-state    = state("recipe", "")
#let suppress-chrome = state("suppress-chrome", false)

// ---- Floral helper ---------------------------------------------------------
//
// Loads an SVG from assets/floral/ and recolours `currentColor` to the
// requested fill before passing the bytes to Typst's image renderer.

#let floral(name, color: rgb("#c39d4e"), size: 32pt) = {
  let raw = read("/print/assets/floral/" + name + ".svg")
  let coloured = raw.replace("currentColor", color.to-hex())
  image(bytes(coloured), format: "svg", width: size)
}

// ---- Small UI atoms --------------------------------------------------------

#let badge(label, color: rgb("#8a3520")) = {
  box(
    inset: (x: 6pt, y: 2.5pt),
    radius: 99pt,
    stroke: 0.4pt + color,
    text(font: "Inter", size: 7pt, weight: "medium", tracking: 0.08em, fill: color, upper(label)),
  )
}

#let small-caps(body, color: rgb("#5b4a3f"), size: 8pt, tracking: 0.12em) = {
  text(font: "Inter", size: size, weight: "medium", tracking: tracking, fill: color, upper(body))
}

// ---- Running head & folio --------------------------------------------------

#let running-head() = context {
  if suppress-chrome.get() { return }
  let pn = counter(page).at(here()).first()
  if pn <= 2 { return }
  let chap = chapter-state.get()
  let rec  = recipe-state.get()
  if chap == "" { return }
  set text(font: fonts.sans, size: 7.5pt, tracking: 0.15em, fill: palette.ink-faint)
  set par(leading: 0pt, first-line-indent: 0pt)
  if calc.even(pn) {
    upper(chap)
  } else {
    align(right, emph(rec))
  }
}

#let folio() = context {
  if suppress-chrome.get() { return }
  let pn = counter(page).at(here()).first()
  if pn <= 1 { return }
  set text(font: fonts.sans, size: 8.5pt, weight: "medium", fill: palette.ink-faint)
  align(center, str(pn))
}

// ---- Book show rule (applied once via `#show: book`) -----------------------

#let volume-label(vol) = if vol == 1 { "Volume I" } else { "Volume II" }

#let book(doc, volume: 1) = {
  let vol-name = volume-label(volume)
  set document(
    title: "Amma's Kitchen — " + vol-name,
    author: "Tom & family",
  )
  set page(
    width: trim.width,
    height: trim.height,
    margin: page-margins,
    header: running-head(),
    footer: folio(),
    fill: white,
  )
  set text(
    font: fonts.serif,
    size: 10.5pt,
    lang: "en",
    region: "GB",
    fill: palette.ink,
    hyphenate: true,
    kerning: true,
    ligatures: true,
    number-type: "old-style",
  )
  set par(
    leading: 0.7em,
    first-line-indent: 1.2em,
    justify: true,
    linebreaks: "optimized",
  )

  show heading: it => {
    set text(font: fonts.display, weight: "regular", fill: palette.terracotta-deep)
    block(below: 0.6em, above: 1.2em, it.body)
  }

  show strong: set text(fill: palette.terracotta-deep, weight: "semibold")
  show emph: set text(style: "italic")

  doc
}

// ---- Front matter ----------------------------------------------------------

#let front-matter(volume: 1) = {
  let vol-name = volume-label(volume)

  // --- Cover (full-bleed image) — Volume I only ----------------------------
  if volume == 1 {
    suppress-chrome.update(true)
    set page(
      margin: 0pt,
      header: none,
      footer: none,
      background: image("/Image.jpeg", width: 100%, height: 100%, fit: "cover"),
    )
    pagebreak(weak: true)
    place(
      bottom + center,
      dy: -1.2in,
      block(
        width: 5.6in,
        fill: rgb(250, 246, 238, 230),
        inset: (x: 0.5in, y: 0.4in),
        radius: 2pt,
      )[
        #set align(center)
        #text(font: fonts.display, size: 44pt, fill: palette.terracotta-deep)[Amma's Kitchen]
        #v(6pt)
        #text(font: fonts.display, size: 22pt, fill: palette.terracotta-deep)[Volume I]
      ],
    )
  }

  // --- Restore page chrome for prelims ------------------------------------
  set page(
    margin: page-margins,
    header: running-head(),
    footer: folio(),
    background: none,
  )
  suppress-chrome.update(false)

  // --- Half title ----------------------------------------------------------
  pagebreak(to: "odd")
  align(center + horizon)[
    #text(font: fonts.display, size: 28pt, fill: palette.terracotta-deep)[
      Amma's Kitchen — #vol-name
    ]
  ]

  // --- Title page ----------------------------------------------------------
  pagebreak(to: "odd")
  align(center + horizon)[
    #floral("marigold", color: palette.gold, size: 72pt)
    #v(18pt)
    #text(font: fonts.display, size: 48pt, fill: palette.terracotta-deep)[Amma's Kitchen]
    #v(8pt)
    #text(font: fonts.display, size: 26pt, fill: palette.terracotta-deep)[#vol-name]
    #v(10pt)
    #text(font: fonts.serif, size: 14pt, style: "italic", fill: palette.ink-soft)[A family book of recipes]
    #if volume == 2 [
      #v(8pt)
      #text(font: fonts.serif, size: 12pt, style: "italic", fill: palette.ink-soft)[
        Dressing · Desserts · Sylvestre · Other
      ]
    ]
    #v(48pt)
    #small-caps("Printed for the kitchen counter", color: palette.ink-faint, size: 9pt, tracking: 0.25em)
  ]

  // --- Copyright -----------------------------------------------------------
  pagebreak()
  place(bottom + left, block(width: 100%)[
    #set text(font: fonts.sans, size: 8.5pt, fill: palette.ink-soft)
    #set par(leading: 0.55em, justify: false, first-line-indent: 0pt)
    Amma's Kitchen — #vol-name. \
    #if volume == 2 [
      Continues from Volume I (Indian, Asian, Fish, Soup, Salad). \
    ]
    Recipes collected and adapted over many years. \
    External recipes belong to their original authors and are reproduced \
    here only for private family use.
    #v(0.4em)
    Typeset in Italiana, Cormorant Garamond, and Inter.
    #v(0.4em)
    Printed by short-run hardcover binding.
  ])

  // --- Dedication (Volume I only) ------------------------------------------
  if volume == 1 [
    pagebreak(to: "odd")
    align(center + horizon)[
      #block(width: 3.6in)[
        #set text(font: fonts.serif, size: 14pt, style: "italic", fill: palette.ink-soft)
        For Sriya —
        #v(0.6em)
        a piece of Amma to always remember.
      ]
    ]
  ]

  // --- Table of contents ---------------------------------------------------
  pagebreak(to: "odd")
  text(font: fonts.display, size: 32pt, fill: palette.terracotta-deep)[Contents]
  v(6pt)
  text(font: fonts.serif, size: 11pt, style: "italic", fill: palette.ink-soft)[#vol-name]
  v(12pt)
  context {
    let chapters = query(<chapter-toc>)
    set text(font: fonts.serif, size: 11pt, fill: palette.ink)
    set par(leading: 0.6em, justify: false, first-line-indent: 0pt)
    for ch in chapters {
      let info = ch.value
      let pn = counter(page).at(ch.location()).first()
      block(below: 1.1em)[
        #text(font: fonts.display, size: 18pt, fill: palette.terracotta-deep)[#info.name]
        #h(0.6em)
        #text(font: fonts.sans, size: 8pt, fill: palette.ink-faint)[· #info.count recipes]
        #box(width: 1fr, repeat(text(fill: palette.paper-edge)[ . ]))
        #text(font: fonts.sans, size: 10pt, weight: "medium", fill: palette.ink-soft)[#pn]
      ]
    }
  }
}

// ---- Chapter opener --------------------------------------------------------

#let chapter(name: "", motif: "marigold", count: 0) = {
  pagebreak(to: "odd")
  chapter-state.update(name)
  recipe-state.update("")
  suppress-chrome.update(true)

  // Metadata for the TOC.
  [#metadata((name: name, motif: motif, count: count)) <chapter-toc>]

  // Disable header/footer for the opener only.
  set page(header: none, footer: none)
  align(center + horizon)[
    #floral(motif, color: palette.gold, size: 2.6in)
    #v(28pt)
    #text(font: fonts.display, size: 56pt, fill: palette.terracotta-deep)[#name]
    #v(36pt)
    #small-caps(str(count) + " recipes", color: palette.ink-faint, size: 8.5pt, tracking: 0.32em)
  ]

  pagebreak(weak: true)
  suppress-chrome.update(false)
}

// ---- End of Volume I -------------------------------------------------------

#let volume-one-continuity() = {
  pagebreak(to: "odd")
  align(center + horizon)[
    #block(width: 4.2in)[
      #set align(center)
      #floral("divider", color: palette.gold, size: 1.6in)
      #v(20pt)
      #text(font: fonts.display, size: 22pt, fill: palette.terracotta-deep)[Continued in Volume II]
      #v(14pt)
      #set text(font: fonts.serif, size: 13pt, style: "italic", fill: palette.ink-soft)
      #set par(leading: 0.65em, justify: false, first-line-indent: 0pt)
      Dressing, Desserts, Sylvestre, and Other — \
      with a full recipe index and sources list.
    ]
  ]
}

// ---- Recipe ----------------------------------------------------------------

#let _ingredients-sidebar(ingredients) = {
  if ingredients.len() == 0 { return [] }
  block(
    width: 100%,
    fill: palette.paper-deep,
    inset: (x: 12pt, y: 12pt),
    radius: 4pt,
    stroke: 0.4pt + palette.paper-edge,
  )[
    #small-caps("Ingredients", color: palette.terracotta-deep, size: 8.5pt, tracking: 0.18em)
    #v(6pt)
    #set text(font: "Cormorant Garamond", size: 9.5pt, fill: rgb("#2a1f1a"))
    #set par(leading: 0.55em, first-line-indent: 0pt, justify: false)
    #for ing in ingredients [
      - #ing
    ]
  ]
}

#let recipe(
  title: "",
  section: "",
  slug: "",
  sort-key: "",
  initial: "",
  source: none,
  family: false,
  motif: "marigold",
  ingredients: (),
  method: [],
) = {
  // Track current recipe for the running head.
  recipe-state.update(title)

  // Metadata for the alphabetical and source indexes.
  [#metadata((
    title: title,
    section: section,
    slug: slug,
    sort-key: sort-key,
    initial: initial,
    source: source,
    family: family,
  )) <recipe-index>]

  // Header block: floral mark, title, badges.
  block(width: 100%, above: 1.6em, below: 0.6em)[
    #align(center)[
      #floral(motif, color: palette.gold, size: 22pt)
      #v(6pt)
      #text(font: fonts.display, size: 22pt, fill: palette.ink)[#title]
      #v(4pt)
      #{
        let parts = ()
        if family { parts.push(badge("Family", color: palette.terracotta-deep)) }
        if source != none { parts.push(badge(source, color: palette.ink-soft)) }
        if parts.len() > 0 { parts.join(h(6pt)) }
      }
    ]
  ]

  if ingredients.len() > 0 {
    grid(
      columns: (1.7in, 1fr),
      column-gutter: 14pt,
      _ingredients-sidebar(ingredients),
      block[
        #set par(leading: 0.72em, first-line-indent: 1.2em, justify: true)
        #method
      ],
    )
  } else {
    block[
      #set par(leading: 0.72em, first-line-indent: 1.2em, justify: true)
      #method
    ]
  }

  v(1.2em)
  align(center, floral("divider", color: palette.gold-soft, size: 1.4in))
  v(0.6em)
}

// ---- Back matter -----------------------------------------------------------

#let back-matter(volume: 2) = {
  // --- Alphabetical recipe index (this volume) ----------------------------
  pagebreak(to: "odd")
  chapter-state.update("Index")
  recipe-state.update("")

  text(font: fonts.display, size: 32pt, fill: palette.terracotta-deep)[Index of recipes]
  v(14pt)
  text(font: fonts.serif, size: 10pt, style: "italic", fill: palette.ink-soft)[
    Recipes in Volume II, alphabetised. For Indian through Salad, see Volume I.
  ]
  v(18pt)

  context {
    let entries = query(<recipe-index>)
    let sortable = entries.map(el => (
      title: el.value.title,
      sort-key: el.value.sort-key,
      initial: el.value.initial,
      section: el.value.section,
      page: counter(page).at(el.location()).first(),
    ))
    let sorted = sortable.sorted(key: e => e.sort-key)

    show: columns.with(2, gutter: 18pt)
    set text(font: fonts.serif, size: 9.5pt)
    set par(leading: 0.55em, first-line-indent: 0pt, justify: false)

    let prev-initial = ""
    for e in sorted {
      if e.initial != prev-initial {
        block(above: 0.7em, below: 0.25em, breakable: false)[
          #text(font: fonts.display, size: 14pt, fill: palette.terracotta-deep)[#e.initial]
        ]
        prev-initial = e.initial
      }
      block(below: 0.2em, breakable: false)[
        #e.title
        #h(0.35em)
        #text(font: fonts.sans, size: 7pt, tracking: 0.1em, fill: palette.ink-faint)[#upper(e.section)]
        #box(width: 1fr, repeat(text(fill: palette.paper-edge)[ . ]))
        #text(font: fonts.sans, size: 9pt, fill: palette.ink-soft)[#e.page]
      ]
    }
  }

  // --- Source index --------------------------------------------------------
  pagebreak(to: "odd")
  chapter-state.update("Sources")

  text(font: fonts.display, size: 32pt, fill: palette.terracotta-deep)[Sources]
  v(14pt)
  text(font: fonts.serif, size: 10pt, style: "italic", fill: palette.ink-soft)[
    Recipes attributed to a publication, author, or family member. \
    Family recipes are tagged where they appear in the book.
  ]
  v(18pt)

  context {
    let entries = query(<recipe-index>)
    // Bucket by source via a second query of "has-source" metadata.
    let by-source = (:)
    for el in entries {
      // Skip if no source attached — use a sentinel emitted alongside.
      let v = el.value
      if "source" not in v { continue }
      if v.source == none { continue }
      let key = v.source
      let cur = by-source.at(key, default: ())
      cur.push((title: v.title, section: v.section, page: counter(page).at(el.location()).first()))
      by-source.insert(key, cur)
    }
    let sources = by-source.keys().sorted()

    show: columns.with(2, gutter: 18pt)
    set text(font: fonts.serif, size: 9.5pt)
    set par(leading: 0.55em, first-line-indent: 0pt, justify: false)

    for s in sources {
      let recipes-list = by-source.at(s)
      block(above: 0.9em, below: 0.3em, breakable: false)[
        #text(font: fonts.display, size: 14pt, fill: palette.terracotta-deep)[#s]
        #h(0.5em)
        #text(font: fonts.sans, size: 7pt, fill: palette.ink-faint)[· #recipes-list.len() recipe#if recipes-list.len() != 1 [s]]
      ]
      for r in recipes-list.sorted(key: x => lower(x.title)) {
        block(below: 0.2em, breakable: false)[
          #r.title
          #h(0.35em)
          #text(font: fonts.sans, size: 7pt, tracking: 0.1em, fill: palette.ink-faint)[#upper(r.section)]
          #box(width: 1fr, repeat(text(fill: palette.paper-edge)[ . ]))
          #text(font: fonts.sans, size: 9pt, fill: palette.ink-soft)[#r.page]
        ]
      }
    }
  }

  // --- Closing page --------------------------------------------------------
  pagebreak(to: "odd")
  chapter-state.update("")
  suppress-chrome.update(true)
  set page(header: none, footer: none)
  align(center + horizon)[
    #floral("marigold", color: palette.gold, size: 1.6in)
    #v(16pt)
    #text(font: fonts.display, size: 22pt, fill: palette.terracotta-deep)[Amma's Kitchen]
    #v(6pt)
    #text(font: fonts.serif, size: 12pt, style: "italic", fill: palette.ink-soft)[Volume II]
  ]
}
