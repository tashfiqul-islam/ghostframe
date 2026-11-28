# PR 1, the site foundation: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the walking skeleton into the site's foundation: tokens, fonts, the page grid, the nav in its five
states, the footer with its light, the 404 with find-the-ghost, robots.txt and the sitemap, on the checks and CI job
the skeleton proved.

**Architecture:** Astro 7 static pages over plain CSS (`tokens.css` the only token source) and small TypeScript
modules, one per piece, wired with `wire<Piece>(root)` from an `.astro` `<script>` that only imports and calls it.
Repository facts reach pages only through `build/site-data`. Every piece has its `*.e2e.ts` beside it.

**Tech Stack:** Astro 7.4.13, TypeScript 7.0.2 and tsrs, Bun 1.4.4 (`bun test`, `*.spec.ts`), Playwright 1.65.1 with
axe 4.14.1, Lighthouse 13.6.0, fontTools 4.69.1 (subsets only).

**Spec:** [stack.md](../stack.md), the ADRs 0013 to 0028, [GLOSSARY.md](../GLOSSARY.md),
[handoff/HANDOFF.md](../handoff/HANDOFF.md) sections 3 to 5, 8 to 11 and 17, and the artboards `Nav`, `Footer`,
`NotFound`, `Components`, `Page-1440-a/b`, `Page-390-a/b`. The reference pages for screenshots are in the owner's main
checkout, `D:\Projects\ghostframe\docs\design\website\reference\` (read, never committed).

## Global Constraints

- TypeScript only: no hand-written `.js`, `.mjs`, `.cjs`, `.jsx`. In `.astro`, `<script>` without `lang`.
- Colours, spacing, radii, motion values and breakpoints only from `src/styles/tokens.css`; a new value is a new token.
- Words in `src/content/words.ts`; facts never there. Tests import words and facts, never paste them.
- Unit tests `*.spec.ts` beside their module; browser tests `*.e2e.ts` beside their piece.
- A piece lives in the folder of its glossary section, named with the glossary's word.
- Motion: `transform` and `opacity` only; `cubic-bezier(.2,.8,.2,1)` for responses, `cubic-bezier(.16,1,.3,1)` for
  weight; never `ease-in` or `transition: all`; nothing animates on a keyboard action; hover only inside
  `@media (hover: hover) and (pointer: fine)`; presses scale 0.97 in 140 ms.
- Under reduced motion and with `data-motion="off"`: no slide, no decode, no dock transition, no loop; states still change.
- Gold only for: the eyes, the primary button, focus rings, the frame's corners, the prompt mark (and the nav frame's
  corners and the progress line, which are frame corners and the frame's instrument).
- Focus ring `outline: 2px solid var(--gold); outline-offset: 3px` on `:focus-visible`, never removed.
- Touch targets 44 × 44 px below 1024, 24 × 24 above. No sideways page scroll from 320 to 1920.
- Every page: Lighthouse 100 × 4 and Agentic Browsing 3 of 3, mobile and desktop; scripts under 120 KB gzipped; CLS 0;
  mobile LCP under 1.8 s; axe clean at WCAG 2.2 AA; no running animation under reduced motion.
- Never weaken an assertion, raise a timeout or loosen a budget to pass. A failing test means the code is wrong.
- Commits signed, scope `site` (or `ci` for the workflow), body lines under 100 characters.

## Review Focus

1. **Storage blocked** (private mode, `localStorage` throws): the ambient motion switch still works for the visit and
   the page renders; Task 5 tests it with storage stubbed to throw.
2. **No JavaScript:** the nav rests on the current page, the docked bar never shows, the menu button is a link to the
   footer's link list, the 404 shows the found state with its exits, the footer light is parked. Task 6, 7, 8 each test
   their piece with `javaScriptEnabled: false`.
3. **Scaled stage between 1024 and 1439:** pointer maths divides by `k = rect.width / 1440`, so the search frame and the
   footer light land under the pointer at 1280 too. Tasks 7 and 8 test at 1280.
4. **Keyboard only:** every control reachable in order, the nav frame jumps without a transition, the menu sheet traps
   focus, closes on Esc and returns focus to its button. Task 6 tests it.
5. **Long or missing glyphs:** a character a page uses that no font holds falls back to another width and breaks the cell
   grid; Task 2's coverage test fails naming it.

---

### Task 1: Tokens, the design record, and the drift spec

**Files:**

- Modify: `site/src/styles/tokens.css`, `site/build/tokens/tokens.ts`, `site/build/tokens/tokens.spec.ts`,
  `site/src/content/Words.astro` (its `@media` width)
- Create: `site/build/tokens/design-record.spec.ts`
- Add: `site/PRODUCT.md`, `site/DESIGN.md` (written by `/impeccable init` and `document`; owner approved)

**Interfaces:**

- Produces: tokens `--line-3: #3a3a47`; `--space-1` to `--space-8` = 4, 8, 16, 24, 32, 48, 64, 96 px; `--radius-frame:
  0`; `--ease-weight: cubic-bezier(0.16, 1, 0.3, 1)`; `--stagger: 30ms`; `--slide: 380ms` (frame and rail marker);
  `--pupil: 520ms`; type tokens `--type-display` 64px, `--type-display-phone` 40px, `--type-hero` 60px,
  `--type-hero-phone` 44px, `--type-title` 24px, `--type-lead` 22px, `--type-body` 18px, `--type-mono` 14px,
  `--type-label` 11px, `--track-label: 0.13em`; breakpoints replacing `--bp-phone`: `--bp-narrow: 1023px` (the 390
  layout below it, HANDOFF §9), `--bp-fluid: 599px` (20 px margins below it), `--bp-pair: 768px` (two-column groups
  from it). `readDesignRecord(markdown): { colors, spacing, rounded, typography }` in `build/tokens/tokens.ts`.
- [ ] **Step 1:** In `tokens.spec.ts`, extend the artboard expectations with `--line-3` `#3a3a47` (stack.md, broken
      colours) and the spacing, radius, motion and type values above, as literals from the Components artboard files 12
      and 13. Write `design-record.spec.ts`: every colour, spacing step, radius, typography size, weight, line height and
      tracking in `site/DESIGN.md`'s frontmatter equals the token in `tokens.css` that names it, and every `--bp-*` token
      appears in DESIGN.md's Layout prose. Map: `colors.X` to `--X`; `spacing."n"` to `--space-n`; `rounded.chip|button|
  frame` to `--radius-*`; `typography.display.fontSize` to `--type-display`, and so on.
- [ ] **Step 2:** `cd site && bun test build/tokens` fails on the missing tokens.
- [ ] **Step 3:** Add the tokens; write `readDesignRecord` (parse the YAML frontmatter with `Bun.YAML.parse`); move
      `Words.astro` to `@media (max-width: 1023px)`; update DESIGN.md's frontmatter keys to match the token names exactly.
- [ ] **Step 4:** `bun test build/tokens` passes; `bun run check` passes. Plant a drift (DESIGN.md `line-3` to
      `#3a3a48`) and see `design-record.spec.ts` fail naming it; revert.
