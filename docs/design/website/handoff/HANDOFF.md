# ghostframe website: build handoff

This folder is the complete design for the ghostframe website and everything needed to build it. It is written for
Claude Code. Read this file top to bottom once, then build in the order of section 15.

Design direction: **The Frame**. One gold-cornered rectangle is the lens over the mascot (hero), the terminal window
(demo), the meter (status line), the slot (ghost), and finally docks in the status-line rail for the rest of the page.

## 1. What is in this folder

| Path                           | What it is                                                                                         | How to use it                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `reference/*.html`             | The design as real HTML, one file per board. Opens from disk. Tested (section 14).                 | The source of truth for every size, colour, position and string. |
| `reference/assets/`            | Brand SVGs (unchanged copies), fonts, the hex lattice, the two noise tiles, the field as an image. | Copy into the site's `public/` and `src/assets/`.                |
| `build/tokens.css`             | Every design token as CSS custom properties.                                                       | Map into Tailwind v4 with `@theme`.                              |
| `build/motion.css`             | Every keyframe and transition, exactly as the reference uses them.                                 | Port as written. Percentages and durations are the design.       |
| `build/content.ts`             | Every string on the site, typed, with the source of each fact.                                     | Markup holds no copy. Import from here.                          |
| `build/session.ts`             | The scripted Cockpit session the demo plays, as data.                                              | The demo island renders it.                                      |
| `build/releases.ts`            | The release notes as typed data: a snapshot of `main`, with the shape the page needs.              | Generated in the build (section 16). Use the types as they are.  |
| `build/field.json`             | The glyph field: 140 x 87 cells of characters and brightness.                                      | Drawn to canvas by `build/field-render.ts`.                      |
| `build/field-render.ts`        | The canvas renderer for the field.                                                                 | Use as is.                                                       |
| `build/lighthouserc.json`      | Lighthouse CI budgets.                                                                             | Wire into the site's CI (section 12).                            |
| `tools/build-field.py`         | Regenerates `field.json` and `field-phosphor.png` from the mascot. Output is byte-identical today. | Only if the mascot ever changes.                                 |
| `tools/verify.py` and the rest | The tests the reference passes.                                                                    | Point them at the built site's pages too (section 14).           |
| `screenshots/`, `filmstrips/`  | Full-page captures at 1440 and 390, and frame-by-frame captures of the boot and the eye slip.      | Compare the build against these.                                 |
| `ACCEPTANCE.md`                | The definition of done.                                                                            | Every line must be true before the site ships.                   |
| `REVIEWS.md`                   | What the design reviews checked, flagged and changed.                                              | Context for why things are the way they are.                     |

The reference pages are fixed-width boards (1440 or 390). They show the design exactly; they are not responsive. The
build is responsive by the rules in section 9.

| Reference page                      | Shows                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `Page-1440-a.html`, `-b.html`       | The landing page at 1440, top half and bottom half. Join them end to end.   |
| `Page-390-a.html`, `-b.html`        | The landing page at 390.                                                    |
| `Releases-1440.html`, `-390`        | The release notes page. Filters, the Internal disclosure and the rail work. |
| `Nav.html`                          | The nav's five states, with its measurements.                               |
| `Boot.html`                         | The hero with the boot curtain. Add `?loop` to the URL to watch it repeat.  |
| `D-hero.html`                       | The hero alone: move the pointer.                                           |
| `Footer.html`                       | The footer alone: move the pointer.                                         |
| `NotFound.html`                     | The 404: move the frame to find the ghost.                                  |
| `Components.html`                   | Every component and state, with tokens.                                     |
| `Motion.html`                       | The motion spec: 29 moments, each with trigger, timing and reduced-motion.  |
| `D-terminal`, `D-journey`, `D-eyes` | The frame as terminal, the frame's journey down the page, the eye states.   |
| `Main.html`                         | The product brief and the decisions.                                        |

## 2. Stack

- Astro 5, static output, deployed to Cloudflare Pages. No server code.
- Tailwind v4 (tokens through `@theme`), shadcn/ui for Tabs, Accordion and Slider.
- React only inside two islands: the demo and the status slider, both `client:visible`. Everything else is Astro
  markup plus small TypeScript modules in `<script>` tags: the nav, the hero pointer, the footer light, copy buttons,
  the boot curtain, the motion switch, the release notes page, the 404.
- Fonts self-hosted: `hanken-grotesk-latin-wght-normal.woff2` and `jetbrains-mono-latin-wght-normal.woff2`
  (variable). `font-display: swap`. Preload both with `<link rel="preload" as="font" type="font/woff2" crossorigin>`.
- TypeScript only. This repository fails CI on any tracked `.js` file, so the site keeps to `.ts`, `.tsx` and
  `.astro`. Put the site in its own folder with its own `package.json` (the plugin root must stay free of one), and
  format with the repository's oxfmt config.

Suggested layout:

