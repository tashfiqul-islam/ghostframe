# 04 · Styling system, fonts, images

Areas 4 and 6. Checked 2026-11-28. Every number marked **measured** was run in `scratchpad\try\` today; scripts in
`scratchpad\try\scripts\`. Labels: **stable today** / **newly available** / **coming**.

## TL;DR

1. **Fonts are the real finding.** The handoff's two files (Fontsource `latin` subsets, 34.7 + 40.4 KB) do **not
   contain** `─` (2,364 uses in the artboards), `━ │ └ ├ ┊`, `❯`, `→ ↗`, `◆ ◇ ● ▸ ▾`, or any block element. Those glyphs
   would fall back to a system mono with a different advance and break the 8 x 16 cell grid. A custom subset from the
   full variable TTF is required. **Measured:** JetBrains Mono 400-500 + box + blocks + used symbols, no code
   ligatures = **11.7 KB**; Hanken Grotesk 400-800 tight latin = **15.7 KB**. Total 27.4 KB vs 75.1 KB in the handoff.
2. **JetBrains Mono has no `✓` (87 uses), `↻` (72), `∴` (21), `▮`.** Hanken has none of the symbols either. Needs a
   decision (see open questions).
3. **Styling:** Tailwind 4.3.5 works and is cheap (**measured** ~9.5 KB gz for every declaration on the landing page as
   arbitrary utilities, 43 ms build), but the artboards are 2,814 inline `style=""` attributes with 935 unique
   declarations, mostly raw px on the cell grid. Plain CSS (tokens.css + scoped component CSS + motion.css as written)
   lets an agent copy declarations verbatim, and the diff reads like the artboard. I rank plain CSS first, narrowly.
4. **oxfmt 0.80.0 formats `.css` and `.html` and sorts Tailwind v4 classes in HTML, but skipped `.astro` files**
   (**measured**). oxlint lints no CSS (no evidence it does).
5. Images: the site needs few raster images. The README demo is an animated WebP (762 KB), but the site's demo is a
   live DOM terminal playing `session.ts`, so no video is needed. svgo cuts the brand SVGs by 35-80 %. Use the existing
   static `og-image.png` (208 KB; 16 KB as AVIF is not accepted by most crawlers, keep PNG); no satori.

## 4 · Styling system

### Versions (npm registry, 2026-11-28)

| Package                                                                | Latest                    | Published  |
| ---------------------------------------------------------------------- | ------------------------- | ---------- |
| tailwindcss, @tailwindcss/vite, @tailwindcss/postcss, @tailwindcss/cli | 4.3.5                     | 2026-11-06 |
| lightningcss                                                           | 1.33.0                    | 2026-07-20 |
| oxfmt                                                                  | 0.80.0 (repo pins 0.78.0) | 2026-11-23 |
| oxlint                                                                 | 1.95.0 (repo pins 1.93.0) | 2026-11-23 |
| prettier-plugin-tailwindcss                                            | 0.8.1                     | 2026-07-15 |

Tailwind release cadence 2026 (GitHub releases page, read 2026-11-28): 4.2.1 Feb 23, 4.2.2 Mar 18 (Vite 8 support),
4.3.0 May 8 (`--default()` in functional `@utility`, stacked `@variant`), patches to 4.3.5 Nov 6. No v5 announced
(no evidence found). Fix-only patches, no breaking changes in the 4.x line: low upgrade cost.

### Facts

- **Browser floor (stable today):** Tailwind v4 "core functionality depends on" Chrome 111, Safari 16.4 (both
  Mar 2023), Firefox 128 (Jul 2024). Source: <https://tailwindcss.com/docs/compatibility> (undated, read 2026-11-28).
  No conflict: the motion features the design needs (scroll-driven animation, `@starting-style`, view transitions) sit
  above this floor anyway, so Tailwind is never the binding constraint. Tailwind is "not designed to be used with"
  Sass/Less; it uses Lightning CSS internally to flatten nesting and bundle `@import`.
- **CSS-first config (stable today):** `@theme` emits **only used** variables by default; `@theme static` emits all;
  `@theme inline` inlines values; `--color-*: initial` / `--*: initial` drops defaults. `@utility name {}` and
  functional `@utility tab-* { tab-size: --value(--tab-size-*) }`; `@custom-variant name (&:where(...))`;
  `@variant` inside CSS; arbitrary values `w-[560px]`, arbitrary properties `[mask-type:luminance]`, var shorthand
  `fill-(--x)`. Sources: <https://tailwindcss.com/docs/theme>, <https://tailwindcss.com/docs/adding-custom-styles> (read
  2026-11-28).
- **JS access:** Tailwind's own advice is `getComputedStyle(document.documentElement).getPropertyValue('--x')` or
  using `var(--x)` directly. Same as plain CSS. Tailwind adds nothing here.
- **Integration:** `@tailwindcss/vite` (the Astro path, `astro add tailwind`), `@tailwindcss/postcss`, or the
  standalone CLI. Tailwind discourages CSS modules + Tailwind (runs once per module; `@apply` needs `@reference`), which
  matters if components use scoped `<style>` blocks with `@apply`.
- **Lightning CSS in Vite (stable today):** Vite 8.4 minifies CSS with Lightning CSS **by default**; using it as the
  full transformer (`css.transformer: 'lightningcss'`) is labelled **experimental**. Source:
  <https://vite.dev/guide/features#lightning-css> (v8.4.0 docs, read 2026-11-28). So "optional Lightning CSS for minify"
  is already free in any Vite-based framework: no dependency to add.

### Measured (scratchpad\try\tailwind, Tailwind 4.3.5 CLI, Windows, Bun 1.4.4)

| What                                                                                            |                Raw | Gzip -9 |
| ----------------------------------------------------------------------------------------------- | -----------------: | ------: |
| Tailwind preflight + ~12 utilities + used theme vars                                            |            5,023 B | 1,863 B |
| Tailwind with all 935 unique landing declarations as arbitrary-property utilities (upper bound) |           49,321 B | 9,544 B |
| Same 935 declarations as hand atomic CSS (`.u1{...}`)                                           |           25,985 B | 7,328 B |
| `tokens.css` + `motion.css` minified by Lightning CSS 1.33                                      |           15,803 B | 2,974 B |
| Tailwind CLI build time                                                                         | 41-43 ms per build |         |

Inputs: `reference/Page-1440-a/b` and `Page-390-a/b.html`: 2,814 `style` attributes, 817 unique style strings, 935
unique declarations. All pages: 6,527 attributes, 1,260 unique declarations. Conclusion: **CSS size is not a decision
factor** (any option lands at 5-15 KB gz, render-blocking but small enough to inline in `<head>`). Build time is not a
factor either.

### Options

| Option                                                                                                                                                                                                            | CSS gz (est.) | Build cost                      | Deps added                      | Artboard fidelity / diff readability                                                                                                                                                            | Maintenance                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------: | ------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A. Plain CSS: `tokens.css` as `:root` vars, `@layer reset, base, components, motion`, native nesting, component styles colocated (Astro scoped `<style>` or one file per section), `motion.css` copied as written |       6-12 KB | 0 (Vite's Lightning CSS minify) | 0                               | Declarations copy 1:1 from the artboard's `style=""`; hex swapped for `var(--gold)`. A diff shows `width: 560px`.                                                                               | Nothing to upgrade. Survives any framework exit.                                                    |
| B. Tailwind v4, tokens in `@theme`, utilities in markup, keyframes stay plain CSS                                                                                                                                 |       8-12 KB | ~40 ms                          | tailwindcss + @tailwindcss/vite | Each inline style must be translated to classes; most become arbitrary (`w-[560px] tracking-[0.13em] leading-[1.6]`). Class strings of 15-30 tokens per element. Diff noise from class sorting. | Rare patches; one more major to follow; Tailwind-specific syntax for agents (well known to models). |
| C. Hybrid: Tailwind for layout primitives only, plain CSS for components                                                                                                                                          |       8-12 KB | ~40 ms                          | same as B                       | Two places to look for any one style.                                                                                                                                                           | Worst of both for a solo maintainer.                                                                |

Why A edges B for this design: the design is not a utility-scale system. Its space scale (4..96) is used, but most
values are cell-grid px (8 x 16 multiples, 560, 704, 448, 1280) and one-off percentages in keyframes. Tailwind's win
(constrained scale, no naming) is small when most classes would be arbitrary. Its cost (translating 935 declarations,
long class strings) lands on every artboard port. Nothing in the design needs Tailwind's variants beyond `hover`,
`focus-visible`, `@media (hover:hover)`, reduced motion and two breakpoints, which plain CSS writes directly.
Risk if wrong: shadcn/ui on Base UI (current choice) assumes Tailwind. If the framework area keeps shadcn, B wins by
default. With vanilla islands (Tabs, Accordion, Slider, Sheet are small), A is cheaper.

### Tokens as one source of truth (CSS + TS)

Consumers: CSS everywhere; TS in the canvas field, the demo player (`--term-*`), the slider (status colours), maybe the
OG card at build time.

| Option                                                  | How                                                                                                                                                       | Cost                              | Verdict                                                                                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. `tokens.css` is the source; TS reads at runtime      | `getComputedStyle(document.documentElement).getPropertyValue('--gold')` once at island init                                                               | 0 code; one style read per island | **Recommend.** Platform-native. Canvas and demo already run after styles load.                                                      |
| 2. `tokens.css` source; build script writes `tokens.ts` | Bun script parses `--name: value;` lines, emits a typed `as const` object; `--check` mode in CI (the repo already uses this pattern: `readme.ts --check`) | ~40 lines + a check               | Only if build-time TS needs colours (satori OG card).                                                                               |
| 3. `tokens.ts` source; script writes CSS                | Inverse of 2                                                                                                                                              | same                              | Worse: the designer ships CSS; diffs against `build/tokens.css` stay direct with 1 or 2.                                            |
| 4. Tailwind `@theme` as source                          | Names change to `--color-gold`, `--spacing-*`, `--radius-chip`                                                                                            | 0 extra, but renames every token  | Only with option B. `@theme` names differ from the designer's (`--gold` becomes `--color-gold`), so the design file and code drift. |

Note: composite tokens like `--display: 800 64px/0.98 var(--font-sans)` work as the `font` shorthand in plain CSS;
Tailwind's `--text-*` namespace wants size and line-height split (`--text-display`, `--text-display--line-height`).

### oxfmt / oxlint (measured with oxfmt 0.80.0 in scratchpad\try\oxfmt)

- **oxfmt formats `.css`** (nesting and `@layer` kept, expanded to one declaration per line). Docs list CSS, SCSS, Less,
  HTML, Vue, Svelte, Markdown, MDX; **Astro is not listed**. Source: <https://oxc.rs/docs/guide/usage/formatter.html>
  (read 2026-11-28).
- **Tailwind class sorting:** option `sortTailwindcss: { stylesheet, functions, attributes, preserveWhitespace }`,
  disabled by default. Source: <https://oxc.rs/docs/guide/usage/formatter/sorting.html>. **Measured:** with a v4
  stylesheet using custom `@theme` colours, it sorted an `.html` file correctly
  (`p-4 flex text-text bg-bg mt-2 hover:text-gold` became `mt-2 flex bg-bg p-4 text-text hover:text-gold`).
- **`.astro` files: oxfmt 0.80.0 skipped them** ("Finished ... on 2 files" of 3). Astro components would need Prettier with
  `prettier-plugin-astro` (and `prettier-plugin-tailwindcss` 0.8.1 with option B), or go unformatted. This hits the
  framework decision, not only styling: flag for the lead.
- **oxlint:** no evidence of CSS linting. A CSS linter (stylelint) would be a new dependency; with option A, the
  designer-copied declarations plus oxfmt are probably enough.

## 6 · Fonts

### Sources and versions

| Source                                                        | Version / date           | Licence | Notes                                                                                        |
| ------------------------------------------------------------- | ------------------------ | ------- | -------------------------------------------------------------------------------------------- |
| `@fontsource-variable/hanken-grotesk`                         | 5.3.0, 2026-07-19        | OFL-1.1 | 4 `@font-face` subsets; `font-display: swap` in its CSS                                      |
| `@fontsource-variable/jetbrains-mono`                         | 5.3.0, 2026-07-19        | OFL-1.1 | subsets: latin, latin-ext, cyrillic(-ext), greek, vietnamese. **No box/block/symbol subset** |
| google/fonts repo `ofl/hankengrotesk/HankenGrotesk[wght].ttf` | main, fetched 2026-11-28 | OFL     | 132,892 B, wght 100-900, 708 glyphs                                                          |
| google/fonts repo `ofl/jetbrainsmono/JetBrainsMono[wght].ttf` | main, fetched 2026-11-28 | OFL     | 187,208 B, wght 100-800, 1,179 glyphs                                                        |

Use the full TTFs as the subsetting input, not the Fontsource woff2 (already cut to latin). Commit the subset woff2
outputs plus the script; the TTFs need not be committed (pin the google/fonts commit SHA in the script).

### Glyph coverage (measured with fontTools 4.69.1)

Non-ASCII characters in the artboards, text extracts and reference pages, with counts: `·` 1146, `─` 2364, `━` 450,
`│` 273, `×` 114, `❯` 114, `−` 95, `✓` 87, `↻` 72, `●` 51, `◇` 45, `↗` 36, `›` 33, `◆` 30, `∴` 21, `→` 18, `└` 18,
`—` 12, `▸` 12, `├` 6, `┊` 6, `–` 3, `▾` 3. Status line spec adds the ghost's half blocks, `▏` and `▮`.

| Range / glyph              | JetBrains Mono (full) | Hanken Grotesk (full) | Fontsource latin files (handoff) |
| -------------------------- | --------------------- | --------------------- | -------------------------------- |
| Box drawing U+2500-257F    | 128/128               | 0/128                 | missing                          |
| Block elements U+2580-259F | 32/32                 | 0/32                  | missing                          |
| `❯ → ↗ ◆ ◇ ● ▸ ▾`          | yes                   | no                    | missing                          |
| `✓ ↻ ∴ ▮`                  | **no**                | **no**                | missing                          |
| `· × – — › −`              | yes                   | yes                   | yes                              |

### Subset sizes (measured, pyftsubset via fontTools API, woff2 + brotli)

| File                              | Axis        | Unicode                                                                     |       Size |
| --------------------------------- | ----------- | --------------------------------------------------------------------------- | ---------: |
| Fontsource Hanken latin (handoff) | 100-900     | latin                                                                       |     34,704 |
| Hanken, Google latin set          | 100-900     | latin                                                                       |     36,148 |
| Hanken                            | 400-800     | latin                                                                       |     24,128 |
| **Hanken**                        | **400-800** | **ASCII + used punctuation (tight)**                                        | **15,716** |
| Fontsource JBM latin (handoff)    | 100-800     | latin                                                                       |     40,404 |
| JBM                               | 400-700     | latin + symbols + box + blocks, all features                                |     33,652 |
| JBM                               | 400-500     | tight + box + blocks + U+25A0-25FF + `❯`, all features                      |     26,240 |
| **JBM**                           | **400-500** | **same, features kern/mark/mkmk/ccmp/locl only (no `calt` code ligatures)** | **11,728** |

Takeaways: limiting the wght axis (fontTools `instancer`) saves ~33 %; JetBrains Mono's code ligatures (`calt`) cost
14.5 KB, and a terminal demo shows commands verbatim, so drop them (also stops `->` becoming an arrow). Drop 700 from
mono if the artboards don't use it (tokens.css says 400, 500, 700; Components.txt shows 400/500). Tight subsets mean
any new character in copy falls back silently: add a build check that every character in built HTML is in the subset
(fontTools `getBestCmap()` or Bun + fontkit, which `tools/` already has: fontkit 2.0.4).

Subsetting tools: **fontTools/pyftsubset** 4.69.1 (Python; one-off script, output committed; stable, the reference
tool). **glyphhanger** 6.0.0 (2026-06-05; crawls pages with a headless browser, then calls pyftsubset; adds Puppeteer).
**subfont** 7.3.0 (2026-09-20; post-build HTML rewrite, subsets per page). For a two-font site whose glyph set is known,
a 30-line pyftsubset script run by hand beats both (no Node headless browser in the build). Python is available via
mise (3.14.5).

### Fallback metrics (measured with @capsizecss/core 4.1.3 + metrics 4.5.0)

```css
@font-face {
  font-family: 'Hanken Grotesk Fallback';
  src: local('Arial'), local('ArialMT');
  ascent-override: 99.0668%;
  descent-override: 30.0173%;
  line-gap-override: 0%;
  size-adjust: 100.9419%;
}
@font-face {
  font-family: 'JetBrains Mono Fallback';
  src: local('Courier New'), local('CourierNewPSMT');
  ascent-override: 102.0166%;
  descent-override: 30.0049%;
  size-adjust: 99.9837%;
}
```

JetBrains Mono advance is 600/1000 em, same as Courier New, so the 8 px cell holds even before the font loads. Font
metrics read directly: JBM upm 1000, asc 1020, desc -300, gap 0; Hanken upm 1000, asc 1000, desc -303, gap 0. These are
generated once and pasted into `tokens.css` (or a fonts.css); no runtime tool needed.

Tools: **capsize** (`@capsizecss/core` 4.1.3, 2025-11-12; metrics 4.5.0, 2026-11-17). **fontaine** 1.1.0 (published
2026-11-25, three days ago; a Vite/Unplugin that injects these overrides at build). **Astro Fonts API**: **stable today**
since Astro 6.0.0 (`experimental.fonts` removed; top-level `fonts` config; `<Font cssVariable preload />` from
`astro:assets`). Options: `provider` (local, fontsource, google, ...), `weights` (range `"400 800"` for variable),
`subsets` default `["latin"]`, `formats` default `["woff2"]`, `display` default `"swap"`, `unicodeRange`,
`featureSettings`, `fallbacks` default `["sans-serif"]`, `optimizedFallbacks` default `true` (generates metric-matched
fallbacks; docs don't say which algorithm). Sources: <https://docs.astro.build/en/guides/fonts/> and
<https://docs.astro.build/en/reference/configuration-reference/#fonts> (read 2026-11-28); astro@6.0.0 release notes (PR #15291).
**It does not subset to a custom glyph list**: `subsets` are provider-named sets, which is exactly what drops
the box glyphs. With the local provider it takes your pre-subset files and still emits `@font-face`, preload and
fallbacks. Fine to use if the framework is Astro; not needed otherwise.

### Loading

- Preload both files: `<link rel="preload" href="/fonts/hanken-400-800.woff2" as="font" type="font/woff2" crossorigin>`.
  `crossorigin` is required even same-origin (fonts fetch in CORS mode; without it the preload is fetched twice).
  web.dev: preload ignores `unicode-range`, so preload only the one file per family that is always used.
  Source: <https://web.dev/articles/font-best-practices> (undated).
- **font-display:** `swap` plus the metric overrides above. The boot curtain (1.8 s, first visit) covers the swap on
  first load; at 27 KB both fonts arrive well inside it on a mid-range phone. `optional` guarantees no swap shift but on
  a cold first visit can keep the fallback for the whole page view, which would show Courier/Arial in a design whose
  type is the brand. The hero at 1024-1439 is a fixed cell grid scaled by `transform`, so text boxes don't reflow on swap.
  Not verified from a primary source: whether Chrome reports a fallback-font text paint as the LCP candidate (web.dev
  doesn't say). Measure in the spike.
- Self-hosted, same origin, long `Cache-Control: immutable` with hashed names (area 10/11).

## 6 · Images

### Inventory (sizes in bytes)

`docs/design/brand/` (D:\Projects\ghostframe-wt\website-stack):

| File                                                                                                                                                                                                      |              Size | Site use                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------: | -------------------------- |
| ghostframe-mascot.svg / -amber / -green / -red.svg                                                                                                                                                        |       21,099 each | hero mascot, slider states |
| ghostframe-mascot-4096.png                                                                                                                                                                                |         2,518,722 | none (source)              |
| ghostframe-mark-small-amber / -green / -red.svg                                                                                                                                                           |       21,138 each | ghost states               |
| ghostframe-wordmark-black / -white.svg                                                                                                                                                                    |       13,754 each | footer `.wm` mask          |
| ghostframe-lockup-dark / -light / -stacked-dark / -stacked-light.svg                                                                                                                                      |     27,173-27,175 | nav / OG                   |
| ghostframe-logo-black / -white.svg                                                                                                                                                                        |        3,348 each |                            |
| ghostframe-logo-black / -white-4096.png                                                                                                                                                                   | 920,211 / 939,509 | none                       |
| avatar-1024.png                                                                                                                                                                                           |           352,599 | none                       |
| head.html, README.md                                                                                                                                                                                      |     1,583 / 4,177 | head tags template         |
| icons/: favicon.svg 21,138, favicon.ico 9,287, favicon-16/32.png 6,711/8,665, apple-touch-icon.png 30,845, icon-192.png 33,258, icon-512.png 125,238, icon-maskable-512.png 109,935, site.webmanifest 553 |                   | copy to site root          |
| social/: og-image.png 207,922 (1200x630), twitter-card.png 199,437, github-social-preview.png 219,419                                                                                                     |                   | OG/Twitter                 |
| readme/: readme-hero-dark.png 471,667, readme-hero-light.png 419,856                                                                                                                                      |                   | none                       |

Designer's `reference/assets/`: hex.svg 8,028; noise-tile-a/b.png 24,443 / 24,525 (560x384); field-phosphor.png
435,680 (2240x2784, the field as an image; `build/field-render.ts` + `field.json` draw it on canvas instead).

### svgo 4.1.0 (2026-08-24), measured `--multipass`, default preset

| File             | Raw before → after | Gzip before → after |
| ---------------- | ------------------ | ------------------- |
| mascot           | 21,099 → 10,507    | 4,707 → 2,079       |
| wordmark-white   | 13,754 → 2,790     | 4,769 → 1,530       |
| lockup-dark      | 27,173 → 16,071    | 7,173 → 4,405       |
| logo-white       | 3,348 → 2,593      | 1,562 → 1,235       |
| mark-small-amber | 21,138 → 10,258    | 4,718 → 1,913       |

**Not visually verified** (no render diff done). Run svgo once, commit outputs, eyeball each; don't add svgo to the
build. The mascot's eyes and pupils are animated by id/class (`[data-pupil]`, `.pc`), so the preset must keep ids
(`cleanupIds: false`) for the inlined copy.

### Raster (sharp 0.35.5, 2026-09-27; measured)

| Image                      |     PNG | AVIF q50 | WebP q75 |
| -------------------------- | ------: | -------: | -------: |
| noise-tile-a (560x384)     |  24,443 |   24,527 |   18,022 |
| og-image (1200x630)        | 207,922 |   16,180 |   20,660 |
| field-phosphor (2240x2784) | 435,680 |  290,880 |  108,414 |

Noise doesn't compress lossy; WebP wins for the tiles, ship them as WebP (or generate noise in canvas). The field should
be the canvas, with no image. Astro's image pipeline (sharp, `<Image>` / `<Picture>`) would cover AVIF/WebP + width/
height automatically, but with ~3 rasters a one-off `sharp` script (sharp is already pinned in `docs/assets/package.json`)
and committed outputs is equally simple and framework-independent.

### README demo

`docs/assets/readme-demo.webp`: **animated WebP, 762,138 B**, made by `docs/assets/demo.ts` from live-harness HTML
frames through sharp (11 s loop); `readme-demo-phone.webp` 149,912 B; reduced-motion stills `readme-hero.png` 325,588 B
and `readme-demo-phone.png` 39,831 B. On the site the demo section is a **live DOM terminal** playing
`build/session.ts` (HANDOFF section 7.1: Pause, Replay, Read as text), so the site needs no video or animated image. If
one is ever needed: H.264 MP4 (+ AV1 source) with `poster`, `muted playsinline`, `preload="none"`, loaded on
visibility. Video beats animated WebP by roughly an order of magnitude for screen captures (general knowledge, not
measured here).

### OG / social card

`social/og-image.png` exists at 1200x630. The site has 3 pages; one static card (plus maybe one for `/releases`)
suffices. Build-time generation options: satori 0.63.2 (2026-10-20, still 0.x) + `@resvg/resvg-js` 2.6.2 (last release
**2024-03-26**, stale for 20 months; 2.7.0 only as alpha); astro-og-canvas 0.13.3 (2026-11-02, CanvasKit WASM). Both add
a font-loading and rendering pipeline for one image. Recommend the static PNG. Keep PNG (not AVIF) for `og:image`:
crawler support for AVIF in OG is uneven (no primary source checked today; area 7 should confirm per platform).

## Lead's call (suggested ranking, criteria from 00-frame.md)

Styling, scored 1-5:

| Criterion (weight)         | A. Plain CSS + tokens.css |                                B. Tailwind v4 | C. Hybrid |
| -------------------------- | ------------------------: | --------------------------------------------: | --------: |
| C1 Design fidelity (20)    |                         5 |                                             4 |         3 |
| C2 Performance (20)        |                         5 |                                             5 |         5 |
| C3 Solo maintenance (15)   |                         5 |                                             4 |         3 |
| C4 Stability (10)          |                         5 |                                             5 |         4 |
| C5 Agent-friendliness (10) |                         4 |                                             5 |         3 |
| C6 SEO/AEO (8)             |                         5 |                                             5 |         5 |
| C7 Content pipeline (7)    |                         5 |                                             5 |         5 |
| C8 Repo fit (5)            |     4 (oxfmt formats CSS) | 4 (oxfmt sorts classes in HTML, not `.astro`) |         3 |
| C9 Exit cost (5)           |                         5 |                                             3 |         3 |
| **Total /100**             |                    **97** |                                        **90** |    **77** |

Flip condition: if the island decision keeps shadcn/ui, Tailwind B becomes the default.

Fonts: custom pyftsubset of the full Google Fonts TTFs (Hanken 400-800, JBM 400-500, box + blocks + used symbols, no
`calt`), 27 KB total, both preloaded, `swap` + capsize overrides pasted into CSS, and a build check for glyph coverage.
Astro Fonts API (local provider) optional on top if Astro wins.

Images: inline optimised SVG for the mascot and marks; WebP noise tiles; canvas field; static OG PNG; no video; no
satori; no image-pipeline dependency beyond the already pinned sharp.

Tokens to TS: runtime `getComputedStyle` from `tokens.css`; a generated `tokens.ts` with `--check` only if build-time
TS needs colours.

## Open questions

1. `✓ ↻ ∴ ▮` exist in neither font. Options: (a) take them from another OFL mono with matching 0.6 em advance (e.g.
   draw them into the subset with fontTools from a donor font; licence permits merging OFL fonts, output stays OFL),
   (b) inline SVG at 1 cell, (c) accept system fallback inside a fixed-width `inline-block` of 1ch. Designer call on
   look; (b) is cheapest to build.
2. Is mono weight 700 used anywhere in the artboards? If not, cap the axis at 500 (already measured at 11.7 KB).
3. Does any `.astro` (or `.svelte`) source need formatting? oxfmt skips `.astro` today; that's a dependency cost for
   the framework choice.
4. LCP with `swap`: does Chrome take the fallback paint or the web-font repaint as the LCP time, and does the boot
   curtain itself become the LCP element? Measure in the spike.
5. svgo output not visually diffed; check each SVG, and keep ids on the animated mascot.