- [ ] **Step 5:** Commit `feat(site): tokens for the grid, type and motion; DESIGN.md held to them`.

### Task 2: Font subsets and the glyph face

**Files:**

- Create: `site/build/fonts/subset.ts`, `site/build/fonts/glyphs.ts`, `site/build/fonts/fonts.spec.ts`,
  `site/public/fonts/hanken-grotesk.woff2`, `jetbrains-mono.woff2`, `julia-mono-glyphs.woff2`, `OFL-*.txt` (one per
  family), `site/public/fonts/coverage.json`, `site/src/styles/fonts.css`, `site/tests/fonts.e2e.ts`
- Modify: `mise.toml` (`"pipx:fonttools" = "4.69.1"`), `site/src/layouts/Page.astro` (preloads), `site/AGENTS.md`

**Interfaces:**

- Produces: `GLYPHS` (the code points every subset keeps: printable ASCII, U+2500–257F, U+2580–259F, and the symbols
  the design draws: `❯ → ↗ ← ↑ ↓ · × — – ● ○ ■ □ ▸ ▾ … ’ “ ”` plus every character in `words.ts` and the handoff's
  `session.ts`); `coverage.json`: `{ "<file>": { "sha256": "...", "codePoints": [...] } }`, written by `subset.ts` in the
  same run as the woff2 files.
