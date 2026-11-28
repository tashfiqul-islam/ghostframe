# The website stack

Status: proposed, 2026-11-28. The decision records are ADRs 0013 to 0027 in [docs/decisions](../../decisions/README.md);
this file holds the evidence, the plan and the structure. Words for the site's parts are in [GLOSSARY.md](GLOSSARY.md).

## The recommendation

| Layer           | Choice                                                                            | Version (npm, checked 2026-11-28)                                                                                                                | ADR                                                                    |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Framework       | Astro, static output, no adapter, no client router                                | `astro` 7.4.13 (2026-11-18)                                                                                                                      | [0013](../../decisions/0013-website-on-astro.md)                       |
| Interactivity   | Plain TypeScript modules over finished HTML; native controls                      | none                                                                                                                                             | [0014](../../decisions/0014-website-islands-without-a-ui-framework.md) |
| Styling         | Plain CSS, one `tokens.css`, cascade layers                                       | none (Lightning CSS ships in Vite)                                                                                                               | [0015](../../decisions/0015-website-plain-css-with-tokens.md)          |
| Motion          | CSS transitions and keyframes, scroll-driven animations, WAAPI                    | none                                                                                                                                             | [0016](../../decisions/0016-website-motion-without-a-library.md)       |
| Fonts           | Own subsets of the variable fonts, with the terminal's glyphs                     | fontTools, pinned in `mise.toml`                                                                                                                 | [0017](../../decisions/0017-website-font-subsets.md)                   |
| Type checking   | `tsc` over `.ts`/`.tsx` as the reference; tsrs over everything, `.astro` included | `typescript` 7.0.2 (2026-07-08); `tsrs` 7.1.0-beta.tsrs2 (the repo's pin); `@astrojs/ts-content-mapper` 0.2.0 (2026-09-22)                       | [0023](../../decisions/0023-website-typescript-only.md)                |
| Schemas         | zod, as Astro ships it (`astro/zod`)                                              | 4.6.7 (bundled)                                                                                                                                  | [0013](../../decisions/0013-website-on-astro.md)                       |
| Lint and format | The repo's oxlint (type-aware on tsrs-lint) and oxfmt                             | `oxlint` 1.93.0, `oxfmt` 0.78.0 (the repo's pins)                                                                                                | [0023](../../decisions/0023-website-typescript-only.md)                |
| Tests           | `bun test` specs, Playwright with axe, Lighthouse as a spec                       | Bun 1.4.4 (the repo's pin); `@playwright/test` 1.65.1 (2026-11-13); `@axe-core/playwright` 4.14.1 (2026-11-24); `lighthouse` 13.6.0 (2026-10-27) | below                                                                  |
| Hosting         | An assets-only Cloudflare Worker, `_headers` written at build                     | `wrangler` 4.168.0 (2026-11-24; 4.169.0 is newer than the repo's three-day release-age rule)                                                     | [0020](../../decisions/0020-website-on-workers-static-assets.md)       |
| Analytics       | None on the page; Cloudflare zone HTTP analytics                                  | none                                                                                                                                             | [0024](../../decisions/0024-website-analytics-without-a-script.md)     |

What changed from the current choices:

- **Astro 5 becomes Astro 7.** 7 is the current major (6.0 shipped 2026-03-10, 7.0 on 2026-06-22).
- **React islands are dropped.** The design has no stateful piece. React costs 71.9 KB gzipped for the demo alone, against 3.1 KB of plain TypeScript for the nav, hero, copy button and demo together.
- **shadcn/ui and Base UI are dropped.** React plus Base UI for the five controls is 127.4 KB gzipped, over the ceiling; native HTML covers four of the five.
- **Tailwind v4 is dropped.** Its main reason was shadcn. The artboards are raw pixel values on the cell grid, which would become arbitrary-value utilities.
- **Cloudflare Web Analytics is dropped.** It always loads a third-party script.
- **Bun and Workers static assets stay.**

## Decision criteria

Set before the research (brainstorming), weights sum to 100. Each option scores 1 to 5 per criterion.

| #   | Criterion           | Weight | Scores high when                                                                |
| --- | ------------------- | -----: | ------------------------------------------------------------------------------- |
| C1  | Design fidelity     |     20 | it builds every artboard and the motion spec exactly, without fighting the tool |
| C2  | Performance ceiling |     20 | least JS on first load, nothing blocks the hero text, Lighthouse 100 reachable  |
| C3  | Solo maintenance    |     15 | few dependencies, rare breaking majors, no server, database or paid plan        |
| C4  | Stability           |     10 | stable today, long support of the major                                         |
| C5  | Agent-friendliness  |     10 | obvious conventions, typed, colocated, well documented                          |
| C6  | SEO and AEO control |      8 | full control of head, status codes, sitemap, feeds, Markdown copies             |
| C7  | Content pipeline    |      7 | typed, validated build-time data; a wrong fact fails the build                  |
| C8  | Repo fit            |      5 | Bun, TypeScript only, oxlint and oxfmt, mise and hk, Cloudflare                 |
| C9  | Exit cost           |      5 | output is plain HTML, CSS and TS that survives leaving the tool                 |

Framework and runtime, scored (out of 100; [framework research](research/01-framework-runtime-tooling.md), spikes below):

| Option                                   |  C1 |  C2 |  C3 |  C4 |  C5 |  C6 |  C7 |  C8 |  C9 |  Score |
| ---------------------------------------- | --: | --: | --: | --: | --: | --: | --: | --: | --: | -----: |
| Astro 7 + plain TypeScript               |   5 |   5 |   4 |   4 |   5 |   5 |   5 |   4 |   4 | **93** |
| Astro 7 + Preact for one stateful island |   5 |   4 |   4 |   4 |   4 |   5 |   5 |   4 |   3 |     86 |
| Eleventy 3 + plain TypeScript            |   4 |   5 |   4 |   5 |   3 |   5 |   3 |   4 |   5 |     85 |
| Plain Vite multi-page                    |   4 |   5 |   4 |   5 |   3 |   4 |   2 |   5 |   5 |     83 |
| SvelteKit 3 + Svelte 5                   |   4 |   3 |   3 |   3 |   4 |   4 |   4 |   2 |   3 |     68 |
| Astro + React islands + shadcn (current) |   4 |   3 |   3 |   4 |   4 |   5 |   5 |   3 |   3 |     74 |
| React Router 8 / TanStack Start static   |   3 |   2 |   3 |   3 |   3 |   4 |   4 |   3 |   2 |     58 |

SvelteKit and the current choice are scored down after the spikes: SvelteKit failed the LCP budget and needs TypeScript 6;
the React island is 23 times the JavaScript of the plain version for the same behaviour.

## Spikes

The same page (the nav with its frame, label decode and docked bar; the hero with the lens, pupils and crosshair; the
demo with five pane tabs, Pause, Replay and Read as text) was built three ways on shared markup and CSS, so the numbers
compare runtimes. Kept outside the repo (see leftovers). The measurements were written first: a budget spec of the hard
constraints, then each spike until it passed or failed for a reason.

How measured: Lighthouse 13.6.0 CLI with Chrome 158, default mobile (simulated slow 4G, 4× CPU) and `--preset=desktop`,
against a local Bun server with gzip, cache headers and a real 404. JS is Lighthouse's transfer size of scripts.
INP is the slowest interaction in a Playwright run at 4× CPU throttling (21 interactions: every tab, the controls,
nav hovers, 20 pointer moves). Build is the median of three warm builds. Packages from `bun pm ls --all`.

| Spike                                      |                        JS, first load (gz) | Lighthouse mobile and desktop |                Mobile LCP | CLS |   INP |                Build | Packages | Matching the design                                  |
| ------------------------------------------ | -----------------------------------------: | ----------------------------- | ------------------------: | --: | ----: | -------------------: | -------: | ---------------------------------------------------- |
| A: Astro 7.4.13 + plain TS                 |                                     3.1 KB | 100 / 100 / 100 / 100 both    | 1,655 ms (mascot `<img>`) |   0 | 40 ms |               1.06 s |      188 | the reference pages' own scripts port as they are    |
| A, mascot inline                           |                                     3.1 KB | 100 × 4 both                  |     **757 ms (the lede)** |   0 | 40 ms |               1.06 s |      188 | HTML +4.9 KB gz                                      |
| A, full-page boot curtain                  |                                     3.1 KB | Performance **99** both       |                  1,653 ms |   0 | 40 ms |                      |          | Speed Index 759 → 3,451 ms                           |
| A, curtain on the stage only               |                                     3.1 KB | 100 × 4 both                  |                  1,578 ms |   0 |       |                      |          | Speed Index 1,808 ms                                 |
| B: Astro 7.4.13 + React 19.3.1 demo island | 0 KB, **71.9 KB** once the demo is in view | 100 × 4 both                  |                  1,502 ms |   0 | 40 ms |               1.15 s |      197 | easy; one fight over `?pane=` on mount               |
| C: SvelteKit 3.4.1 + Svelte 5.59.2         |                                **47.9 KB** | 100 × 4 both                  | **1,909 ms, over budget** |   0 | 40 ms | 1.29 s (`bun --bun`) |       47 | `svelte.config.ts` rejected; needed TypeScript 6.0.3 |

What the spikes settled: no runtime earns its weight (ADR 0014); the mascot goes inline so LCP is text (ADR 0018); the
curtain covers the stage only (ADR 0025, the owner's call).

## Requirements the design sets

The sources: the 17 artboards in this folder (the export, newest), the brief at
[docs/development/website-brief.md](../../development/website-brief.md), and the designer's handoff in
[handoff/](handoff/README.md) (its text and `build/` data only). The handoff's rendered reference pages, screenshots and
filmstrips are not in the repository; the owner's main checkout keeps them, untracked, in `docs/design/website/`.

All 51 moving, interactive and responsive pieces are in the [design inventory](research/13-design-inventory.md), each
with its artboard evidence, implementation, JS cost, reduced-motion and no-JS behaviour. The ones the prompt named:

| Piece                                         | Implementation                                                                        |                      JS (gz, est.) | Reduced motion            | No JS                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------: | ------------------------- | -------------------------------------------- |
| Boot curtain                                  | CSS keyframes over the stage; a head script gates it once per session; any key skips  |                             0.7 KB | none                      | none (shown only when a script set the gate) |
| Eye pupils                                    | pointer handler writing `transform`, CSS transition with a `linear()` spring          | 0.7 KB with the lens and crosshair | centred, still            | centred                                      |
| Ruler and col/row readouts                    | same handler, no easing                                                               |                       in the above | hidden                    | "ptr · off grid"                             |
| Frame that docks on scroll                    | scroll-driven animation on one fixed frame; static frames per section underneath      |                  0 (0.65 fallback) | static frames, crossfade  | static frames                                |
| Demo: play, pause, replay, Read as text, tabs | build-time HTML of the finished turn; the script only reveals steps; shared `tabs.ts` |                            1.25 KB | finished turn at once     | finished turn, readable                      |
| Cropped swipeable terminal at 390             | CSS scroll-snap box, a tap or swipe syncs the two-tab switch                          |                            0.45 KB | instant scroll            | still swipes                                 |
| Nav sliding frame                             | small TS, `transform` 240 ms, instant from the keyboard                               |               1.1 KB with the dock | jumps                     | rests on the current page                    |
| Label decode                                  | stepped glyph resolve, 4 frames, real text kept for screen readers                    |                             shared | none                      | plain labels                                 |
| Docked bar and progress line                  | IntersectionObserver plus CSS transition; progress by `scaleX`                        |                         in the nav | appears                   | never docks                                  |
| Menu sheet at 390                             | native `<dialog>`, `@starting-style` entry, 30 ms stagger                             |                             0.2 KB | appears                   | a link to the menu list in the footer        |
| Copy button, three states                     | one delegated listener; idle, copied, blocked (selects the command, announces it)     |                             0.4 KB | same                      | command selectable                           |
| Footer light                                  | pointer handler, two radial lights by `transform`                                     |                            0.24 KB | parked at centre          | parked                                       |
| 404 find-the-ghost                            | the search frame follows the pointer; the hidden link activates when found            |                        1.9 KB page | frame starts on the ghost | three plain exits                            |
| Release notes filters, `f`, rail marker       | toggle buttons, `?show=`, `f` with an off switch, IntersectionObserver                |                            0.74 KB | jumps                     | all groups shown                             |
| Per-day chart                                 | build-time HTML and CSS from git                                                      |                                  0 | static                    | static                                       |

Landing page total, one bundle: about 12.1 KB gzipped, 6.7 KB of which is the glyph field's data.

Design gaps found and how they are settled: the Performance group gets its own filter chip (owner); the clipboard-blocked
state is "SELECTED" plus an announcement (owner); a phone string is an optional `short` variant (owner, content model
below); the 147 broken colour values are resolved below; the handoff's 29 disagreements with the export are listed in
[handoff vs export](research/handoff-vs-export.md) (the export wins unless the handoff says otherwise).

### The broken colour values

147 values in the export (and the same in the handoff's rendered pages) are a Python `<function <lambda>>` repr where a
colour belongs. Resolved by the owner's rules ([full mapping](research/broken-colours.md)):

| Rule                                                                                                                   | Values | Resolves to                                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | -----: | --------------------------------------------------------------------------------- |
| Each Components swatch takes its labelled token (the broken value is the swatch's 1 px inset ring; its fill is intact) |     18 | the swatch's own token (the ring then disappears into the fill: owner to confirm) |
| Tick patterns and borders on surface-1 cards                                                                           |     80 | `--line-2` `#2A2A34`                                                              |
| Secondary buttons, COPY buttons, the version chip, the tooltip, the process chips (same element intact elsewhere)      |     23 | `--line-2`                                                                        |
| Not placed with confidence                                                                                             |     26 | the owner's list below                                                            |

The rule "every intact tick uses `--line-2`" holds for minor ticks only. Major ticks use `#3A3A47` (10 places), and the
hero frame's ticks use 30% and 42% white. `#3A3A47` is not on the token sheet but draws major ticks and schematic lines;
it needs a token (`--line-3`) or a decision.

## Findings by area

Each area's research file holds the sources, with dates, and the options compared in a table. Only the decisions and the
facts that drove them are repeated here.

### 1, 2, 16 · Framework, interactivity, tooling ([research](research/01-framework-runtime-tooling.md), [TypeScript 7](research/16-typescript-7.md))

- Astro 7 ships 0 KB of JS on a page with no scripts; `astro.config.ts` works; `bun run build` works. Server islands:
  not needed, nothing is per-request. Client router: 5.6 KB, not used; cross-document `@view-transition` is the
  enhancement (limited availability, 0 KB).
- Majors: Astro 5.0 2024-12-03, 6.0 2026-03-10, 7.0 2026-06-22 (three in nineteen months); security fixes for one
  previous major only. SvelteKit 3.0 2026-10-01. React Router 8.0 2026-06-17.
- Hello-island runtime, gzipped: React 19 67.8 KB, Svelte 5 20.3 KB, Solid 2 13.3 KB, Preact 11 5.5 KB, plain TS 0.2 KB.
- TypeScript 7.0.2 has no `contentMappers` (a 7.1 option) and passes a type error in an `.astro` file; tsrs with the
  content mapper catches it. `astro check` and the Astro language server need TypeScript 6. tsrs is the repo's checker
  already (`tools/package.json:34`, `hk.pkl:18`).
- Config formats: TypeScript for Astro, Playwright and oxlint; JSONC for Wrangler (it reads JSONC, JSON or TOML);
  Lighthouse CI reads only JSON, YAML or JavaScript, which is one reason it is not used (Lighthouse runs as a spec).

### 3, 5 · Platform CSS and motion ([research](research/03-platform-css-and-motion.md))

Baseline from web-features 3.48.0 (2026-11-26). Widely available: container size queries, `:has()`, cascade layers,
nesting, `color-mix()`, `text-wrap: balance`, `linear()` easing, `<dialog>`, `inert`, `clipboard.writeText`. Newly
available (used with a fallback): scroll-driven animations (2026-10-27, Firefox 159; fallback the static frames),
`@property`, `@starting-style`, `transition-behavior: allow-discrete`, popover, invoker commands, `<details name>`,
same-document view transitions. Limited (enhancement or not used): anchor positioning, cross-document view
transitions, `closedby`, `interpolate-size`, `text-wrap: pretty`, scroll-state queries, Speculation Rules.

All 29 motion moments map to the platform: 15 CSS transitions, 7 CSS keyframes, 3 scroll timelines, 4 small TS loops.
Motion 14.14.0 mini is 3.5 KB, hybrid 27.7 KB; GSAP 3.15.1 with ScrollTrigger 45.5 KB under Webflow's licence.

Judged with emil-design-eng: transform and opacity only, ease-out, instant from the keyboard, transitions (not
keyframes) for anything the pointer drives — the platform does all of it. The one place it may fight the design is the
lens and pupils: decorative pointer tracking, where a spring that keeps its velocity when the pointer moves again
reads more alive. CSS `linear()` copies the spring's shape but restarts its velocity. If the build shows it, Motion's
mini build (3.5 KB) is the measured upgrade (risk 3).

### 4, 6 · Styling, fonts, images ([research](research/04-styling-fonts-and-images.md))

- Tailwind 4.3.5 (2026-11-06) output for the landing page's declarations: 9.5 KB gz against 7.3 KB hand-written; 935
  unique inline declarations, mostly raw pixel values.
- The Fontsource `latin` files lack the terminal's glyphs (checked: no U+2500, U+2580, U+276F or U+2713). Own subsets:
  Hanken Grotesk 400–800 15.7 KB, JetBrains Mono 400–500 with box and block ranges and no code ligatures 11.7 KB.
  `✓ ↻ ∴ ▮` are in neither font: the build draws them another way, and the font coverage check keeps it honest.
  Fallbacks: metric overrides from Capsize; Courier New has JetBrains Mono's 0.6 em advance, so the grid holds while the
  font loads. Preload both woff2 files, `font-display: swap`.
- Images: brand SVGs as exported (ADR 0018), the hero mascot inline, other copies lazy `<img>` with sizes; the glyph
  field is canvas from `field.json`; the static `og-image.png`; no satori (0.63, pre-1.0) and no resvg (last release
  2024-03). The README's animated WebP is not used: the demo is live DOM.

### 7, 8 · SEO and AEO ([research](research/07-seo-and-aeo.md))

- Hand-written, 0 dependencies: titles and descriptions from `words.ts`, a canonical on every page from the site
  origin, `sitemap.xml` (accurate `lastmod` only), `robots.txt`, Open Graph and X tags with the static 1200 × 630 card,
  the Atom feed (RFC 4287) with an autodiscovery link.
- JSON-LD: `WebSite` (Google shows the site name) and `SoftwareApplication` (no rich result without ratings, which
  ghostframe will not fake; kept as honest data for other readers). No `FAQPage`: FAQ rich results were deprecated
  2026-05-07.
- The 404: a real 404 status, checked by a browser test; Lighthouse audits `/404.html` (ADR 0027). The research's
  "SEO 92 on a 404" was wrong: Lighthouse does not score a 404 response at all.
- AEO: `/llms.txt` and a Markdown copy of each page, linked with `rel="alternate"`. Evidence of effect is weak (Google
  says the files are not needed for Search, 2026-06-15; Ahrefs logs, 2026-06-15: 97% of llms.txt files got no requests); kept because it is cheap
  and the readers are coding agents. Answer-first copy and real FAQ answers are written for people; no evidence they
  move AI citations, so they are not justified that way.
- Crawlers: all allowed, training included (ADR 0026). Cloudflare's AI bot blocking and managed robots.txt off.
- Trailing slash: directory-format pages, `/releases/` everywhere, `html_handling: "auto-trailing-slash"`.

### 10, 11 · Delivery and security ([research](research/10-cloudflare-delivery-and-security.md))

- Cloudflare's Pages docs (2026-11-28) send new static sites to Workers. Assets-only Worker: `assets.directory`,
  `not_found_handling: "404-page"`, `html_handling: "auto-trailing-slash"`; asset requests free and unlimited; 20,000
  files, 25 MiB each; `_headers` 100 rules, 2,000 characters a line.
- Compression: Cloudflare serves zstd where the browser asks (Baseline newly available, Safari 26.3) and Brotli
  otherwise; HTTP/3 is a zone toggle. Early Hints on Workers needs a workaround and gains little on cacheable pages: not
  used. Speculation Rules: one inline `prefetch` rule for `/releases/` (Chromium only, harmless elsewhere), hashed in
  the CSP. bfcache: nothing sets `no-store`, no `unload` handlers.
- Render path: one small stylesheet per page (Astro inlines the small ones), no render-blocking script, fonts
  preloaded, the hero text is the LCP.
- Headers, written by the build (`build/headers`, checked in the walking skeleton):

| Header                       | Value                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content-Security-Policy      | `default-src 'self'; script-src 'self' <sha256 of each inline script>; style-src 'self' <sha256 of each inline style>; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'` |
| X-Content-Type-Options       | `nosniff`                                                                                                                                                                                                                                                         |
| Referrer-Policy              | `strict-origin-when-cross-origin`                                                                                                                                                                                                                                 |
| Cross-Origin-Opener-Policy   | `same-origin`                                                                                                                                                                                                                                                     |
| Permissions-Policy           | `camera=(), microphone=(), geolocation=()`                                                                                                                                                                                                                        |
| Cache-Control on `/_astro/*` | `public, max-age=31536000, immutable` (everything else keeps the revalidating default)                                                                                                                                                                            |
| Strict-Transport-Security    | on the zone: `max-age=31536000`, no `preload`, no `includeSubDomains`                                                                                                                                                                                             |

Lighthouse 13.6 weights `csp-xss`, `has-hsts`, COOP, clickjacking and Trusted Types at 0: they never cost Best
Practices, but a CSP violation logs a console error, which does. Trusted Types (`require-trusted-types-for 'script'`)
is left for the build to try: the site writes `textContent`, not `innerHTML`, so it should cost nothing; no evidence
yet. COEP and CORP: not needed, nothing needs cross-origin isolation.

### 9, 12, 14 · Repo fit, tests, content ([research](research/09-repo-fit-tests-and-content.md))

- `site/` is its own package beside `tools/` (ADR 0022). `claude plugin test .` runs every `*.test.ts` under the repo
  (checked: it skips `node_modules` and `*.spec.ts`), so site unit tests are `*.spec.ts` and browser tests `*.e2e.ts`.
- Release text from release-please only, git for counts (ADR 0019). The pending 1.0.0 changelog leaks "(7.14)" in the
  #56 Docs entry; the internal-name check fails on it.
- Repo changes the build needs, each noted, none made here: a `site` commitlint scope; a Dependabot entry for `/site`
  with majors split out; `exclude-paths: ["site"]` in release-please; `site/**/fixtures/**` in `.oxfmtrc.json` (oxfmt
  rewrites Markdown fixtures); the site job in `ci.yml`.

## The module map

In codebase-design terms. Each module is named with the glossary's words, holds a lot behind a small interface, and is
tested through that interface.

| Module                                         | Interface                                                                                                            | What it hides                                                                                        | Tested by                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **site data** (`build/site-data`)              | `siteData()` for the build, `readSiteData(repo)` for checks and specs; `SITE_INPUTS`, `BRAND_FILES`                  | which files hold which fact, the one rule for a missing input, finding the repo                      | specs over a fixture repo; a spec ties `SITE_INPUTS` to the CI job's list |
| **facts** (`build/facts`)                      | `readFacts(repo)` → version, Claude Code range, install commands, eye thresholds; `checkFacts(html, facts)`          | parsing plugin.json, the README and the status line's tone rule; naming the fact and file on failure | specs with literal expectations                                           |
| **release notes** (`build/releases`)           | `readReleases(changelog)`, `releaseNotesPage(releases)` → chips with counts, feed path; `atomFeed(releases, origin)` | both heading forms, change-row parsing, counting, escaping                                           | specs on the real pending 1.0.0 changelog                                 |
| **page text** (`build/page`)                   | `pageText(html, { demo })`, `pageCode(html)`, `builtPages(dist)`                                                     | what counts as visible text, the demo exclusion, where each page is served                           | specs                                                                     |
| **tokens** (`build/tokens`)                    | `readTokens(css)`, `undeclaredTokens`, `undeclaredBreakpoints`                                                       | CSS parsing; `tokens.css` is the only token source                                                   | specs hold `tokens.css` to the Components artboard                        |
| **headers** (`build/headers`)                  | `siteHeaders(dist)` → the `_headers` text                                                                            | hashing inline scripts and styles, the line limit, rule joining                                      | specs; browser tests run under the result                                 |
| **site checks** (`build/checks`)               | `checkSite({ site, repo })` → findings, each naming its file                                                         | facts, internal names, hand-written JS, brand bytes, tokens, breakpoints; checker and lint proofs    | specs per rule over throwaway sites                                       |
| **words** (`src/content/words.ts` + `<Words>`) | one `Wording` per string: text, or text and `short`                                                                  | showing one variant by CSS                                                                           | browser test at 1440 and 390                                              |
| each **piece** (`src/<area>/`)                 | `wire<Piece>(root)` over the finished HTML                                                                           | its pointer, scroll and keyboard handling                                                            | its own `*.e2e.ts` beside it                                              |

Seams: the repository is the one real seam (a fixture repo in specs, the real one in the build: two adapters). Pages
are thin: they ask site data and words, and render. Nothing else opens a repository file.

## The site/ tree

```text
site/
  AGENTS.md                    what an agent needs that the tree and configs cannot say (below)
  package.json  bun.lock  bunfig.toml
  tsconfig.json                strict, Bun types, the .astro content mapper; fixtures excluded
  astro.config.ts              static output, directory pages, trailing slash
  playwright.config.ts         runs src/**/*.e2e.ts and tests/**/*.e2e.ts against the built site
  oxlint.config.ts             extends the repo's rules; type-aware on tsrs-lint
  wrangler.jsonc               the assets-only Worker
  src/
    site.ts                    the site origin, the one fact the repository cannot supply; the build fails while empty
    pages/                     routes only: each file picks its layout and renders its area's module
      index.astro  404.astro  releases/index.astro  releases/feed.xml.ts
      llms.txt.ts  robots.txt.ts  sitemap.xml.ts  index.md.ts  releases/index.md.ts
    layouts/Page.astro         head, canonical, skip link, the head script (motion switch, boot gate)
    styles/                    tokens.css (the only token source), base.css, motion.css
    content/                   the site's words and the scripted session: words.ts, session.ts, faq.ts, status-line.ts
    page/                      pieces of the page itself: title block, ruler, section label, cell grid, <Words>
    nav/                       the nav, nav frame, label decode, docked bar, progress line, menu sheet
    frame/                     the frame: the lens, the crosshair, the journey, the slot
    mascot/                    the mascot, the eyes, the eye slip, the glyph field, the ghost
    demo/                      the demo: session player, pane tabs, text version, the 390 crop
    status-line/               the status line: tiles, meters, the usage slider, the status rail
    install/                   command blocks and the copy button, meters boot, terminal tabs
    motion/                    the boot curtain and the ambient motion switch
    release-notes/             releases, filter chips, the release rail, the road to 1.0.0
    not-found/                 the search frame
    footer/                    the footer and its light
  build/                       build-time modules, never shipped; each folder holds its module, its spec and fixtures
    site-data/  facts/  releases/  page/  tokens/  headers/  brand/  fonts/  checks/
  tests/                       whole-site tests: landing, headers, Lighthouse; serve.ts, the local stand-in for Workers
  public/                      served as they are: fonts/ (the committed subsets); brand/ (copied at build, gitignored)
```

Rules behind it:

- **A folder per glossary area.** A piece lives in the area the glossary files it under, named with the glossary's
  word. `Piece.astro` holds its markup and scoped style, `piece.ts` its behaviour, `piece.e2e.ts` its browser test,
  side by side. An `.astro` script only imports its module and calls it; type-aware lint sees `.ts` files only.
- **Pages are routes.** A file in `pages/` has no logic beyond picking data and an area module.
- **Build-time code lives in `build/`**, one folder per module, its spec (`*.spec.ts`) and fixtures beside it. Browser
  code never imports `build/` at runtime; pages import it at build time.
- **Names:** PascalCase for `.astro` files, kebab-case for `.ts`, the glossary's words for both.
- **Beside the plugin:** `site/` is its own package (ADR 0022), shares the repo's oxlint and oxfmt configs and commit
  rules, and is invisible to `claude plugin test` by its spec suffixes.

## Test strategy

Every piece of logic is built test-first, and tested at the cheapest level that sees the behaviour.

| Level      | Tool                                                                    | What it holds                                                                                                                                      | Why this level                                                                                            |
| ---------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Spec       | `bun test`, `*.spec.ts` beside the module                               | site data, facts, release notes and the page model, page text, tokens and breakpoints, headers, every site-check rule, the site origin             | pure build-time logic; fast; literal expectations from the design or the real changelog, never recomputed |
| Proof      | `bun test`                                                              | both type checkers fail on four planted errors (`.ts`, `.astro` frontmatter, `.astro` script, `.tsx`); oxlint reports the planted floating promise | a checker that silently stops checking fails the build                                                    |
| Site check | `bun build/checks/run.ts` over `dist/`                                  | facts on every page, internal names, hand-written JS, brand bytes, undeclared tokens and breakpoints, font coverage                                | properties of the built output as a whole                                                                 |
| Browser    | Playwright with Chrome, `*.e2e.ts` beside each piece; axe on every page | each piece's behaviour, keyboard use, reduced motion, no-JS, the real 404 status, the shipped CSP, words at 1440 and 390                           | behaviour needs a real browser; tests import words and facts instead of pasting them                      |
| Budget     | `lighthouse` 13.6.0 as a spec, every built page, mobile and desktop     | 100 in all four categories, no scored audit below 1                                                                                                | the hard constraint, as an assertion                                                                      |
| Visual     | Playwright screenshots, generated on Linux CI                           | a report against the artboards; gating waits on the owner's install-size decision                                                                  | artboards are not pixel baselines; committed PNGs reach every user today                                  |
| Links      | lychee, already in the repo                                             | the docs and the built pages' internal links                                                                                                       |                                                                                                           |

## The CI job

One job, `Site`, in `ci.yml` (ADR 0021), checked in the skeleton with actionlint and zizmor:

1. Check out with `fetch-depth: 0`, `persist-credentials: false`, actions pinned by hash.
2. If nothing in `site/`, `SITE_INPUTS` or the job changed against the base, succeed at once.
3. Before 1.0.0 is tagged, fetch the release branch and write its `CHANGELOG.md` into the checkout.
4. Set up Bun from `mise.toml`; `bun install --cwd site --frozen-lockfile --ignore-scripts`.
5. `bun run --cwd site check`: both type checks, lint, format, specs, build (brand copy, Astro, `_headers`), site checks,
   browser tests, Lighthouse. Chrome is the runner's own; no browser download.

Measured locally on the skeleton: 72 s for the whole chain. The runner budget is 4 minutes.

## The walking skeleton

Built test-first in a scratch git repo outside this one (25 commits, leftovers below), to prove the structure before
any build. Every slice went red for the right reason before its code existed.

What it holds: the build; `tokens.css` held to the artboard; the copy button in its three states; the release notes,
page model and feed from the real pending 1.0.0 changelog; facts read from plugin.json, the README and the status line;
the site checks; both checker proofs and the lint proof; the site origin; `_headers` with CSP hashes; words with phone
variants; the CI job. Result: 70 specs, 12 browser tests and 6 Lighthouse runs at 100, in 72 s.

What it found that research had missed: Lighthouse refuses to score a 404 response; oxfmt rewrites Markdown fixtures;
the plugin's test runner would run site tests named `*.test.ts`; Cloudflare joins a header two rules set; tsc and tsrs
agree on every `.ts` diagnostic and differ only in exit code (1 against 2); tsrs caught a real `aria-pressed` type error
in an `.astro` template.

What the architecture review changed (improve-codebase-architecture; the owner adopted 1 to 11, and 12 as a fact):

| #    | Before                                                                                                    | After                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1, 3 | pages and checks each read repo files, two ways of finding the repo, the CI list restated in three places | one site-data module owns the inputs; a spec ties the CI job to them                 |
| 2    | two checks each stripped tags their own way (already drifted once)                                        | one page-text module every text check reads                                          |
| 4    | chip counts computed in a template, seen only by a browser test                                           | the release notes module returns the page model; counts in a spec                    |
| 5    | the test server sent its own CSP with `'unsafe-inline'`; Lighthouse slept 600 ms                          | the build writes `_headers`; tests and Lighthouse run under it; health-checked start |
| 6    | the brand list in three places; a missing copy went unnoticed                                             | one list in site data; the check walks it both ways                                  |
| 7    | Lighthouse's page list by hand                                                                            | taken from `dist/`                                                                   |
| 8    | flat `parts/` and `tests/`; "copy" meant three things                                                     | a folder per glossary area, each test beside its piece; site strings are "words"     |
| 9    | the phone breakpoint written once in one file                                                             | `--bp-*` tokens; every `@media` width checked against them                           |
| 10   | lint fixtures nothing ran                                                                                 | a spec requires the type-aware finding                                               |
| 11   | browser tests pasted content                                                                              | they import words and facts                                                          |
| 12   | 60 and 85 would be copied into the site                                                                   | read from `statusline/render.ts`'s tone rule; the site is held to it                 |

## SEO, AEO and security plans in one place

- Every page: title and description from `words.ts`; canonical from `site.ts`; OG and X tags; one `h1`; landmarks; skip
  link. The landing page: `WebSite` and `SoftwareApplication` JSON-LD; a JSON-LD block is data, which CSP does not check.
- Files: `sitemap.xml`, `robots.txt` (all crawlers, the sitemap), `/llms.txt`, `index.md` and `releases/index.md`
  copies, `releases/feed.xml`; `_headers` sets their content types.
- Headers: the table in areas 10 and 11. HSTS on the zone.

## Risks

| #   | Risk                                                                  | If it happens                                                                                                                                    |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | tsrs, a month-old beta port, misses an error or blocks the build      | the checker proof fails first; tsc 7.0.2 still checks every `.ts`; drop tsrs sooner on the triggers in ADR 0023; tsc 7.1 replaces it when stable |
| 2   | Astro's yearly major breaks the build                                 | the output is static HTML; upgrades stay on a branch until the full chain passes; one previous major gets security fixes                         |
| 3   | the CSS spring on the lens and pupils feels dead when retargeted      | Motion mini (3.5 KB) for those two pieces only                                                                                                   |
| 4   | Lighthouse 100 flakes on shared runners (simulated throttling varies) | rerun once; if it recurs, take the median of three runs in the spec                                                                              |
| 5   | scroll-driven animations misbehave in a newly supporting browser      | the journey sits inside `@supports`; turning it off leaves the static frames                                                                     |
| 6   | the 2,000-character CSP line fills with hashes                        | the build fails and says so; move inline scripts into files, which need no hash                                                                  |
| 7   | the status line's tone rule changes shape                             | the facts check fails, naming the file; update the pattern with it                                                                               |
| 8   | the release-please override for "(7.14)" is missed before tagging     | the internal-name check fails the site build; the release itself is unaffected                                                                   |
| 9   | Cloudflare's zone settings (AI blocking, managed robots.txt) turn on  | curl checks after the first deploy; they are on the owner's settings list                                                                        |

## Deliberately left out

| Left out                                         | Why                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| React, Preact, Svelte, any UI runtime            | no piece holds shared state; 3.1 KB against 47.9–71.9 KB                                                 |
| shadcn/ui, Base UI                               | native controls cover four of five; Base UI with React is over the ceiling                               |
| Tailwind                                         | no component library to serve; the design is raw cell-grid values                                        |
| Motion, GSAP                                     | the platform covers all 29 moments; GSAP's licence is proprietary                                        |
| Three.js / WebGL                                 | the brief allows one piece at most; the chosen direction has none                                        |
| Astro content collections                        | the checks run outside Astro and need the same data                                                      |
| `astro check`, TypeScript 6                      | tsrs checks `.astro` files on TypeScript 7                                                               |
| `@lhci/cli`                                      | 294 packages against `lighthouse`'s 106; budgets read better as a TypeScript spec; it reads no TS config |
| Server islands, SSR, an adapter, a client router | nothing per-request; cross-document view transitions cost 0 KB                                           |
| Cloudflare Web Analytics                         | its beacon is a third-party script; no self-hosting                                                      |
| A live GitHub star count                         | a runtime third-party request; the nav artboard draws no count                                           |
| FAQPage markup, satori OG images                 | no rich result since 2026-05-07; satori is pre-1.0 and resvg unreleased since 2024-03                    |
| A light theme, i18n                              | dark only for 1.0.0; one language, with no hard-coded locale paths, so room is left                      |

## The owner's list

Decisions and settings only the owner can make, carried out of this research:

1. **The domain.** `site/src/site.ts` holds the origin; the build fails while it is empty. The workers.dev address
   stands in until a domain is chosen.
2. **Installing the plugin from a subfolder.** Every plugin install downloads the whole repo (`source: "./"`). Measured
   today: a shallow clone is 26 MB on disk (17 MB working tree, 13 MB of it `docs/`), a full clone 29 MB. `site/` adds
   an estimated under 1 MB without screenshot baselines (the skeleton commits 55 KB of source and a 127 KB lockfile;
   fonts 27 KB). Moving the plugin to a subfolder would ship neither `docs/` nor `site/`. Committing visual baselines
   waits on this.
3. **The "(7.14)" leak.** A commit override on #56 before 1.0.0 is tagged, rewriting that Docs entry without the spec
   number.
4. **Cloudflare settings when the domain is set up:** AI bot blocking off, managed robots.txt off, HTTP/3 on, HSTS on
   the zone as in ADR 0020. Later: HSTS preload.
5. **Colours not placed with confidence (26):** the inset outlines on the "Docs" and "Source" buttons of the menu sheet
   and on the Atom and GitHub links of the release notes header (`--line-1` or `--line-2`); the amber release state
   chip's outline (`--busy-eye`, `--busy` or `--line-2`); the joined filter chips (`--line-1` like the nav's joined
   pair, or `--line-2` like single controls); the `f` keycap; the release rail's version frame (the frame's 18% white
   or `--line-2`); the 390 demo's two-tab switch; the 390 pager's inactive bar; the boot timeline's baseline. Each is
   quoted with its file in [broken-colours.md](research/broken-colours.md). Also: whether the 18 swatch rings may vanish
   into their fills, and a token for `#3A3A47`.
6. **The plugin's own thresholds.** `statusline/render.ts` repeats 60 and 85 as literals at lines 313, 325, 326 and 342
   besides the tone rule the site reads; one constant there would keep them together.

## Skills used

brainstorming (criteria and candidates), dispatching-parallel-agents and Matt Pocock's research (one background agent
per group of areas, findings in `research/`), prototype with tdd and test-driven-development (the spikes, budgets
first), grilling and domain-modeling (two rounds; ADRs and the glossary), codebase-design (the module map),
improve-codebase-architecture (the review above), writing-for-agents (this file and the AGENTS.md below),
emil-design-eng and web-design-guidelines (the motion judgement and the quality bar), verification-before-completion,
requesting-code-review and Matt Pocock's code-review (a fresh reviewer on these documents). Not available: Impeccable is
not installed as a skill (only its CLI is on this machine), so its critique and audit did not run; wayfinder was
dropped at the owner's request. The research agents covered areas in groups (1, 2, 16; 3, 5; 4, 6; 7, 8; 9, 12, 14;
10, 11; 13), not one agent per area.

## Proposed site/AGENTS.md

Added by the build, not by this change.

```markdown
# site/

The ghostframe website: Astro static output, plain TypeScript, plain CSS. Decisions: docs/decisions/0013 to 0027.
Words for its parts: docs/design/website/GLOSSARY.md. Run everything with `bun run check`.

- Every file you write is TypeScript (.ts, .tsx) or .astro with TypeScript scripts. Generated JavaScript stays in
  dist/; a site check fails on any other .js, .mjs, .cjs or .jsx.
- Put a piece in the folder of its glossary area, named with the glossary's word: Piece.astro, piece.ts and
  piece.e2e.ts side by side. An .astro script only imports its module and calls it.
- Read repository facts and release notes through build/site-data only. A new repository file the site reads joins
  SITE_INPUTS, and the CI job's list with it.
- Write words in src/content/words.ts. A phone-only shorter string is the entry's `short`; facts never live there.
- Take colours, spacing, motion values and breakpoints from src/styles/tokens.css. A new value is a new token.
- Copy brand files unchanged: list them in BRAND_FILES. The check compares their bytes.
- Name unit tests *.spec.ts and browser tests *.e2e.ts; the plugin's runner picks up *.test.ts.
- Write the failing test first. Expected values come from the design, the real changelog or a literal.
- In `.astro`, write `<script>`, not `<script lang="ts">`: an attribute makes Astro ship the script untranspiled.
```
