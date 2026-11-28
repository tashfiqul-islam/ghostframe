# 01 Framework, island runtime, tooling (areas 1, 2, 16)

Researched 2026-11-28. Versions are from the npm registry today (`registry.npmjs.org/<pkg>`: `dist-tags.latest` and
`time`). Measurements were made today in `scratchpad/try/framework/` (Windows 11, Bun 1.4.4, Node 26.13.1 present).
Labels: **stable today**, **newly available**, **coming**.

## TL;DR

- **Astro 7.4.13 (2026-11-18) is the latest stable release.** A page with no islands ships **0 bytes of JS** (measured).
  `astro.config.ts` works. `bun run build` and `bun --bun run build` both work (2-page build: 0.4 s inside Astro,
  2.5-3.3 s wall-clock).
- **Surprise: the repo's checker, tsrs 7.1.0-beta.tsrs5, type-checks `.astro` files.** It needs
  `@astrojs/ts-content-mapper` 0.2.0 and `--runExternalCode`. I measured that it catches frontmatter type errors,
  template-expression errors and wrong island props, in 0.3 s. `astro check` itself refuses TypeScript 7 (see the source
  quote below).
- **The island runtime is the biggest JS cost.** Measured gzip for a hello-world island: React 19.3.1 + react-dom =
  **67.8 KB**, Svelte 5.59.2 = 20.3 KB, Solid 2.0.4 = 13.3 KB, Preact 11.2.0 = 5.5 KB, vanilla TS = 0.2 KB.
- **React 19 + Base UI 1.9.0 is over budget.** Base UI for the design's five controls (tabs, accordion, slider, tooltip,
  dialog) measured **127.4 KB gzip** with React, which is over the 120 KB ceiling. Native HTML covers four of those
  controls with 0 KB of runtime. Tabs need about 1 KB of TypeScript (WAI-ARIA APG pattern).
- **SvelteKit 3 and Svelte tooling do not run on TypeScript 7 alone.** `@sveltejs/kit` 3.4.1 declares peer
  `typescript ^6.0.0`, and `svelte-check` 4.7.8 declares `^5 || ^6`. Neither can run on tsrs or TypeScript 7 alone,
  and no Svelte content mapper is published on npm.

## Versions today (npm registry, 2026-11-28)