```text
site/
  astro.config.ts            site: process.env.SITE_URL, output: 'static'
  src/
    content.ts  session.ts   from build/
    releases.ts              generated by tools/read-releases.ts; build/releases.ts is the shape and a snapshot
    field.json  field.ts     from build/
    styles/tokens.css  motion.css
    layouts/Base.astro       head, skip link, boot curtain, motion switch script
    pages/index.astro  releases.astro  404.astro
    components/              Frame, Nav, NavDock, MenuSheet, Ruler, Icon, TitleBlock, ReleaseEntry, ReleaseRail, Section, StatusLine, Tile, Ghost, Meter,
                             CommandRow, CopyButton, Schematic, FeatureRow, CompatRow, PathDiagram, Faq, Footer
    islands/Demo.tsx  StatusSlider.tsx
    scripts/nav.ts  hero.ts  footer-light.ts  boot.ts  motion-switch.ts  copy.ts  releases.ts  not-found.ts
  public/                    brand SVGs, fonts, hex.svg, noise tiles, social card, favicons from docs/design/brand
  tools/                     read-repo-facts.ts  read-releases.ts  check-privacy.ts
```

## 3. Brand rules

- The assets in `docs/design/brand` are final. Use them as they are. Never redraw, recolour or filter the mascot.
  The red, amber and green mascots are separate files, not a tint.
- Gold is for five things only: the eyes, the primary button, focus rings, the frame's corners, the prompt mark.
- Status colours appear only where they mean a state.
- Dark only for 1.0.0. `color-scheme: dark` on `<html>`, `<meta name="theme-color" content="#0B0B0E">`.
- Frames, tiles and title blocks are square. Controls have a 6 px radius, chips 4 px.
- No testimonials, logos, download counts or star counts.
- Copy: plain, active voice, sentence case, numerals for counts. The words on the page are in `build/content.ts`.

## 4. Tokens

`build/tokens.css` is complete. The ones that carry decisions:

- `--text-2: #8C8899` for labels and secondary text. The brief's `#6E6A7A` measures 3.7:1 on the page and fails AA.
- `--text-3: #7F7B8B` (4.8:1) for ruler numerals only.
- Terminal demo dims are lifted for the web: `--term-dim: #8C8899`, `--term-machine-dim: #5E918B`.
- Type: Hanken Grotesk 400 for prose, 600 UI, 700 titles, 800 display. JetBrains Mono for everything the machine
  says. Display is 64 px / 0.98 / -0.04em at 1440 and 40 px at 390; the hero headline is 60 px and 44 px.
- Body 18 px / 1.55, measure 60 to 72 characters. Labels are mono 11 px, uppercase, 0.13em.
- Numbers use `font-variant-numeric: tabular-nums`. Headings use `text-wrap: balance`.

## 5. The cell grid

Everything sits on a terminal cell grid: **8 px wide, 16 px tall** (JetBrains Mono at 13.333 px has an 8 px advance).

- The hero stage is 180 x 56 cells: 1440 x 896 px, in a 900 px tall section.
- Content is 160 columns wide: 1280 px inside 80 px margins. 12 columns, 24 px gutters.
- The hero frame is 72 x 28 cells at column 54, row 9: left 432, top 144, 576 x 448 px.
- The glyph field is 140 x 87 cells, 1120 x 1392 px, placed at left 160, top -376 so the eyes (cell 70, 38) sit
  inside the frame. The mascot SVG is placed at the same origin and size, so image and glyphs register exactly.
- The column ruler under the nav has a tick every 8 px and a numeral every 10 columns. The row ruler down the left
  edge has a numeral every 10 rows and continues down the whole page.
- Page edge lines run at x = 56 and x = 1383. Sections meet at registration crosses.
- Each section starts with a title block: a 36 px band with `FILE NN · NAME · COUNT` on the left and the section's
  row range on the right. Compute the row range from the section's real offset: `floor(top / 16)` to
  `floor(bottom / 16)`. Do it at build time for each breakpoint, or in a tiny inline script; never hard-code it.

Snap rule: every position the script sets on the frame is a multiple of 8 horizontally and 16 vertically.

## 6. The frame

One component, `Frame`: a rectangle with a 1 px inner outline at 18% white and four 16 px gold corner brackets, 2 px
thick, sitting 2 px outside the rectangle. Inside the hero it also has tick marks along its top and left edges (every
8 px and 16 px, longer every 80 px), an inner vignette, and scanlines at 2.8% white every 4 px.

Corner thickness never scales. When the frame changes size the brackets stay 16 px and 2 px.

### 6.1 Hero (`reference/D-hero.html`, script in the page)

Layers, back to front: dot grid; the glyph field on canvas, twice (a blurred bright copy for bloom, then the sharp
copy); fog and the scan band; the frame, which clips the mascot SVG; the crosshair; the nav and ruler; the headline,
lede, buttons and command row; the status-line rail at the bottom.