- [ ] **Step 1:** `fonts.spec.ts`: each woff2's sha256 equals its `coverage.json` entry (so the manifest cannot drift
      from the file); the glyph face holds exactly U+2713, U+21BB, U+2234, U+25AE; JetBrains Mono holds U+2500, U+2580,
      U+276F; Hanken Grotesk holds every character of `words.ts`. `fonts.e2e.ts`: on every built page, for each text
      node, the first family of its computed `font-family` (with the glyph face counted for its four code points) holds
      each character; a failure names the page, the character and the family.
- [ ] **Step 2:** Both fail (no fonts).
- [ ] **Step 3:** `subset.ts` downloads the upstream variable fonts at pinned URLs and sha256s (google/fonts
      `ofl/hankengrotesk/HankenGrotesk[wght].ttf` and `ofl/jetbrainsmono/JetBrainsMono[wght].ttf` at one commit;
      JuliaMono v0.63.2 Regular from its GitHub release), runs `pyftsubset` (Hanken weights 400–800, JetBrains 400–500,
      `--layout-features-=liga,calt` on JetBrains, no hinting, `--flavor=woff2`), and writes `coverage.json` from the
      subset's cmap (`fonttools ttx -t cmap` or a short Python `-c`). Downloads go to a fresh temp directory. `fonts.css`:
      three `@font-face` with `font-display: swap`; the glyph face with `unicode-range: U+2713, U+21BB, U+2234, U+25AE`,
      `font-weight: 400 500`, `ascent-override: 102%; descent-override: 30%; line-gap-override: 0%`; fallback faces
      `Hanken Fallback` and `Mono Fallback` (Courier New) with Capsize metric overrides. Page.astro preloads the two main
      woff2 files only.
- [ ] **Step 4:** `bun run check` passes; record each woff2's size (budget: Hanken about 15.7 KB, JetBrains about
      11.7 KB, glyphs 908 B).
- [ ] **Step 5:** Commit `feat(site): font subsets with the terminal's glyphs, and a coverage test`.

### Task 3: Facts the nav and footer state

**Files:** Modify `site/build/facts/facts.ts`, `facts.spec.ts`, the site-data fixture `plugin.json`.

**Interfaces:** `Facts` gains `repository: string` (plugin.json `repository`, an `https://github.com/` URL) and
`licence: string` (plugin.json `license`). Docs link = `${repository}/tree/main/docs`, built where used.

- [ ] **Step 1:** Specs: the fixture gives `repository` and `licence` literally; a plugin.json without `repository`
      throws `fact "repository": .claude-plugin/plugin.json has no "repository"`; same for `license`.
- [ ] **Step 2:** Fail. **Step 3:** Implement. **Step 4:** Pass. **Step 5:** Commit
      `feat(site): the repository and licence as facts`.

### Task 4: The page grid and the layout

Artboards: `Page-1440-a` (edge lines, rulers, registration crosses, title blocks), `Page-390-a`, `Nav` (ruler under
the nav). HANDOFF §5 and §9.

**Files:**

- Modify: `site/src/layouts/Page.astro`, `site/src/styles/base.css`
- Create: `site/src/page/Ruler.astro`, `site/src/page/TitleBlock.astro`, `site/src/page/title-block.ts`,
  `site/src/page/title-block.e2e.ts`, `site/src/page/grid.e2e.ts`

**Interfaces:**

- Produces: `Page.astro` props `{ title, description, current?: 'cockpit' | 'status-line' | 'install' | 'releases' }`;
  slots: default (inside `<main id="main">`). Page renders, in order: skip link (first focusable, to `#main`),
  `<header>` with the Nav (Task 6), the column ruler, `<main>`, the Footer (Task 7). The head carries the inline
  ambient-motion script (Task 5). `TitleBlock.astro` props `{ file: string; name: string; count: string }`, renders
  the 36 px band; `wireTitleBlocks(root: ParentNode): void` writes each block's `rows A to B` from
  `floor(top / 16)` to `floor(bottom / 16)` of its section (divided by the stage scale), with a ResizeObserver; the
  build prints the 1440 range as the no-JS text.
