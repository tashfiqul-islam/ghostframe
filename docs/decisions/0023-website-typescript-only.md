# 0023. The website is TypeScript everywhere, checked by tsc and tsrs

Status: proposed.

## Context

The repo is TypeScript-only, and the site keeps that: every file a person or an agent writes in `site/` is TypeScript
(`.ts`, `.mts` where a module format needs it, `.tsx`), or an `.astro` file whose scripts are TypeScript. JavaScript
exists only as build output, which is never committed. Config files are TypeScript where the tool reads it
(`astro.config.ts`, `playwright.config.ts`, `oxlint.config.ts`), and JSON otherwise (`wrangler.jsonc`).

Run on 2026-11-28 ([TypeScript research](../design/website/research/16-typescript-7.md)): `typescript@7.0.2` checks
every `.ts` and `.tsx` file under `strict`, but it ignores `contentMappers` (a 7.1 option) and passes a type error planted in
an `.astro` file. tsrs, the Oxc project's Rust port of the TypeScript 7.1 checker, with `@astrojs/ts-content-mapper`
and `--runExternalCode`, catches errors in `.astro` frontmatter and scripts. `astro check` and the Astro language server
refuse TypeScript 7 and need TypeScript 6 installed alongside. The repo already type-checks with tsrs:
`tools/package.json:7` and `:34` (pinned `7.1.0-beta.tsrs2`), `hk.pkl:18`, `tsconfig.base.json:4`,
`.github/workflows/ci.yml:60`.

tsrs is experimental and about a month old, so it does not decide the build alone.

## Decision

- `site/` runs both checkers under `strict`, with no TypeScript 6 installed: `tsc` 7.0.2 over every `.ts` and `.tsx`
  file as the reference, and tsrs over everything, `.astro` included. tsrs and `@astrojs/ts-content-mapper` are pinned
  to exact versions, tsrs at the repo's pin.
- A test plants one type error in a `.ts` file, one in `.astro` frontmatter, one in an `.astro` script and one in a
  `.tsx` file, and fails unless each checker that should catch it does. A checker that silently stops checking fails
  the build.
- oxlint's type-aware rules run on `tsrs-lint`, which oxlint 1.92 and later uses in place of tsgolint when tsrs is
  installed (`TSRS_LINT_RUN_EXTERNAL_CODE=1`, because of the content mapper). They see `.ts` files only; plain rules
  also run in `.astro` scripts. So an `.astro` script only imports a module and calls it; the behaviour lives in `.ts`.
- `.astro` scripts are plain `<script>` tags, never `<script lang="ts">`: any attribute makes Astro ship the script
  untranspiled.
- A check fails the build when a `.js`, `.mjs`, `.cjs` or `.jsx` file appears in `site/` outside the build output and
  installed packages.

## Consequences

- Measured in the walking skeleton: on the `.ts` files, tsc and tsrs report the same diagnostics, code, position and
  text, and the only difference is the exit code on error (tsc 1, tsrs 2). Both run in about 0.3 s.
- The exit: when TypeScript 7.1 is stable and reads `contentMappers`, `tsc` 7.1 takes over `.astro` checking, and tsrs
  stays only if it still earns its place (speed, or the oxlint backend).
- Drop tsrs sooner if: the planted-error test catches it missing an error tsc catches; its diagnostics on `.ts` files
  differ from tsc's in a way that hides an error; the repo moves off it; or a release goes a month without fixing a
  crash or a false error that blocks the build.
- Editors check `.astro` files through the Astro extension, which uses the editor's own TypeScript; the project
  installs no TypeScript 6.