Pointer behaviour, all in `scripts/hero.ts`, written straight to `style.transform` (no React state, no CSS
variables):

```ts
// k = stage width / 1440. px, py are the pointer in stage coordinates.
x = clamp(round((px - 288) / 8) * 8, 88, 776) // frame left; 288 = half the frame's width
y = clamp(round((py - 224) / 16) * 16, 112, 208) // frame top; 224 = half its height
lens.style.transform = `translate(${x - 432}px, ${y - 144}px)`
image.style.transform = `translate(${432 - x}px, ${144 - y}px)` // counter-move: the mascot stays put, the frame slides over it
pupils.forEach(p => (p.style.transform = `translate(${clamp((px - 720) / 40, -9, 9)}px, ${clamp((py - 262) / 40, -6, 6)}px)`))
```

- The frame eases to each new cell with `transition: transform 380ms cubic-bezier(.16,1,.3,1)`. The image inside has
  the same transition, so the two stay locked. Pupils use 520 ms on the same curve.
- When the pointer leaves, the frame returns to (432, 144) and the pupils to centre.
- The crosshair is two hairlines that follow the pointer with no easing, and a readout: `PTR COL n · ROW n`, or
  `PTR · OFF GRID`. A second readout on the frame shows its own cell: `COL 54 · ROW 9`.
- Where the frame has moved off the face, the glyph field underneath shows a faint gold glow at the eyes. It is
  always there; the frame hides it at rest.
- Touch and coarse pointers: no lens movement. The frame stays on the eyes and the pupils stay centred.
- Reduced motion: the frame jumps to the cell with no easing; pupils stay centred.

The pupils are two dark slits, 10 x 50 px, rotated 14 degrees toward the nose, with a 1 px pale-gold rim, drawn as
HTML over the mascot image at field coordinates (445, 627) and (665, 627). They are the only thing drawn over the
mascot.

### 6.2 The eye slip

Every 13 s the eyes slip for 0.44 s: a 40 ms dip to 38% brightness, a 65 ms crossfade to the red mascot, a 1.2%
swell about the eyes held while red, pupils tighten to `scale(.8, .7)`, one hairline sweeps the frame's height in
180 ms, then 250 ms ease back to gold. Keyframes `hot`, `jit`, `dimr`, `tearl`, `pc` in `build/motion.css`.
`filmstrips/slip-1..7` shows the frames. It never runs under reduced motion or with ambient motion off.

### 6.3 The journey (`reference/D-journey.html`)

One frame element, `position: fixed` while it travels, moved only by `transform`:

1. Hero: the lens, 72 x 28 cells.
2. Hero to demo, over about 600 px of scroll: it scales to the demo's 160 x 41 cells and becomes the terminal's border.
3. Into the status section, over about 400 px: it closes on the context tile.
4. At the ghost section it becomes the 6 x 2 cell slot around the pixel ghost.
5. After that it docks in the rail's slot (320 ms, ease-out) and stays for the rest of the visit.

Use CSS scroll-driven animations (`animation-timeline: view()`) where supported. Where they are not, and under
reduced motion, each section simply has its own static frame at its final size, as the reference pages show. The
static version is the baseline; the travelling frame is the enhancement. Never drive it from a scroll listener that
reads layout.

## 7. Sections, in order

Tops and heights are in the reference. The copy for each is in `build/content.ts` under the same key.

| #   | Key       | 1440 reference            | What it is                                                                                                                                     |
| --- | --------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `hero`    | `Page-1440-a` 0 to 900    | Section 6.1. Headline bottom left, lede and two buttons bottom right, command row under the frame, rail at the bottom.                         |
| 1   | `anatomy` | 900, 712 tall             | Headline and five-part legend left; a schematic of the terminal to scale right (1 column = 5 px, 1 row = 9 px), hatched regions keyed A to E.  |
| 2   | `demo`    | 1612, 1057 tall           | The frame as a terminal, 160 x 41 cells, playing `build/session.ts`. Controls: Pause, Replay, Read as text.                                    |
| 3   | `cockpit` | 2668, 1576 tall           | Five feature rows. Each: a small diagram and name left, a cropped piece of real Cockpit output right, with lettered callouts on a leader line. |
| 4   | `status`  | 4244, 1149 tall           | Big usage numeral and a slider left; three budget tiles right; three eye states; the same line under pressure.                                 |
| 5   | `ghost`   | `Page-1440-b` 0, 956 tall | Mascot as vector, as glyphs, as six cells, with two labelled arrows.                                                                           |
| 6   | `install` | 956, 990 tall             | Three numbered steps left; requirements, the width scale and undo right; a status line under them.                                             |
| 7   | `compat`  | 1946, 725 tall            | Seven environments, each with a mark: TESTED, CI ONLY, UNTESTED, DOES NOT RUN.                                                                 |
| 8   | `how`     | 2671, 508 tall            | Two paths of nodes joined by arrows.                                                                                                           |
| 9   | `privacy` | 3179, 440 tall            | One statement left; nested boxes right: your machine, the session, ghostframe.                                                                 |
| 10  | `faq`     | 3619, 898 tall            | Seven questions. The glyph ghost sits faint under the heading.                                                                                 |
| 11  | `footer`  | 4517, 699 tall            | Section 8.                                                                                                                                     |