- [ ] **Step 1:** `grid.e2e.ts`: at 1440 the content box is 1280 px wide at x = 80; edge lines at x = 56 and 1383; at
      390 margins are 20 px; at 320, 390, 768, 1024, 1280, 1440 and 1920 `scrollWidth === clientWidth` on every page; the
      skip link is the first focusable element and moves focus to `main`. `title-block.e2e.ts`: a title block reads its
      section's real row range at 1440 and 390, and keeps the build's text without JS.
- [ ] **Step 2:** Fail. **Step 3:** Build it from the artboards' markup: read `Page-1440-a.dc.html` and the reference
      page for exact sizes; ticks by repeating gradients; numerals every 10 columns and every 10 rows; decoration
      `aria-hidden`. **Step 4:** Pass, then `bun run check`.
- [ ] **Step 5:** Commit `feat(site): the page grid, rulers and title blocks`.

### Task 5: Ambient motion switch

GLOSSARY: ambient motion. HANDOFF §10.4. Artboard: `Footer` small print.

**Files:** Create `site/src/motion/ambient-motion.ts`, `site/src/motion/head.ts` (the inline head script's source),
`site/src/motion/ambient-motion.e2e.ts`; modify `Page.astro`.

**Interfaces:** `wireAmbientMotion(button: HTMLButtonElement): void`; the head script sets `data-motion="off"` on
`<html>` before first paint when `localStorage['gf-motion'] === 'off'`; both wrap storage in `try`/`catch`. The switch
label is `words.footer.motionSwitch` + ` · on|off`, `aria-pressed` carries the state. Without JS the switch is hidden.

- [ ] **Step 1:** e2e: pressing the switch sets `data-motion="off"`, `aria-pressed="false"`, the label reads `off`, and
      a reload keeps it; with `localStorage` stubbed to throw (`addInitScript`), the switch still toggles for the visit and
      no console error is logged; with JS off the switch is not shown; the page runs under the shipped CSP (the head script
      is hashed by `build/headers`).
- [ ] **Step 2:** Fail. **Step 3:** Implement (the head script is inlined with `is:inline`, built from `head.ts`'s
      source at build time so no hand-written JS exists). **Step 4:** Pass. **Step 5:** Commit
      `feat(site): the ambient motion switch, set before first paint`.

### Task 6: The nav, in all five states

Artboard: `Nav` (all five states and its measurement notes); HANDOFF §17; inventory rows 32 to 37.

**Files:** Create in `site/src/nav/`: `Nav.astro`, `NavFrame` styles inside it, `nav.ts` (`wireNav`), `label-decode.ts`
(`decodeLabel`), `docked-bar.ts` (`wireDockedBar`), `MenuSheet.astro`, `menu-sheet.ts` (`wireMenuSheet`), `icons.ts`
(the site's icon paths: docs, feed, arrow, copy, close, out, and GitHub's official mark for Source), and one e2e per
module: `nav.e2e.ts`, `label-decode.e2e.ts`, `docked-bar.e2e.ts`, `menu-sheet.e2e.ts`.

**Interfaces:**

- Words: `words.nav` from the handoff's `content.ts` `nav` (labels Cockpit, Status line, Install, Releases with numbers
  01 to 04; `Version {version}, release notes`; menu open, close, title, hint). Links: `/#cockpit`, `/#status-line`,
  `/#install`, `/releases/`. Docs and Source from the `repository` fact.