| Package                                     | Latest (date)                              | Majors (first release date)                                 | Notes                                                                                   |
| ------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| astro                                       | 7.4.13 (2026-11-18)                        | 5.0 2024-12-03 · 6.0 2026-03-10 · 7.0 2026-06-22            | `legacy` tag 4.16.19; 5.x last patch 5.18.2 2026-05-26; 6.x last patch 6.4.8 2026-06-17 |
| @astrojs/check                              | 0.9.12 (2026-10-21)                        | 0.x                                                         | peer `typescript ^5 \|\| ^6`                                                            |
| @astrojs/ts-content-mapper                  | 0.2.0 (2026-09-22)                         | 0.x                                                         | for TS 7.1+ `contentMappers`                                                            |
| @astrojs/preact / react / solid-js / svelte | 6.1.6 / 7.1.9 / 7.1.6 / 9.1.6 (2026-11-13) | integration majors follow the Astro majors                  |                                                                                         |
| @sveltejs/kit                               | 3.4.1 (2026-11-25)                         | 2.0 2023-12-14 · 3.0 2026-10-01                             | `version-2` tag 2.70.4 still patched (2026-11-05); peer TS `^6.0.0`, Node >= 22.17      |
| @sveltejs/adapter-static                    | 4.0.1 (2026-10-29)                         | 4.0 2026-10-01                                              |                                                                                         |
| svelte                                      | 5.59.2 (2026-11-25)                        | 5.0 2024-10-19                                              | 349 releases in 5.x                                                                     |
| svelte-check                                | 4.7.8 (2026-11-01)                         | 4.0 2024-09-02                                              | peer TS `^5 \|\| ^6`; `--tsgo` mode still needs TS 6 installed                          |
| react-router / @react-router/dev            | 8.5.3 (2026-11-24)                         | 7.0 2024-11-22 · 8.0 2026-06-17                             | `version-7` tag 7.18.7; framework mode needs Node >= 22.22, React >= 19.2.7             |
| @tanstack/react-start                       | 1.169.7 (2026-11-19)                       | 1.x (no 1.0.0 tag; an `rc` tag 1.169.6 is still published)  | I found no primary "stable 1.0" announcement                                            |
| @11ty/eleventy                              | 3.1.8 (2026-11-03)                         | 3.0 2024-10-01                                              | `canary` 4.0.0-alpha.12 (coming)                                                        |
| vite                                        | 8.4.0 (2026-11-26)                         | 6.0 2024-11-26 · 7.0 2025-06-24 · 8.0 2026-03-12            |                                                                                         |
| typescript                                  | 7.0.2 (2026-07-08)                         | 6.0.2 2026-03-23 (last 6.0.3 2026-04-16) · 7.0.2 2026-07-08 | `beta` 7.1.0-beta; `next` 7.1.0-dev.20261128.1                                          |
| tsrs                                        | 7.1.0-beta.tsrs5 (2026-11-23)              | tracks TS 7.1.0-beta                                        | repo pins 7.1.0-beta.tsrs2; oxc-project/tsrs                                            |
| bun                                         | 1.4.5 (2026-11-19)                         | 1.0 2023-09-08                                              | repo `@types/bun` 1.4.4; local 1.4.4                                                    |
| react / react-dom                           | 19.3.1 (2026-10-14)                        | 19.0 2024-12-05                                             |                                                                                         |
| preact                                      | 11.2.0 (2026-11-06)                        | 10.0 2019-10-01 · 11.0 2026-09-30                           |                                                                                         |
| solid-js                                    | 2.0.4 (2026-11-25)                         | 2.0 2026-11-17                                              | `babel-preset-solid` latest is still 1.9.19; Solid 2 needs `@next` 2.0.0-rc.2           |
| @base-ui/react                              | 1.9.0 (2026-10-09)                         | 1.0 2025-12-11                                              | `@base-ui-components/react` is deprecated ("renamed to @base-ui/react")                 |
| shadcn (CLI)                                | 4.23.1 (2026-11-25)                        | 4.0 2026-03-06                                              |                                                                                         |
| wrangler                                    | 4.169.0 (2026-11-27)                       | 4.0 2025-03-13                                              |                                                                                         |
| esbuild                                     | 0.28.2 (2026-08-08)                        |                                                             | used for the measurements                                                               |

## Astro majors: what changed (primary: astro.build blog and docs.astro.build upgrade guides)