Section ids for anchors: `anatomy`, `demo`, `cockpit`, `status-line`, `ghost`, `install`, `compatibility`,
`how-it-works`, `privacy`, `faq`. The nav is section 17. Every section gets `scroll-margin-top: 88px`, which clears
the docked bar.

### 7.1 The demo island

- Markup is real text in `<pre>`, one `<span>` per styled run, on the 8 x 16 grid at 13.333 px. It is the product's
  own output, so a screen reader can read it and a user can select it. Wrap it in `translate="no"`.
- Left: the conversation (turn header, prompt card, thought row, answer with a diff card and a table, receipt).
  Right: the pane (five tabs, head card, timeline with bars on a time axis).
- Playback starts when the section is 40% in view: the prompt types, then steps land one at a time, 40 ms apart,
  each fading in over 180 ms. The rail under the terminal ticks from 41 / 34 / 8 to 47 / 36 / 8.
- The pane's tabs are real `<button role="tab">` elements laid over the text. Timeline and Files are in
  `session.ts`; build Sources, Todo and Agents from `docs/design/cockpit.md`, screens 12.24 to 12.26.
- The selected pane tab is mirrored in the URL as `?pane=files` with `history.replaceState`, and read on load.
- Pause stops playback where it is. Replay starts over. Read as text swaps the terminal for a plain HTML version of
  the same turn (headings, list, table) for anyone who would rather not read a terminal.
- Reduced motion: the finished turn, shown at once.
- At 390 the terminal is cropped to the conversation, with a two-segment switch (Conversation, Pane). It scrolls
  sideways inside its own box (`overflow-x: auto`, `tabindex="0"`, a label); the page never scrolls sideways.

### 7.2 The status slider island

- A shadcn Slider restyled: a 2 px track with the two thresholds marked at 60 and 85, a 28 px square handle (44 px
  on touch) with a gold border. Label: "Context usage". Arrow keys move 1, Page Up and Down move 10.
- It drives one number. At 60 and at 85 the numeral colour, the context tile's edge and surface, the frame corners,
  the pixel ghost's eyes and the mascot file change together. Colour changes take 240 ms; nothing moves.
- The 5-hour and week tiles are a fixed sample. Each tile is a `role="meter"` with a text value.
- A meter is a row of 5 px segments with 3 px gaps, 12 px tall, filled to its percentage (a repeating gradient, not
  one element per segment). The white 5 px block marks even pace.
- Announce threshold crossings once in an `aria-live="polite"` region: "Busy" and "Hot".

### 7.3 Install

- All three steps are in `content.ts`. Step 1 is two commands, each in its own row.
- Each command row has a COPY button: on click it writes to the clipboard, the label becomes COPIED for 1.2 s, and an
  `aria-live` region says "Copied". If the clipboard is blocked, select the command's text instead.
- After any copy in this section, the status line under it redraws its meters, segment by segment, 30 ms apart.
- Step 3's tabs: Windows Terminal, VS Code, Other. Arrow keys move between tabs; the choice is not animated from the
  keyboard.
  The selected tab is mirrored in the URL as `?terminal=vs-code` with `history.replaceState`, and read on load.

### 7.4 FAQ

Native disclosure behaviour through the shadcn Accordion, `type="multiple"`, first two open. The row opens at once;
the answer fades in and rises 4 px over 240 ms. Height is never animated.

## 8. The footer (`reference/Footer.html`)

- Three link columns and a small copy of the hero (field, frame, mascot) top right.
- The wordmark, 1280 x 240 px, is the white wordmark SVG used as a CSS mask over a grey gradient. A hexagonal lattice
  (`hex.svg`, 16 px cell) is masked over the whole footer and over the wordmark.
- Two lights follow the pointer by `transform` with `transition: transform 320ms cubic-bezier(.2,.8,.2,1)`: a 720 px
  radial light clipped to the wordmark (gold core, then pale gold, then white, falling to nothing) and a 1040 px soft
  white light behind the lattice. Both are plain `radial-gradient` divs; no canvas, no WebGL.
- At rest, on touch before the first touch, and under reduced motion, the light parks at the reference's position.
  On touch it follows `pointermove`.
- The ambient motion switch sits in the small print (section 10.4).

## 9. Responsive rules

Designed at 1440 and 390. The rules below define every width between; follow them rather than inventing layouts.