- `wireNav(nav: HTMLElement): void` (nav frame: `transform` 240 ms `--ease-out`, fade in 140 ms when hidden, jump with
  0 ms on keyboard focus, back to the current link on leave, hidden with none); `decodeLabel(el: HTMLElement, frames:
  4 | 5, glyphs = '/\\|-_=+x#'): void` (30 ms a frame, left to right, fixed `aria-label`; fine pointers only; never under
  reduced motion or `data-motion="off"`); `wireDockedBar(bar: HTMLElement, sentinel: HTMLElement): void` (IO on a 96 px
  sentinel; `opacity` and `translateY(-12px)` 240 ms; `inert` until shown; readout `ROW nnnn / nnnn` from
  `floor(scrollY / 16)` and total rows, progress by `scaleX`, both once per frame from a passive listener reading only
  `scrollY`; section tracking with `rootMargin: -45% 0px -50% 0px`, `aria-current="location"`, mapping anatomy, demo,
  cockpit to Cockpit; status-line, ghost to Status line; install, compatibility to Install);
  `wireMenuSheet(button: HTMLAnchorElement, dialog: HTMLDialogElement): void` (`showModal`, Esc closes, focus returns;
  `@starting-style` fade 240 ms, rows rise 8 px with `--stagger` per row). The menu button is
  `<a href="#site-menu">` (the footer's link list) upgraded by the script.
- [ ] **Step 1:** e2e, each at 1440 (and 390 for the sheet): the top band is 80 px with link widths 112, 144, 112, 120;
      hovering a link moves the frame to it with a 240 ms transition; focusing by Tab moves it with a 0 ms transition;
      leaving returns it to the `aria-current="page"` link, whose number is gold; the decode leaves `aria-label` and final
      text unchanged and never runs under reduced motion; after 96 px of scroll the docked bar is visible, not `inert`,
      1088 × 56 at top 12; before it is `inert`; the readout reads `ROW` + four digits and the progress line's scale
      follows scroll; at 390 the menu opens as a modal dialog, Tab stays inside, Esc closes and focus returns to the
      button; with JS off the nav frame rests on the current link and the menu button links to `#site-menu`.
- [ ] **Step 2:** Fail. **Step 3:** Build from `Nav.dc.html` and `reference/Nav.html` (port the reference's script
      logic into the modules). **Step 4:** Pass; then screenshots of the five states at 1440 and 390 beside the artboard.
- [ ] **Step 5:** Commit `feat(site): the nav in its five states`.

### Task 7: The footer and its light

Artboard: `Footer`, `Page-1440-b` and `Page-390-b` (footer at the end); HANDOFF §8.

**Files:** Create in `site/src/footer/`: `Footer.astro`, `footer-light.ts` (`wireFooterLight`), `footer.e2e.ts`;
create `site/src/mascot/glyph-field.ts` (the handoff's `field-render.ts`, unchanged in behaviour) and
`site/src/mascot/field.json` (copied from `handoff/build/field.json`); `site/src/page/hex-lattice.ts` (the lattice
tile as a data URI: one path, `M0 4.619L8 0L16 4.619M0 4.619V13.856M16 4.619V13.856M0 13.856L8 18.475L16 13.856M8
18.475V27.713`, 16 × 27.713, from the handoff's `hex.svg` without its metadata).

**Interfaces:** `wireFooterLight(footer: HTMLElement): void` (two lights by `transform`, 320 ms `--ease-out`; `k =
width / 1440`; parked at the reference's position at rest, under reduced motion and on touch before the first touch).
The small hero copy draws the field with `paintField` after an IntersectionObserver says the footer is near, by
dynamic `import('./field.json')`, so it is not first-load JavaScript. Brand: `ghostframe-wordmark-white.svg` and the
mascot join `BRAND_FILES`. Footer words from `content.ts` `footer`; licence and version from facts; ambient motion
switch from Task 5; the link list carries `id="site-menu"`.

- [ ] **Step 1:** e2e: at 1440 and 1280 a pointer at a point moves the light's centre under it (within 1 px after the
      transition); at rest and under reduced motion it is at the parked position; the wordmark box is 1280 × 240 at 1440;
      the footer names the licence and version from facts and "Not affiliated with Anthropic."; the field canvas paints
      only after the footer nears view (no `field` request before); with JS off the light is parked and the links work.
- [ ] **Step 2:** Fail. **Step 3:** Build from `Footer.dc.html`. **Step 4:** Pass; screenshots at 1440 and 390 beside
      the artboard. **Step 5:** Commit `feat(site): the footer, its lattice and its light`.

### Task 8: The 404, find the ghost

Artboard: `NotFound`; inventory row 51; ADR 0027.

**Files:** Create `site/src/not-found/NotFound.astro`, `search-frame.ts` (`wireSearchFrame`), `search-frame.e2e.ts`;
modify `site/src/pages/404.astro`, `words.ts` (`notFound` from `content.ts`).

**Interfaces:** `wireSearchFrame(stage: HTMLElement): void`: frame position
`x = clamp(round(((cx - left) / k - 208) / 8) * 8, 88, 936)`, `y = clamp(round(((cy - top) / k - 160) / 16) * 16,
112, 448)`, at rest (816, 224); counter-moved layer so the grid and ghost show only inside the frame; readout
`col n · row n`; when the frame covers the ghost the hidden link `found. take me home` gets `tabindex="0"` and shows.
Touch (not specified by the design; ruling): the frame follows `pointermove` of a touch too, as the footer light does.
Reduced motion and no JS: the frame starts on the ghost, found. The four exits (Home, Install, Release notes, Source)
are always there.

- [ ] **Step 1:** e2e: `/does-not-exist/` answers 404 and shows the page (exists; keep); at 1440 and 1280 moving the
      pointer onto the ghost reveals the link and makes it focusable, moving away hides it; readout reports the frame's
      cell; reduced motion and JS off show the found state; the four exits are links with the right `href`s.
- [ ] **Step 2:** Fail. **Step 3:** Build from `NotFound.dc.html`. **Step 4:** Pass; Lighthouse on `/404.html` still 100
      × 4 and 3 of 3. **Step 5:** Commit `feat(site): the 404, where you find the ghost`.

### Task 9: robots.txt, sitemap.xml and their headers

**Files:** Create `site/src/pages/robots.txt.ts`, `site/src/pages/sitemap.xml.ts`, `site/build/seo/sitemap.ts`
(`sitemapXml(pages: { path: string; lastmod: string }[], origin: string): string`), `sitemap.spec.ts`; modify
`site/build/headers/headers.ts` (content types), `site/tests/landing.e2e.ts`.

**Interfaces:** robots.txt: `User-agent: *`, `Allow: /`, `Sitemap: <origin>/sitemap.xml` (ADR 0026). The sitemap lists
`/` and `/releases/` with `lastmod` from the last commit touching the page's inputs (git, through site data), never the
build time; the 404 is not listed.

- [ ] **Step 1:** Spec with literal XML for two pages; e2e: both files answer 200 with `text/plain; charset=utf-8` and
      `application/xml`, robots names the sitemap on the origin. **Step 2:** Fail. **Step 3:** Implement. **Step 4:** Pass.
      **Step 5:** Commit `feat(site): robots.txt and the sitemap`.

### Task 10: The agent and person docs, and stack.md kept true

**Files:** Create `site/AGENTS.md` (stack.md's proposed text, plus what this PR learned: the tsconfig and Vite rulings,
the pending changelog step, fonts regenerated by `bun build/fonts/subset.ts`), `site/README.md` (local dev and build;
deploy follows in PR 4); modify `docs/design/website/stack.md` (the font coverage check is a browser test; the site's
lint extends the repo's; the CI job installs `tools/`; breakpoints), `docs/design/website/GLOSSARY.md` if a new term
appears.

- [ ] **Step 1:** `mise run lint-docs` passes. **Step 2:** Commit `docs(site): site/AGENTS.md and README; stack.md
  follows the build`.

### Task 11: Design review, screenshots, and CI on Linux

- [ ] **Step 1:** `bun tests/shots.ts` (create): screenshots every page and state at 1440 and 390 (nav five states,
      footer, 404 searching and found) and the same frames of the reference pages, into `site/test-results/shots/`.
- [ ] **Step 2:** Impeccable `critique` and `audit` on each piece against its artboard, `polish`; emil-design-eng on
      the nav frame, decode, dock, sheet and footer light; web-design-guidelines on the built pages; `impeccable detect
  --json` on the changed files. Fix what is right; where a finding disagrees with an artboard, stack.md or an ADR,
      those win: log it for the PR.
- [ ] **Step 3:** Go through every pair and list matched and not matched with reasons; publish the pairs as an
      Artifact for the PR.
- [ ] **Step 4:** Push; the Site job on Linux must pass. Record its Lighthouse and agentic results per page, mobile and
      desktop, the JS shipped and LCP. If Linux cannot hold 100, stop and bring the data before changing anything.