- **5.0, 2024-12-03** ([blog](https://astro.build/blog/astro-5/)). It added the Content Layer (loaders, typed store) and
  server islands, merged hybrid and static output into `static`, added `astro:env`, and moved to Vite 6.
- **6.0, 2026-03-10** ([blog](https://astro.build/blog/astro-6/), [guide](https://docs.astro.build/en/guides/upgrade-to/v6/)).
  It requires Node 22.12+ and moves to Vite 7 with the Environment API, Zod 4 and Shiki 4. It removed legacy content
  collections, `<ViewTransitions />` (use `<ClientRouter />`), `Astro.glob()`, and `.cjs`/`.cts` config files. The Fonts
  API, CSP (`security.csp`), live collections and `failOnPrerenderConflict` became stable. The Cloudflare adapter was
  rebuilt on `workerd`. The adapter is not needed for a static site.
- **7.0, 2026-06-22** ([blog](https://astro.build/blog/astro-7/), [guide](https://docs.astro.build/en/guides/upgrade-to/v7/)).
  It moves to Vite 8 + Rolldown, and the Rust `.astro` compiler is now the only compiler. That compiler rejects
  unclosed tags and invalid nesting, and `compressHTML` defaults to `'jsx'`, which collapses whitespace between inline
  elements. Sätteri (Rust) is the default Markdown pipeline; remark/rehype need `@astrojs/markdown-remark` opt-in.
  Queued rendering is the default. Advanced routing (`src/fetch.ts` is now a reserved name) and route caching are stable.
  The blog reports 15-61% faster builds. Some `astro:transitions` internals were removed.
- **Support policy** ([docs.astro.build/en/upgrade-astro](https://docs.astro.build/en/upgrade-astro/), no date shown):
  "extended maintenance **for security fixes only** for one previous major version". No duration is stated. Observed:
  5.x got patches until 2.5 months after 6.0. 6.x got its last patch 5 days _before_ 7.0.
- **Cadence risk (C3):** 3 majors in 19 months, 2 of them in 2026 (Mar and Jun, 3.4 months apart). Each major broke only
  small things for a static site (config, compiler strictness, Markdown pipeline). Still, the site would face about two
  upgrades a year.

## (1) Framework comparison

Rendering facts come from the docs cited and my builds. KB values are gzip -9 of the JS that one page loads.

|                                                      | Astro 7                                                                                                                                                                                                                  | SvelteKit 3 + adapter-static                                                                                                                                | React Router 8 prerender / TanStack Start                                                                                                                                                 | Eleventy 3 + vanilla TS                                                                                                                   | Vite 8 multi-page + vanilla TS                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Static generation                                    | default `output: 'static'` (stable)                                                                                                                                                                                      | `prerender = true` + adapter-static (stable)                                                                                                                | `ssr:false` + `prerender` in `react-router.config.ts`; TanStack `prerender.enabled`                                                                                                       | core purpose (stable)                                                                                                                     | `build.rollupOptions.input` per HTML file; no templating   |
| Framework JS on a page with 0 interactive parts      | **0 KB, measured**                                                                                                                                                                                                       | **0 KB with `csr = false`, measured**; a normal page hydrates the whole page                                                                                | React + router on every page: **>= 67.8 KB** (React floor measured; router not measured). No zero-JS mode documented ([pre-rendering docs](https://reactrouter.com/how-to/pre-rendering)) | 0 KB                                                                                                                                      | 0 KB                                                       |
| Islands / partial hydration                          | yes: `client:load/idle/visible/media/only`; plus plain `<script>` (TS, bundled) at 0 runtime                                                                                                                             | **no partial hydration**: a page is fully hydrated (measured **34.6 KB** for one counter) or has no JS (`csr=false`); vanilla scripts must be wired by hand | no, full-page hydration                                                                                                                                                                   | no; `@11ty/is-land` 5.3.0 or plain scripts; you bundle TS yourself (esbuild / `Bun.build`)                                                | plain `<script type="module" src="x.ts">`, Vite bundles TS |
| Island loader cost                                   | measured: `astro-island` inline script about 1.5 KB + 1.6 KB client per framework                                                                                                                                        | n/a                                                                                                                                                         | n/a                                                                                                                                                                                       | is-land is small (not measured)                                                                                                           | none                                                       |
| Server islands                                       | yes (5.0+), need an adapter and a Worker per request                                                                                                                                                                     | n/a                                                                                                                                                         | n/a                                                                                                                                                                                       | n/a                                                                                                                                       | n/a                                                        |
| Page-to-page view transitions                        | cross-document `@view-transition` CSS works with any of them, 0 KB. `<ClientRouter />` measured **5.6 KB**                                                                                                               | client router comes with hydration (`csr`)                                                                                                                  | client router (part of the hydration cost)                                                                                                                                                | CSS only                                                                                                                                  | CSS only                                                   |
| TS-only config                                       | `astro.config.ts` (measured); 6.0 removed `.cjs/.cts`                                                                                                                                                                    | **SvelteKit 3: config through the Vite plugin in `vite.config.ts`** (measured, no `svelte.config.js`)                                                       | `react-router.config.ts`, `vite.config.ts`                                                                                                                                                | `eleventy.config.ts` via Node type stripping (22.6+) or tsx ([docs](https://www.11ty.dev/docs/languages/typescript/)); Bun not documented | `vite.config.ts`                                           |
| Type-check of the template files                     | **tsrs + `@astrojs/ts-content-mapper` works (measured)**; `astro check` refuses TS 7                                                                                                                                     | `svelte-check` needs TS 6 (`--tsgo` still needs TS 6 installed); no Svelte content mapper on npm                                                            | `.tsx` checks with tsrs directly                                                                                                                                                          | `.11ty.tsx` checks directly; Nunjucks/Liquid are untyped                                                                                  | `.ts` directly; HTML untyped                               |
| Build speed (2 tiny pages, wall-clock incl. startup) | 2.5 s (`bun run`), 3.3 s (`bun --bun`); Astro itself reports 0.39 s                                                                                                                                                      | 2.9 s                                                                                                                                                       | not measured                                                                                                                                                                              | not measured                                                                                                                              | not measured                                               |
| Bun                                                  | worked both ways (measured). Docs: "may reveal rough edges" ([recipe](https://docs.astro.build/en/recipes/bun/))                                                                                                         | worked (measured)                                                                                                                                           | engines Node >= 22.22; not measured                                                                                                                                                       | not documented                                                                                                                            | Vite under Bun is common; not measured                     |
| Cloudflare Workers static assets                     | no adapter for static; `assets.directory: ./dist`, `not_found_handling = "404-page"` ([CF guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/), modified 2026-11-05)                       | any static dir works the same way                                                                                                                           | SPA fallback / prerender; TanStack prerender on Workers since CF changelog 2025-12-19                                                                                                     | static dir                                                                                                                                | static dir                                                 |
| Typed content                                        | content collections: `glob()`/`file()`/custom loaders, Zod 4 schemas, `astro sync` types; a bad entry fails the build                                                                                                    | write a loader in `+page.ts` + Zod yourself                                                                                                                 | loaders at build + your own schema                                                                                                                                                        | data cascade, no schemas (add Zod yourself)                                                                                               | hand-rolled                                                |
| Oxc fit                                              | oxfmt formats `.astro` (opt-in, needs `@astrojs/compiler-rs`, via bundled Prettier) ([oxc docs](https://oxc.rs/docs/guide/usage/formatter/language-support.html)); oxlint lints frontmatter and scripts only, not markup | oxfmt `.svelte` opt-in; oxlint lints scripts only                                                                                                           | full                                                                                                                                                                                      | full for TS; templates not covered                                                                                                        | full                                                       |

**Server islands: not needed.** They render per request on a Worker behind an adapter. This site has no per-user or
per-request content: release notes are built from CHANGELOG at build time, and analytics is a static beacon. Using them
would add a Worker, an adapter and a request that blocks the island. Rule them out.

**View transitions.** Cross-document `@view-transition { navigation: auto }` costs 0 KB and is a safe progressive
enhancement. webstatus.dev today: same-document View Transitions are **newly available** (2025-10-14). The
cross-document version is **limited** (not Baseline), so browsers without it do a plain navigation. With only three
pages, Astro's `<ClientRouter />` (5.6 KB, plus re-running scripts on swap) is not worth its cost.

## (2) Island runtime cost (measured)

Method: `scratchpad/try/framework/rt/build.ts`. Each entry is a counter button mounted on `#app`, bundled with
esbuild 0.28.2 (`--bundle --minify`, ESM, es2022, `NODE_ENV=production`, `browser,production` conditions), then
`gzip -9`. Svelte was compiled with `svelte/compiler` and Solid with `babel-preset-solid@2.0.0-rc.2` first. Treat these
as a floor: Rolldown may tree-shake slightly differently, and real islands add their own code.

| Runtime                            | min KB |        gzip KB | Notes                                                                                                                        |
| ---------------------------------- | -----: | -------------: | ---------------------------------------------------------------------------------------------------------------------------- |
| React 19.3.1 + react-dom/client    |  218.3 |       **67.8** | same for `hydrateRoot`                                                                                                       |
| Svelte 5.59.2                      |   54.2 |       **20.3** | runtime grew: batch/async/boundary code is in the bundle                                                                     |
| Solid 2.0.4 + @solidjs/web         |   32.2 |       **13.3** | 2.0 is 11 days old; its JSX preset is still rc                                                                               |
| Preact 11.2.0 + hooks              |   13.0 |        **5.5** |                                                                                                                              |
| Vanilla TS                         |    0.2 |        **0.2** |                                                                                                                              |
| Astro + Preact island (real build) |        | **about 11.7** | client 1.6 + preact 4.6 + hooks 1.1 + **signals 3.0 (always pulled in by @astrojs/preact)** + component 0.4 + loader about 1 |

### Base UI and shadcn against native HTML

Base UI is at `@base-ui/react` 1.9.0 (peer `react ^17 || ^18 || ^19`). shadcn's changelog has a July 2026 entry "Base
UI as the Default". Its components ship for Base UI, React Aria and Radix
([changelog](https://ui.shadcn.com/docs/changelog); I read only the entry titles, not their full text).

| Controls (Base UI subpath)          | gzip KB incl. React (measured) |                                      Base UI alone (minus 67.8) |
| ----------------------------------- | -----------------------------: | --------------------------------------------------------------: |
| tabs                                |                           80.4 |                                                      about 12.6 |
| accordion                           |                           76.9 |                                                       about 9.1 |
| slider                              |                           81.8 |                                                      about 14.0 |
| tooltip                             |                          100.7 |                                        about 32.9 (floating-ui) |
| dialog (menu sheet)                 |                           90.5 |                                                      about 22.7 |
| **all five, real JSX usage**        |                      **127.4** |                                                  **about 59.6** |
| all five on `preact/compat` (alias) |                           68.3 | builds; **runtime not tested; Base UI does not support Preact** |

The per-control rows use a namespace import, so they are upper bounds. Some floating-ui and utils code is shared, so
the rows don't add up to the total.

| Control             | Native / vanilla (0 KB runtime)                                                                                                   | Status (webstatus.dev, 2026-11-28)                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Accordion           | `<details name="group">` exclusive groups                                                                                         | `details` widely; `name` **newly available** 2024-09-03 |
| Menu sheet / dialog | `<dialog>` + `showModal()` (focus trap, Esc, inert)                                                                               | **widely** (since 2024-09-14)                           |
| Tooltip / toggletip | `popover` (`hint` not checked) + `aria-describedby`; anchor positioning is **limited**, so position with CSS or a few lines of TS | popover **newly available** 2025-01-27                  |
| Slider              | `<input type="range">` + CSS                                                                                                      | widely                                                  |
| Tabs                | about 1 KB TS for the APG Tabs pattern (roving tabindex, arrow keys, `aria-selected`)                                             | n/a                                                     |
| `dialog closedby`   | **limited**, don't rely on it                                                                                                     |                                                         |

## (16) Tooling

### TypeScript and tsrs

- Repo facts: `tools/package.json` runs `tsrs -p .` (plus `tests`, `tools`, `statusline`) and pins
  `tsrs 7.1.0-beta.tsrs2`. `tsconfig.base.json` is `noEmit`, `isolatedDeclarations`, `module: Preserve`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly`, and every strict flag on. hk.pkl calls tsrs "the only type checker".
  `mise run lint-js` fails on any _tracked_ `.js/.mjs/.cjs/.jsx`, so a gitignored `dist/` is fine. tsrs is "A Rust port
  of the TypeScript 7 compiler (tsc), language server, and JavaScript API" (oxc-project/tsrs). Today it reports
  `Version 7.1.0-beta (tsrs 7.1.0-beta.tsrs5, microsoft/TypeScript@3e9236361fa9)`.
- TypeScript 7.0.2 (Go native) is `latest` (2026-07-08). It has no JS API, so Volar-based tools stay on TS 6.
  [TS 7.1 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/), announced 2026-10-20, brings
  back an API (`typescript/sync`, `/async`, ...) and **content mappers** (`contentMappers` in tsconfig plus
  `--runExternalCode`). The post lists mappers prototyped for Astro, Svelte, Vue, MDX, CSS Modules and Ember. It says an
  RC is "in about a month"; as of today only `7.1.0-beta` and dev builds exist. Status: **coming** (beta).
- **`astro check` does not run on TS 7.** Quoted from `astro@7.4.13/dist/cli/check/index.js`:
  "astro check does not currently support TypeScript 7.0. To continue using astro check, install TypeScript 6 instead.
  astro check will be deprecated in a future Astro release. Experimental support for type-checking Astro files with
  TypeScript 7.1+ is available through @astrojs/ts-content-mapper."
- **Measured: tsrs type-checks `.astro` files.** Setup: `"contentMappers": [{ "package": "@astrojs/ts-content-mapper",
  "extensions": [".astro"] }]` in tsconfig, then `tsrs --runExternalCode -p .`. It reported TS2322 in frontmatter,
  TS2339 in a `{expr}` in the template, and TS2322 for an unknown prop on a Preact island. A clean run takes 0.3 s and
  exits 0. Without the flag it fails fast with TS18068. `tsc` 7.1.0-beta gives identical results. Caveats: the mapper is
  0.x and TS 7.1 is beta. tsrs already tracks 7.1-beta, so the repo is already on beta. `--runExternalCode` runs
  `node_modules` code during type-check; the mapper is a first-party Astro package.
- Svelte: `svelte-check` needs TS 6 (or TS 6 plus TS 7 under an alias with `--tsgo`), per the svelte-check npm page and
  [sveltejs/language-tools#3063](https://github.com/sveltejs/language-tools/issues/3063). SvelteKit 3 requires
  TS >= 6 (release notes). It would add a second TypeScript to a repo that has one checker by rule.

### Bun

Bun 1.4.5 (2026-11-19). Astro 7 and SvelteKit 3 built under Bun in both modes in my spikes. `bun run` follows the
`#!/usr/bin/env node` shebang (Node 26 is installed here), and `bun --bun` forces the Bun runtime. The Astro docs say
only "Using Bun with Astro may reveal rough edges". I found no specific open Astro 7 + Bun build issue, but I did not
search the issue tracker exhaustively.

### Release cadence of the core dependencies, last 2 years (npm `time`)

| Dep                  | Majors since 2024-11                            | Gap                 | Old major after the next one             |
| -------------------- | ----------------------------------------------- | ------------------- | ---------------------------------------- |
| astro                | 5 (2024-12), 6 (2026-03), 7 (2026-06)           | 15 mo, then 3.4 mo  | security fixes only, one major back      |
| vite                 | 6 (2024-11), 7 (2025-06), 8 (2026-03)           | about 7-9 mo        | 6.x and 7.x still patched 2026-11-09     |
| typescript           | 6.0 (2026-03), 7.0 (2026-07)                    | 4 mo                | 6.0.3 last patch 2026-04-16              |
| svelte / kit         | svelte 5 (2024-10), kit 3 (2026-10)             | kit 2 lasted 33 mo  | kit 2 still patched (2.70.4, 2026-11-05) |
| react / react-router | react 19 (2024-12); RR 7 (2024-11), 8 (2026-06) | RR 19 mo            | RR `version-7` 7.18.7 still patched      |
| preact               | 11 (2026-09)                                    | 10.x lasted 7 years | 10.29.8 2026-08-01                       |
| eleventy             | 3 (2024-10); 4 in alpha                         | 20 mo and counting  |                                          |
| tailwindcss          | 4 (2025-01)                                     |                     | 3.4.19 2025-12-10                        |
| bun                  | 1.x since 2023-09                               | no major            |                                          |

### Lock-in and exit cost

- **Astro + vanilla TS:** `.astro` files are HTML plus a TS frontmatter, and the scripts are plain TS modules. To leave,
  copy the HTML out of `dist/` or port the templates; the CSS and TS move unchanged. Content collection schemas are Zod
  (portable). Low exit cost.
- **Astro + Preact/React islands:** the islands move to any Vite app. The `client:*` directives and Astro slot wrapping
  are Astro-only. Medium.
- **shadcn + Base UI:** the components are copied into the repo (you own them), but they tie you to React, Tailwind and
  Base UI. Medium to high.
- **SvelteKit:** `.svelte` components and runes are Svelte-only. Medium.
- **Eleventy / Vite MPA:** you own every line, and exit is nearly free; the cost is paid up front in glue code.

## Lead's call: suggested ranking (criteria and weights from 00-frame.md)

| Option                                                     | C1 20 | C2 20 | C3 15 | C4 10 | C5 10 | C6 8 | C7 7 | C8 5 | C9 5 |   /100 |
| ---------------------------------------------------------- | ----: | ----: | ----: | ----: | ----: | ---: | ---: | ---: | ---: | -----: |
| **A. Astro 7 + vanilla TS islands (native HTML controls)** |     5 |     5 |     3 |     4 |     5 |    5 |    5 |    5 |    4 | **91** |
| B. Astro 7 + Preact 11 islands where state is complex      |     5 |     4 |     3 |     4 |     4 |    5 |    5 |    4 |    3 |     83 |
| C. Eleventy 3 + vanilla TS                                 |     4 |     5 |     4 |     5 |     3 |    5 |    2 |    3 |    5 |     83 |
| D. Vite 8 MPA + vanilla TS                                 |     3 |     5 |     4 |     5 |     3 |    4 |    2 |    5 |    5 |     79 |
| E. SvelteKit 3 + adapter-static                            |     4 |     4 |     4 |     3 |     4 |    5 |    3 |    2 |    3 |     75 |
| F. Astro 7 + React 19 + Base UI/shadcn (current choice)    |     4 |     2 |     2 |     4 |     5 |    5 |    5 |    4 |    2 |     69 |
| G. React Router 8 / TanStack Start prerender               |     4 |     2 |     2 |     3 |     4 |    4 |    3 |    3 |    2 |     60 |

Why: A gives 0 KB of framework JS, typed content, TS-only config, and the one type checker the repo already has (tsrs
with the Astro mapper). Its only weak score is upgrade cadence. B is the fallback if an island grows real state (about
12 KB per page, and only on pages that use it). The current choice F fails the budget on runtime alone: 68 KB of React
before any control, and 127 KB with the five Base UI controls. Recommend dropping React islands and Base UI/shadcn.
Whether shadcn ever makes sense without React belongs to the styling agent (area 4).

## Open questions

1. Is `@astrojs/ts-content-mapper` 0.x on a beta TS stable enough for a CI gate? Proposed answer: yes, pinned exactly,
   because the repo already runs tsrs at 7.1-beta. Re-check when TS 7.1 goes stable (RC slipped past 2026-11-10).
2. Does `oxlint --type-aware` (oxlint-tsgolint) see `.astro` through the content mapper? Not tested. oxlint itself lints
   only frontmatter and scripts.
3. Does `astro sync` (needed for `.astro/types.d.ts` and `astro:content` types) need to run before `tsrs` in CI? Yes in
   practice; not tested in the repo layout.
4. Will Astro 8 follow within about 6 months? No roadmap evidence found. Budget for about two upgrades a year.
5. Not measured: React Router 8 and TanStack Start build output, Eleventy and Vite MPA build times, `@11ty/is-land`
   size, Base UI running on `preact/compat`.

## Sources (date = published / updated / checked)

- npm registry, all versions above, checked 2026-11-28.
- Astro: [blog 5.0](https://astro.build/blog/astro-5/) 2024-12-03; [blog 6.0](https://astro.build/blog/astro-6/)
  2026-03-10; [blog 7.0](https://astro.build/blog/astro-7/) 2026-06-22;
  [upgrade v6](https://docs.astro.build/en/guides/upgrade-to/v6/), [v7](https://docs.astro.build/en/guides/upgrade-to/v7/),
  [support policy](https://docs.astro.build/en/upgrade-astro/), [TypeScript](https://docs.astro.build/en/guides/typescript/),
  [Bun recipe](https://docs.astro.build/en/recipes/bun/) (no dates shown, read 2026-11-28);
  [ts-content-mapper README](https://github.com/withastro/astro/tree/main/packages/language-tools/ts-content-mapper);
  `astro@7.4.13` tarball source `dist/cli/check/index.js`.
- [TypeScript 7.1 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/) 2026-10-20.
- [SvelteKit 3.0.0 release](https://github.com/sveltejs/kit/releases/tag/%40sveltejs/kit%403.0.0) 2026-10-01;
  [page options](https://svelte.dev/docs/kit/page-options) (read 2026-11-28);
  [language-tools#3063](https://github.com/sveltejs/language-tools/issues/3063).
- [React Router pre-rendering](https://reactrouter.com/how-to/pre-rendering); [changelog](https://reactrouter.com/changelog).
- [Cloudflare: TanStack Start prerendering](https://developers.cloudflare.com/changelog/2025-12-19-tanstack-start-prerendering)
  2025-12-19; [Cloudflare Astro guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/) modified 2026-11-05.
- [Eleventy TypeScript](https://www.11ty.dev/docs/languages/typescript/) (read 2026-11-28).
- [Oxfmt language support](https://oxc.rs/docs/guide/usage/formatter/language-support.html) (read 2026-11-28).
- [shadcn changelog](https://ui.shadcn.com/docs/changelog) (entry titles only).
- webstatus.dev API `/v1/features/{popover,dialog,details-name,view-transitions,cross-document-view-transitions,anchor-positioning,dialog-closedby}`, checked 2026-11-28.
- Leads only, not evidence: WebSearch summaries of community repos about TS 7 workarounds (alrayyes, rafters-studio,
  bumbleflies; Nov 2026).
- Measurements: `scratchpad/try/framework/{astro-site,kit,rt}`.