| Width        | Layout                                                                                                                                                                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1440 and up  | The 1440 design, centred. The page background and the two edge lines extend; content stays 1280 px.                                                                                                                                                                                      |
| 1024 to 1439 | The 1440 layout with 48 px margins and fluid columns. The hero stage is the fixed 1440 x 900 cell grid scaled by `width / 1440` with `transform: scale()` from top centre, in a wrapper whose height is `900 * scale`. Nothing reflows inside it. The demo terminal scales the same way. |
| 600 to 1023  | The 390 layout, with the content column capped at 560 px and centred. Two-column groups (requirements, compatibility notes) may sit side by side from 768.                                                                                                                               |
| under 600    | The 390 design, fluid. 20 px margins.                                                                                                                                                                                                                                                    |

- 1024 and 768 are the two widths to check besides 1440 and 390: at 1024 the scaled hero and two-column sections; at
  768 the centred single column.
- Touch targets are at least 44 x 44 px below 1024, and at least 24 x 24 px above.
- The mobile nav is the lockup, the version chip and a menu button that opens a full sheet (section 17).
- At 390 the status line under the hero is the one-line fallback the real product prints under 90 columns:
  `Opus 5.5 · main ● · ctx 41% · 5h 34% · wk 8%`.
- No horizontal page scroll at any width from 320 up. Text can be zoomed to 200% without loss.
- Full-bleed bands respect `env(safe-area-inset-*)`.

## 10. Motion

`reference/Motion.html` lists all 29 moments with trigger, what moves, timing, easing and the reduced-motion
behaviour. `build/motion.css` has the keyframes. The rules behind them:

1. One object moves: the frame. Everything else answers a direct action.
2. Animate `transform` and `opacity` only. Two exceptions, both in the boot curtain and both off the main page:
   `clip-path` for stepped reveals, and `visibility` to keep two heavy layers out of the first paint.
3. Anything the pointer drives is a CSS transition, so it can be interrupted and retargeted. Keyframes are for the
   boot and the ambient accents only.
4. Nothing animates on an action started from the keyboard.
5. Two curves: `cubic-bezier(.2,.8,.2,1)` for direct responses, `cubic-bezier(.16,1,.3,1)` for things with weight.
   Never `ease-in`. Never `transition: all`.
6. Presses scale to 0.97 in 140 ms. Hover styles sit inside `@media (hover: hover) and (pointer: fine)`.
7. Glitch accents are slow and rare, and each is one eased move, never a shake: the eye slip (13 s), the heading
   echo (24 s, staggered by `animation-delay`, only while the heading is in view), the scan band (9 s, hero only).

### 10.1 The boot curtain (`reference/Boot.html`)

What the visitor sees, 1.8 s in all: a terminal log types (`ghostframe --attach`), noise resolves row by row into the
glyph mascot, targeting lines cross, the frame snaps to its cell, a gold slit opens into the eyes, the headline
unscrambles, the curtain flickers away.

How it is built, and why it costs almost nothing:

- The real hero is in the HTML and painted at full opacity from the first frame. The curtain is one
  `aria-hidden="true"`, `pointer-events: none` element on top of it. So the page's LCP is the hero's own, and the
  page is usable underneath at once.
- The curtain's copy of the eyes is a `<canvas>` drawn from the hero's mascot image, never a second `<img>`. A
  second image would sometimes be reported as a later, larger LCP at about 1.8 s. This was measured and fixed; keep
  it.
- Two heavy layers (the row-resolved field and the frame) are `visibility: hidden` until 440 ms and 1200 ms, so
  they stay out of the first paint.
- Timeline, in ms: 0 attach, 420 read, 630 resolve, 1300 dock, 1500 wake, 1650 cut. The curtain element is removed
  from the DOM at 2400 ms.
- It plays once per session (`sessionStorage`, key `gf-boot`). Any key, click, touch or wheel ends it instantly.
- It does not play under `prefers-reduced-motion`, with ambient motion off, or on the 404.
- The script must be inline in `<head>` or directly after the curtain, so a repeat visit never flashes the curtain:
  if `gf-boot` is set, the curtain is `display: none` before first paint.
- The hex dump in the curtain is the page's own copy, encoded. The log lines and marks are in `content.ts`.

Measured on the reference from local disk, cold browser, median of 12 runs each, repeated four times: the hero
without the curtain 256 to 274 ms, with it 302 to 332 ms. The
curtain never produced an LCP entry. `tools/interact.py` repeats this measurement and fails if the gap passes 100 ms.

### 10.2 The glyph field

`build/field-render.ts` draws `field.json` to an offscreen canvas at device pixel ratio up to 2 and copies it into
every `canvas[data-field]`. The hero has two: `data-field="bloom"` (CSS `filter: blur(7px) brightness(1.9)
saturate(1.5)`, opacity 0.55) under `data-field="sharp"`. Both are `aria-hidden`. Each canvas has
`aspect-ratio: 1120 / 1392` and explicit CSS size, so nothing shifts when it paints. The data is 29 KB (6.7 KB
gzipped); import it into the hero's script so it ships with the page, not as a separate request.

`reference/assets/field-phosphor.png` is the same field as an image, for the small uses: the footer, the FAQ ghost,
the ghost section. Serve it through Astro's image pipeline as AVIF and WebP with explicit width and height and
`loading="lazy"`.

### 10.3 Ambient accents

All of them stop under reduced motion and when ambient motion is off. Run the heading echo only while its heading
is on screen (an `IntersectionObserver` toggling a class is enough).

### 10.4 The ambient motion switch

A button in the footer's small print: `AMBIENT MOTION · ON`. It sets `data-motion="off"` on `<html>` and stores the
choice in `localStorage` (`gf-motion`). Off stops every looping accent (eye slip, echo, scan band, carets) and skips
the boot. It exists because those loops run longer than five seconds beside other content (WCAG 2.2.2). Set the
attribute from an inline script in `<head>` so the first paint already respects it. `aria-pressed` carries the state.

## 11. Accessibility

Target: WCAG 2.2 AA. The reference pages pass axe-core with zero violations and a separate contrast check of every
text node. Keep these:

- One `<h1>` per page, `<h2>` per section, `<h3>` inside. Landmarks: `header`, `nav`, `main`, `footer`.
- A skip link as the first focusable element.
- Focus ring: `outline: 2px solid #FFC83D; outline-offset: 3px` on `:focus-visible`. Never remove it.
- Decoration is `aria-hidden`: the field, rulers, crosshair, lattice, title-block ticks, the curtain.
- The mascot in the hero has real alt text. Every other copy of it is decorative (`alt=""`).
- The heading echo's duplicate text is `aria-hidden`. A heading reads once.
- Every `<img>` has `width` and `height`. Without them lazy images in positioned boxes never load.
- Brand name, commands and terminal text carry `translate="no"`.
- The 404's hidden link has `tabindex="-1"` until the frame finds the ghost; the three plain exits are always there.
- `touch-action: manipulation` on links and buttons; `-webkit-tap-highlight-color: transparent` with a real pressed
  state instead.

## 12. Performance budget

| Metric                 | Budget         | How the design meets it                                                                                                                                       |
| ---------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighthouse, all four   | 95 or more     | Static HTML, two fonts, no third-party requests.                                                                                                              |
| LCP                    | under 1.8 s    | The LCP element is the hero mascot SVG (21 KB) or the headline. `fetchpriority="high"` on the mascot. The field is canvas. The curtain adds no LCP candidate. |
| CLS                    | 0              | Every image and canvas has fixed dimensions. Fonts swap inside fixed line boxes. Nothing is inserted above content.                                           |
| JavaScript, first load | 120 KB or less | No React above the fold. Hero, boot, copy and footer scripts are a few KB of TypeScript. React loads when the demo or slider scrolls into view.               |
| Fonts                  | 2 files        | Variable woff2, latin subset, preloaded.                                                                                                                      |

`build/lighthouserc.json` asserts these on `/`, `/releases/` and `/404.html`. Run it in the site's CI with `@lhci/cli` against the
built `dist/`. Run it for mobile as well by adding a second run without the desktop preset; the budgets are the same.

Lighthouse has not been run on this design, because it can only be run on the built site. The numbers above are
budgets that CI enforces, not results.

## 13. Facts from the repository

Every factual claim on the site was checked against `github.com/tashfiqul-islam/ghostframe` at commit `df9ab55`
(28 November 2026). Sources are noted beside each value in `build/content.ts`.

| Claim on the page                                              | Source                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| The two plugin install commands                                | `README.md`, "02 Install"; `.claude-plugin/marketplace.json`               |
| Claude Code 2.1.329 up to 2.2.0, dormant outside it            | `.claude-plugin/plugin.json`, `engines`; `README.md` requirements          |
| It makes no network requests                                   | `README.md`; no fetch, socket or HTTP code under `hooks/` or `statusline/` |
| Installer writes one key, shows the diff, backs up             | `README.md`; `docs/design/statusline.md`                                   |
| 55 ms and 123 ms per frame, renderer under 2 ms                | `docs/design/statusline.md`                                                |
| Pane from 144 columns; status line two rows from 90            | `README.md` requirements; `docs/guide/compatibility.md`                    |
| Windows tested live; Linux in CI and WSL; macOS in CI only     | `docs/guide/compatibility.md`                                              |
| Release notes: summary, highlights, also, requirements, limits | `docs/development/releases/1.0.0.md`                                       |
| Release notes: Features, Fixes, Docs, Internal                 | `git log 128622c..df9ab55`, grouped by `release-please-config.json`        |
| MIT                                                            | `LICENSE`                                                                  |

Two values are read when the site is built, by `site/tools/read-repo-facts.ts`, which fills the `FROM_REPO` entries
in `content.ts`. `astro build` throws while either is missing; `astro dev` shows a hatched placeholder.

1. **The version**: `.claude-plugin/plugin.json`, `version` (`1.0.0` at `df9ab55`). The nav chip, the footer and the
   boot log use it.
2. **The site's origin**: the `SITE_URL` environment variable, for canonical and Open Graph URLs
   (`docs/design/brand/head.html` still says `YOUR-DOMAIN`).

Two guards run in the site's CI:

- `site/tools/check-privacy.ts` fails if any file under `hooks/` or `statusline/` imports `node:http`, `node:https`,
  `node:net`, `node:tls` or `node:dgram`, or calls `fetch(`, `WebSocket(` or `Bun.connect(`. The privacy statement
  stays true or the build stops.
- A launch gate: the build throws unless `plugin.json` has `version` 1.0.0 or later and `userConfig.cockpit.default`
  is `true`. Both hold at `df9ab55`.

## 14. Tests

Run from this folder. They need Python 3.10 or later, `pip install playwright`, Chrome, and `npm i axe-core`.

| Script              | Checks                                                                                                                                                                                                             | Result on the reference |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `tools/verify.py`   | Console errors, text that overflows or is clipped, axe-core with the WCAG 2.0, 2.1 and 2.2 A and AA rule sets, 17 pages                                                                                            | 0, 0, 0                 |
| `tools/contrast.py` | Every text node against its resolved background                                                                                                                                                                    | 0 failures              |
| `tools/interact.py` | 30 behaviours: nav frame and dock, release filters and rail, lens snap and clamp, pupils, eye slip frames, footer light, 404 reveal, boot skip, once per session, reduced motion, LCP with and without the curtain | 30 pass                 |
| `tools/lcp.py`      | Median LCP per page, cold browser per run                                                                                                                                                                          | under 400 ms locally    |

For the built site, port `interact.py`'s checks to Playwright tests in the site's own suite and keep the axe run.

## 15. Build order

1. Scaffold `site/`. Copy `build/` sources and `reference/assets/`. Wire tokens into Tailwind.
2. `Base.astro`: head, fonts, skip link, the inline motion and boot scripts.
3. Static sections in page order, at 1440, matching `screenshots/landing-1440-part-1.png` and `part-2.png`.
4. Responsive rules of section 9. Match `screenshots/landing-390-part-1.png` and `part-2.png`.
5. Hero script, footer light, copy buttons, 404.
6. The demo island, then the slider island.
7. The boot curtain. Compare with `filmstrips/boot-01..14`.
8. Ambient accents and the travelling frame.
9. The nav in all five states (section 17), then `/releases` (section 16).
10. `read-repo-facts.ts`, `read-releases.ts`, `check-privacy.ts`, the launch gate, Lighthouse CI.
11. Go through `ACCEPTANCE.md`.

## 16. The release notes page (`reference/Releases-1440.html`, `Releases-390.html`)

A separate page at `/releases`. One long entry per version, newest first, with a sticky rail. It is a reading page:
no boot curtain, no scan band outside the version frame.

Layout at 1440, top to bottom:

1. The nav, with Releases current.
2. Header: the headline and lede left; right, a frame holding the latest version in 96 px mono, its state, the
   commit count and the compare range. Under them, two links (Atom feed, Releases on GitHub) and "The road to
   1.0.0": commits per day as segmented bars, drawn from `page.road.days`. It is a `role="img"` with the numbers in
   its label.
3. The filter bar, 56 px: All, Features, Fixes, Docs,
   Internal, each with its count. They are toggle buttons (`aria-pressed`); one is always on. A filter hides the
   other groups with `hidden`; highlights and the rest stay. The choice is mirrored as `?show=fixes`.
   Pressing `f` moves focus to the first chip, unless focus is in a field.
4. The entry, two columns: a 232 px rail and the article (up to 976 px).
   - Rail: `position: sticky; top: 96px`. The version in a small frame, then one link per part of the entry, each
     36 px tall, on a vertical line. One gold square slides to the part in view
     (`transform: translateY(index * 36px)`, 380 ms, expo-out), driven by an `IntersectionObserver` on the headings
     with `rootMargin: -20% 0px -70% 0px`. The link in view gets `aria-current="location"`.
   - Article, in this order: state chip and compare range; the title; the summary; Highlights (a 2 x 2 grid, each a
     cropped piece of real output, a title and a sentence); Also in this version (tagged rows); then one list per
     group; Requirements and Known limits side by side; Install; and, on the oldest version only, the start-of-history
     line.
   - A change row is a four-column grid: scope (104 px, coloured: hooks teal, cockpit gold, statusline amber, the
     rest grey), the sentence, the pull request number, the short commit. Both numbers link to the repository.
   - Internal is closed by default: a 48 px button with `aria-expanded` that shows the list.
5. The footer.

At 390: one column. The rail becomes a 48 px bar with the version and a section picker (a native `<select>` styled
as the button shown). Filter chips wrap to two rows, 44 px tall. A change row stacks: scope and numbers on one line,
the sentence under it. Highlight visuals clip on the right under a fade.

Two states of a version, both in `page.states`:

- `on main · not tagged yet` (amber): `release.date` is `null`. This is the state at `df9ab55`, and what the
  reference shows.
- A dated release: the chip reads `latest` (green) on the newest one, and the date sits beside it as
  `28 Nov 2026` in mono. Older versions show the date alone.

Where the data comes from, in `site/tools/read-releases.ts`, run before `astro build`:

1. Read `CHANGELOG.md` (release-please writes it). Each `## [x.y.z]` heading is a release with its date; each
   `### Section` under it is a group; each bullet is a change with its scope, text, pull request and commit.
2. For each version, if `docs/development/releases/<version>.md` exists, take the summary paragraph, the
   Highlights, "Also in", Requirements and Known limits from it. Map each highlight to a visual by its position.
3. If the version in `plugin.json` has no entry in `CHANGELOG.md` yet, build it from
   `git log <bootstrap-sha>..HEAD` on `main`, grouped by the `changelog-sections` in `release-please-config.json`
   (hidden types left out), with `date: null`.
4. Write `site/src/releases.ts` with the types in `build/releases.ts`. Fail if no release results.

The page links to the host's Atom feed at `releases.atom`; it does not build its own.

## 17. The nav (`reference/Nav.html`)

The nav is a small frame. Five states, all on the board.

- **At the top.** An 80 px band on the page grid. Left: the lockup, then four numbered links in one 40 px track with
  a 1 px outline: `01 COCKPIT`, `02 STATUS LINE`, `03 INSTALL`, `04 RELEASES`. Link widths are 112, 144, 112 and
  120 px. Right: the version chip with a green dot (to `/releases`), two 40 px icon buttons (Docs, Source), and an
  outlined Install button with a gold arrow. Install is quiet here because the hero has the gold button.
- **Pointer or focus.** One element, the indicator, is a 40 px block on `--surface-1` with four 6 px gold corners.
  It slides to the link under the pointer with `transition: transform 240ms var(--ease-out)`, and fades in 140 ms
  if it was hidden. On focus from the keyboard it jumps: set `transition-duration: 0ms` first. When the pointer
  leaves the track it returns to the current page's link, or hides if there is none.
- **Label decode.** On pointer enter, the link's label resolves left to right in four frames, 30 ms apart, from the
  glyphs `/ \ | - _ = + x #`. Fine pointers only; never under reduced motion or with ambient motion off. The link
  keeps a fixed `aria-label`, so its name never changes. Section title-block labels do the same once, as they enter
  view, in five frames: an `aria-hidden` clone animates over the real text, which only turns transparent.
- **Current page.** The link has `aria-current="page"`, its number turns gold, and the indicator rests on it.
- **Docked.** After the first 96 px of scroll (an `IntersectionObserver` on a 96 px sentinel, not a scroll
  listener), a second bar appears: `position: fixed; top: 12px`, 1088 px wide, centred, 56 px tall,
  `rgba(11,11,14,.88)` with `backdrop-filter: blur(14px) saturate(1.4)`, a 1 px outline and four 12 px gold corners.
  It enters with `opacity` and `translateY(-12px)` in 240 ms and is `inert` until shown. It holds the lockup at
  24 px, the same four links, a readout `ROW 0281 / 0668`, the Source icon and a gold Install button.
  - The indicator tracks the section in view (`rootMargin: -45% 0px -50% 0px`): anatomy, demo and cockpit map to
    Cockpit; status line and ghost to Status line; install and compatibility to Install. That link gets
    `aria-current="location"`.
  - The readout is `floor(scrollY / 16)`, zero-padded to four digits, and the page's total rows. A 1 px gold line
    along the bottom edge is progress, by `scaleX`. Both update once per animation frame from a passive scroll
    listener that reads only `scrollY`. No easing: they are instruments.
- **390, menu open.** The bar is 56 px: lockup, version chip, a 44 px menu button. The menu is a full-height sheet:
  four 64 px rows in 30 px display type with their numbers, the current page marked with a gold square, then Docs
  and Source, then a gold Install button. Build it on the shadcn Sheet (a real dialog: focus trapped, `Esc` closes,
  focus returns to the button). The sheet fades in over 240 ms and the rows rise 8 px, 30 ms apart.

Icons are drawn for this site on a 24 px grid with 1.5 px square-capped strokes: `docs`, `feed`, `arrow`, `copy`,
`close`, `out`, and `repo`, a neutral branch glyph. For the Source link, use GitHub's official mark from its brand
assets in place of `repo`, at the same 18 px size and in `currentColor`. The reference does not redraw that mark.

Every icon-only control has an `aria-label`. Nowhere on the site is a link labelled only with a host's name.
