# 09 · Repo fit, tests and CI, content pipeline, agent docs (areas 9, 12, 14)

Checked 2026-11-28 against `D:\Projects\ghostframe-wt\website-stack` at `b4408e0` (origin/main is `b0e06d0`).
Versions from the npm registry today unless noted. "est." = estimate, not measured.

## 0. Surprises first

1. **The design export already breaks the gate.** `oxfmt --check` (repo pin 0.78.0, run from the worktree) fails on
   18 files: every `docs/design/website/*.dc.html` plus `canvas.json`. oxfmt formats HTML natively now, and
   `.oxfmtrc.json` doesn't ignore `docs/design/website/**` the way it ignores `docs/design/brand/**`. Add the ignore
   before the PR merges, or CI's "Check formatting (oxfmt)" goes red.
2. **The handoff's git-log fallback would leak internal names.** HANDOFF.md §16 step 3 builds an untagged release
   from `git log <bootstrap-sha>..HEAD`. 9 commit subjects in that range carry internal names: "Cockpit v8"
   (6a07220), "cockpit phase 5" to "phase 11" (#15 to #22), "cockpit v7 spec" (#6). release-please hides them through
   `BEGIN_COMMIT_OVERRIDE` blocks on PRs #1, #3, #4 and #6 to #23. So read release-please's output, never raw git
   subjects.
3. **The repo is public and the release branch is fetchable without a token.**
   `git fetch origin release-please--branches--main--components--ghostframe` and then `git show FETCH_HEAD:CHANGELOG.md`
   return the pending 1.0.0 notes. They're byte-identical in content to PR #27's body. No `gh`, no API call, no
   `GITHUB_TOKEN` scope.
4. **No CHANGELOG.md exists on main yet.** No tags exist either. It appears only when PR #27 merges.
5. **ci.yml uses no path filters.** Every job always runs, and six contexts are required (`.github/rulesets/main.json`).
   A site job fits that model: it always runs and does nothing when nothing relevant changed.
6. **release-please would put site commits in the plugin's changelog.** A `feat(site): …` lands under "Features" and
   bumps the plugin. `exclude-paths: ["site"]` on `packages["."]` skips commits that touch only `site/`. It's in
   release-please's config schema today.
7. **`source: "./"` in marketplace.json ships the whole repo to every user's plugin cache.** `site/` would ship too:
   fonts, images and screenshot baselines. Today `docs/` is already about 13 MB.

## 1. Repo conventions site/ must plug into (area 9)

### What exists

| Thing            | Today                                                                                                                                                                                                                                                                                       | Source                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Agent docs       | No `AGENTS.md` or `CLAUDE.md` tracked anywhere in the repo                                                                                                                                                                                                                                  | `git ls-files`                                  |
| Packages         | No root `package.json`, on purpose: "a package.json with a lockfile at the root would make Claude Code install dependencies on every user's machine". Separate packages with their own `package.json` + `bun.lock`: `tools/`, `tools/live/`, `docs/assets/` (playwright-core 1.65.0, sharp) | tools/package.json, docs/development/testing.md |
| Bun settings     | `tools/bunfig.toml`: `minimumReleaseAge = 259200` (3 days), `exact = true`                                                                                                                                                                                                                  |                                                 |
| Toolchain        | mise.toml: bun 1.4.4, hk 2.12.0, pkl, actionlint 1.7.12, zizmor 1.32.0, shellcheck, lychee 0.24.2, rumdl 0.3.4. No Node                                                                                                                                                                     |                                                 |
| Lint             | `cd .. && oxlint -c tools/oxlint.config.ts` over the whole repo; oxlint 1.93.0 pinned (latest 1.95.0, 2026-11-23); `--type-aware` locally only                                                                                                                                              | tools/package.json                              |
| Format           | `cd .. && oxfmt` over the whole repo, `.oxfmtrc.json` (printWidth 160, no semi, single quotes); oxfmt 0.78.0 pinned (latest 0.80.0, 2026-11-23)                                                                                                                                             |                                                 |
| Types            | tsrs 7.1.0-beta.tsrs2 is "the only type checker"; `tsconfig.base.json` is strict plus `isolatedDeclarations`, `erasableSyntaxOnly`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`                                                                                                |                                                 |
| No-JS rule       | `mise run lint-js`: fails if `git ls-files -- '*.js' '*.mjs' '*.cjs' '*.jsx'` lists anything; no allowlist. hk `no-js` step on the same globs. Only _tracked_ files count                                                                                                                   | mise.toml, hk.pkl                               |
| Unit tests       | `bun test ./statusline` (`*.spec.ts`); plugin tests via `claude plugin test .` (`tests/**/*.test.ts(x)`)                                                                                                                                                                                    | testing.md                                      |
| Docs lint        | `rumdl check .` + `lychee --offline --include-fragments` on every tracked `*.md`; no lychee config file                                                                                                                                                                                     | mise.toml                                       |
| Commit scopes    | `hooks theme tests deps actions ci docs release tooling cockpit statusline`                                                                                                                                                                                                                 | tools/commitlint.config.ts                      |
| ADRs             | `docs/decisions/NNNN-kebab.md`, `# NNNN. Title` / `Status: accepted.` / `## Context` / `## Decision` / `## Consequences`; index table in README.md. **Next number: 0013**                                                                                                                   | docs/decisions                                  |
| Repo-fact checks | `tools/scripts/*.ts` with `--check` and `--self-test` (readme.ts, engines.ts …), run by `boundaries`                                                                                                                                                                                        |                                                 |

### How site/ plugs into each

| Hook point          | What site/ needs                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Notes                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Package shape**   | Its own package: `site/package.json` + `site/bun.lock` + `site/bunfig.toml` (copy the 3-day release age and `exact`). **No Bun workspace.**                                                                                                                                                                                                                                                                                                                                                    | A workspace needs a root `package.json`, which the repo forbids. Its own lockfile also keeps Astro, Playwright and lhci out of the `tools/` gate install and the PR-title job. That matches how `docs/assets/` and `tools/live/` are set up.                                                                                                                         |
| **No-JS rule**      | Works unchanged as long as nothing `.js` is committed. Use `astro.config.ts`, `playwright.config.ts` and `lighthouserc.json` (lhci reads JSON). Keep `site/dist/` and `site/.astro/` in `.gitignore`. Never vendor a `.js` into `public/`.                                                                                                                                                                                                                                                     | `git ls-files` only sees tracked files, so built JS is fine.                                                                                                                                                                                                                                                                                                         |
| **oxlint**          | Covered automatically: it lints from the repo root. **oxlint lints the `<script>` blocks of `.vue`, `.svelte` and `.astro` files** (oxc.rs linter usage page, current; it doesn't say which version added this). Add `**/site/dist/**` and `**/site/.astro/**` to `ignorePatterns`. Whether `.gitignore` is respected wasn't verified, so be explicit. Type-aware rules need a `site/tsconfig.json` that tsgolint can resolve.                                                                 | Template markup in `.astro` isn't linted.                                                                                                                                                                                                                                                                                                                            |
| **oxfmt**           | Native today: `.html .css .scss .md .vue`. **Prettier-backed and off by default:** `.svelte` (needs the `svelte` package plus option `svelte`; since 0.49.0, May 2026) and `.astro` (needs `@astrojs/compiler-rs` plus option `astro`; added in 0.73.0, Oct 2026, PR oxc#27386). Prettier-backed formats "require Node.js and are only available with the oxfmt npm package". In `.astro`, `<style>` still goes through Prettier, not oxfmt's CSS. Someone reported whitespace issues on 0.74. | oxfmt runs from `tools/`, so `@astrojs/compiler-rs` would have to resolve from there, which means a `tools/` devDependency. **Unverified**: whether it resolves from `site/node_modules`, and whether it works under Bun without Node. Spike it. If you use .astro files, hk's oxfmt glob needs `css,html,astro` added (it's `ts,tsx,json,jsonc,md,yml,yaml` today). |
| **Type check**      | `.ts` in site/ can go through tsrs (`tsrs -p site`). **`.astro` files need `astro check` (@astrojs/check 0.9.12), which runs on the TypeScript language service, not tsrs.** That breaks the "tsrs is the only type checker" rule.                                                                                                                                                                                                                                                             | Svelte has the same issue (svelte-check). Vanilla `.ts` islands plus a non-component framework keep tsrs alone. This is a C8 point for the framework area.                                                                                                                                                                                                           |
| **tsconfig**        | `site/tsconfig.json` extends `../tsconfig.base.json` and adds `lib: ["ESNext","DOM","DOM.Iterable"]`. `isolatedDeclarations` then applies to site code, which is consistent but means more annotations.                                                                                                                                                                                                                                                                                        | Astro ships its own strict base; two `extends` work (the root tsconfig already does it).                                                                                                                                                                                                                                                                             |
| **mise tasks**      | Add `site-setup` (`bun install --cwd site --frozen-lockfile`), `site-dev`, and `site-check` (build + bun test + deny-list + lychee + Playwright). **Keep `site-check` out of `mise run check` and `setup`**, so a plugin contributor never installs Playwright. CI runs it in its own job.                                                                                                                                                                                                     |                                                                                                                                                                                                                                                                                                                                                                      |
| **hk**              | One step, `site`, with `glob = List("site/**")` and `check = "bun run --cwd site check:fast"` (types + unit tests, no browser) in pre-commit. The existing oxlint/oxfmt/no-js/lychee steps cover site files through their globs.                                                                                                                                                                                                                                                               | hk steps run only when matching files are staged.                                                                                                                                                                                                                                                                                                                    |
| **commitlint**      | Add `site` to `scope-enum`, and to CONTRIBUTING.md's scope list (two places).                                                                                                                                                                                                                                                                                                                                                                                                                  | Only note this, don't change it.                                                                                                                                                                                                                                                                                                                                     |
| **release-please**  | `"exclude-paths": ["site"]` in `packages["."]` (schema: "If all files from commit belong to one of the paths it will be skipped"). Use `docs(site)` or `chore(site)` as a convention either way.                                                                                                                                                                                                                                                                                               | Without it, site work ships as plugin "Features".                                                                                                                                                                                                                                                                                                                    |
| **Dependabot**      | New entry: `package-ecosystem: bun`, `directory: /site`, weekly, `cooldown.default-days: 14` (same as the house entries). Group minor and patch: `groups.site.patterns: ['*']` + `update-types: [minor, patch]`, so a major (Astro 8, Playwright) comes as its own PR. The `github-actions` entry already covers a new workflow.                                                                                                                                                               | The house uses one group per directory with `patterns: ['*']` (all update types). Splitting off majors is the only change.                                                                                                                                                                                                                                           |
| **CI**              | See §2.4. A new job "Site" in ci.yml (or site.yml), added to `required_status_checks` in `.github/rulesets/main.json`.                                                                                                                                                                                                                                                                                                                                                                         | Ruleset changes are applied by an admin with `gh api` (releasing.md). That's a user-owned step.                                                                                                                                                                                                                                                                      |
| **lychee**          | Already pinned at 0.24.2. For the built site: `lychee --offline --include-fragments --root-dir site/dist 'site/dist/**/*.html'` (`--root-dir` resolves absolute links in local files; docs current as of 0.24.2).                                                                                                                                                                                                                                                                              | Offline only, the same rule as the docs. External links are a separate, non-gating weekly check if wanted.                                                                                                                                                                                                                                                           |
| **ADR**             | `docs/decisions/0013-website-stack.md`, same format. The ADR index has no "proposed" status today; every ADR says `Status: accepted.`                                                                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                      |
| **Plugin tests**    | Name site unit tests `*.spec.ts` (the statusline convention), not `*.test.ts`. **Unverified**: whether `claude plugin test .` picks up `**/*.test.ts` outside `tests/`. testing.md says `tests/**`.                                                                                                                                                                                                                                                                                            |                                                                                                                                                                                                                                                                                                                                                                      |
| **Brief's CI asks** | website-brief.md asks for `npx impeccable detect` as a CI check. That's another tool, run with npx. Decide whether it gates.                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                                      |

### site/AGENTS.md: what the line test implies

Claude Code (≥ 2.1.277) reads a subdirectory's `AGENTS.md` when it opens a file there with the Read tool, as long as
that directory has no `CLAUDE.md` (code.claude.com/docs/en/memory, fetched today). The repo has no CLAUDE.md, so one
`site/AGENTS.md` serves Claude and Codex, and no import is needed.

Matt Pocock's `writing-for-agents` (mattpocock-skills 1.3.1, `skills/productivity/writing-for-agents/SKILL.md`):

- **A line earns its place only if knowing it changes what the agent does** (no-op hunt). Delete any sentence the
  model already obeys by default. Delete the whole sentence; don't trim it.
- **The environment is the source of truth.** Scripts, configs and layout are lookups. A doc that restates them is a
  stale-prone cache. Cache only what the agent can't find by looking: unwritten conventions, the why, gotchas.
- **Context pointers.** A line that names a doc is a pointer. Its wording decides when the agent reaches the doc.
  Put the leading word first, use one trigger per branch, and drop synonyms.
- **Two loads.** Always-loaded lines cost context every turn. Push reference behind pointers (progressive
  disclosure) and inline what every branch needs.
- **Steps end on checkable completion criteria.** "Done when `bun run --cwd site check` is green and the screenshot
  diff is reviewed" beats "make sure it works".
- **Leading words over restated triads. Positive phrasing over prohibitions.** A ban makes the banned thing more
  available. Pair any guardrail with the target behaviour.
- **One source of truth per meaning. Prune sediment.**

For site/AGENTS.md, that means **don't** list the folder tree, script names or versions (the agent reads
package.json). **Do** keep only lines that change behaviour:

- every fact on the page comes from the repo through the typed loaders; the build fails if a fact is missing;
- the deny-list exists, and why: no design-round or phase names;
- the TypeScript-only rule;
- the island JS budget and Lighthouse 100 are the bar;
- motion rules: transform and opacity only, reduced motion, keyboard is instant;
- screenshot baselines come from Linux CI only, and how to update them;
- a pointer to the ADR and to the artboards (`docs/design/website/`) as the design source;
- don't edit `docs/design/website/*`; it's data;
- a done criterion.

Target: 15 to 25 lines.

## 2. Quality and testing (area 12)

### 2.1 Tools, versions, labels

| Tool                 | Version (date)                                                         | Role                                                                                           | Label                                                 |
| -------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `bun test`           | Bun 1.4.4 (mise)                                                       | Unit tests for loaders, generators, deny-list self-test                                        | stable; already in repo                               |
| Vitest               | 5.1.2 (2026-11-25)                                                     | Only needed for Astro's container API (component rendering in unit tests)                      | stable; one more dependency, not needed               |
| @playwright/test     | 1.65.1 (2026-11-13); next 1.66 alpha                                   | Behaviour tests (30 from `interact.py`), screenshots, axe host                                 | stable; repo already uses playwright-core 1.65.0      |
| @axe-core/playwright | 4.14.1 (2026-11-24), axe-core ~4.14.1                                  | WCAG 2.0/2.1/2.2 A+AA rules on `/`, `/releases/`, 404 at 1440 and 390                          | stable                                                |
| @lhci/cli            | 0.16.1 (2026-11-11), bundles lighthouse 13.6.0; engines node ≥ 22.19.0 | Lighthouse 100 ×4, mobile + desktop                                                            | stable                                                |
| pixelmatch           | 8.0.0 (2026-10-06)                                                     | Already inside Playwright's `toHaveScreenshot` ("Playwright Test uses the pixelmatch library") | stable                                                |
| odiff-bin            | 4.5.0 (2026-07-23)                                                     | Native, faster diff; only for a report-only diff against artboard PNGs                         | stable; not needed                                    |
| lychee               | 0.24.2 (2026-05-01, mise)                                              | Internal links + fragments in dist                                                             | stable; already in repo                               |
| dorny/paths-filter   | v4.0.3 (2026-08-05)                                                    | Change detection                                                                               | stable; a third-party action, so a git diff is better |

### 2.2 Visual comparison: what can gate and what can't

| Approach                                                                                                         | Can it gate?    | Why                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toHaveScreenshot` against **self-generated baselines** from the built site                                      | **Yes**         | Baselines are per browser and platform (`-chromium-linux`). Playwright: "run tests in the same environment where the baseline screenshots were generated". Generate them on Linux CI only (or in the `mcr.microsoft.com/playwright:v1.65.1-noble` image locally); the maintainer works on Windows. |
| Pixel diff against the **artboards** (`docs/design/website/*.dc.html`)                                           | **No**          | They don't fully render: `support.js` and the `/_blob/` images aren't in the export.                                                                                                                                                                                                               |
| Pixel diff against the designer's **reference PNGs** (`D:\Projects\ghostframe\docs\design\website\screenshots\`) | **Report only** | Different renderer, font rasterisation and missing assets mean a pixel-exact match never holds. Use a `site/scripts/compare.ts` with odiff or pixelmatch that writes diff PNGs for a human or agent to check against ACCEPTANCE.md.                                                                |

The user's memory rule "verify against the spec" fits the report-only diff plus a per-point checklist.

Baseline cost: about 2 pages × 2 viewports × a few states, roughly 10 to 20 PNGs. They ship to users through
`source: "./"` (see §0.7). Masking: the boot curtain, clock-driven text and canvas noise need `mask` or
`animations: 'disabled'`, plus `reducedMotion: 'reduce'` for stable frames.

### 2.3 Lighthouse CI shape

- `staticDistDir: "./dist"`: lhci starts its own static server. An explicit `url` list turns off auto-discovery.
  `isSinglePageApplication` stays false, so `/404.html` is a real file.
- Two configs, or one run per preset: mobile is the default, and desktop is `settings.preset: "desktop"`. lhci can't
  run both presets in one `collect`.
- Assertions: the designer's `build/lighthouserc.json` is **desktop only, minScore 0.95**. The brief needs **1.0 on
  both presets**. Keep its LCP ≤ 1800, CLS 0, TBT ≤ 150, `resource-summary:script:size` ≤ 122880 bytes (size
  assertions are in bytes, while budget.json uses KB; you can't mix the two).
- Upload: `filesystem` (no public storage of reports). `temporary-public-storage` is public by link.
- Chrome: the ubuntu-24.04 image (20261122.23.1) has Google Chrome 158 and Node 22.23.5 preinstalled, which
  satisfies lhci's Node ≥ 22.19. lhci finds Chrome through chrome-launcher or `CHROME_PATH`. No download.
- Runs: `numberOfRuns: 1` on PRs (medians are noisy but 100 is a ceiling, so a flaky 99 shows up fast), 3 on main.
  On a shared runner, a 100 performance score on mobile throttling can flake. **No evidence found** on how often for
  a site this size. Plan a retry or the median of 3 before treating a 99 as a failure.

### 2.4 The CI job: always runs, short-circuits

GitHub docs (Troubleshooting required status checks; Status checks reference): a **workflow** skipped by path
filtering stays **Pending** and blocks merging. A **job** skipped by an `if:` conditional reports **Success** and
doesn't block. So add one job, always triggered, that detects changes with a plain git diff (no third-party action,
zizmor-friendly; pass SHAs through `env`, never inline `${{ }}` in `run`):

```yaml
site:
  name: Site
  runs-on: ubuntu-24.04
  timeout-minutes: 10
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@… # v7.0.1
      with:
        persist-credentials: false
        fetch-depth: 0 # git stats need full history (54 commits today; cheap)
    - name: Did the site or its inputs change?
      id: changes
      env:
        BASE: ${{ github.event.pull_request.base.sha }}
      run: |
        if [ -z "$BASE" ]; then echo "run=true" >> "$GITHUB_OUTPUT"; exit 0; fi # push to main, dispatch
        if git diff --quiet "$BASE" HEAD -- site CHANGELOG.md .claude-plugin README.md docs/design/brand \
             docs/development/releases release-please-config.json mise.toml .github/workflows/ci.yml; then
          echo "run=false" >> "$GITHUB_OUTPUT"; echo "No site input changed."
        else echo "run=true" >> "$GITHUB_OUTPUT"; fi
    # every later step: if: steps.changes.outputs.run == 'true'
    # mise (bun lychee) → bun install --cwd site --frozen-lockfile --ignore-scripts
    # git fetch --depth=1 origin release-please--branches--main--components--ghostframe (anonymous; public repo)
    # bun test → build → deny-list over dist → lychee offline → Playwright (behaviour, axe, screenshots) → lhci ×2
```

An alternative is a separate `changes` job plus `site` with `needs` and `if:`. The skipped `site` shows as Success.
One job is simpler and keeps one context.

The release PR (#27) changes CHANGELOG.md, so the release-notes page gets tested before the release. Deployment is
a separate job on `push: main` only, with `needs: site`. It's not a required check.

Timings for a PR that touches the site, ubuntu-24.04 (est., not measured):

| Step                                                                          | Cold                        | Cached                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| checkout, fetch-depth 0                                                       | 3 s                         | 3 s                                                                                                                                                                                                                                                         |
| mise (bun, lychee)                                                            | 10 s                        | 5 s                                                                                                                                                                                                                                                         |
| `bun install` (framework + Playwright + lhci; lighthouse 13 is the heavy one) | 15–30 s                     | 5–10 s (`~/.bun/install/cache`)                                                                                                                                                                                                                             |
| fetch release branch                                                          | 1–2 s                       |                                                                                                                                                                                                                                                             |
| bun test + build                                                              | 10–25 s                     |                                                                                                                                                                                                                                                             |
| Playwright chromium-headless-shell download                                   | 15–30 s                     | 2–3 s (cache `~/.cache/ms-playwright`, key on version). Or use the preinstalled Chrome (`channel: 'chrome'`) for behaviour/axe and skip the download; keep the pinned shell for screenshots, because system Chrome updates weekly and would churn baselines |
| Playwright suite (~30 behaviours + axe + ~15 screenshots, 2 viewports)        | 40–70 s                     |                                                                                                                                                                                                                                                             |
| lhci 3 pages × 2 presets × 1 run                                              | 60–90 s (3 runs: 3–4.5 min) |                                                                                                                                                                                                                                                             |
| **Total**                                                                     | **≈ 3–4.5 min**             | **≈ 2.5–3.5 min**                                                                                                                                                                                                                                           |

To stay under 4 minutes with margin: 1 lhci run per PR and 3 on main, and use Playwright `workers: 2` (runner has 4
vCPU). A no-change PR finishes in about 5 s.

## 3. Content pipeline (area 14)

### 3.1 Sources and how each enters the build

| Fact                    | Single source                                                                                                                                                 | Read how                                                                                                                                                                   | Fails when                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Version                 | `.claude-plugin/plugin.json` `version` (1.0.0)                                                                                                                | `JSON.parse` + schema                                                                                                                                                      | missing / not semver                                                                           |
| Claude Code range       | `plugin.json` `engines["claude-code"]` (`>=2.1.329 <2.2.0`); ADR 0012 calls this "in one place"                                                               | Same file. Reuse the parser in `hooks/shared/range.ts` if it imports cleanly (Bun runs .ts; a bundler outside `site/` root needs `server.fs.allow` or similar; unverified) | unparseable                                                                                    |
| Install commands        | README.md: `/plugin marketplace add …`, `/plugin install ghostframe@ghostframe`, `/ghostframe-statusline install`, the shell `claude plugin …` lines          | Extract from fenced blocks under the Install anchor and assert they equal the site's constants, or render them from README                                                 | README changes and the site doesn't                                                            |
| Requirements            | README.md table (Claude Code, Bun "for the status line only", …)                                                                                              | Same                                                                                                                                                                       |                                                                                                |
| Release notes, released | `CHANGELOG.md` on main (created when PR #27 merges)                                                                                                           | Parse `## <ver> (<date>)` for the first release; later ones are `## [x.y.z](compare-url) (date)`. **Parse both.** The handoff assumes `## [x.y.z]` only                    | no release parsed                                                                              |
| Release notes, pending  | Branch `release-please--branches--main--components--ghostframe`, file `CHANGELOG.md` (= PR #27 body)                                                          | `git fetch` anonymously in CI and locally; pass the file path via env                                                                                                      | branch missing **and** plugin.json's version isn't in CHANGELOG.md                             |
| Human summary           | `docs/development/releases/<version>.md` (1.0.0.md exists)                                                                                                    | Parse sections                                                                                                                                                             |                                                                                                |
| Tagged or not           | Version present in **main's** CHANGELOG.md means released. release-please writes main's CHANGELOG only on merge, and the tag follows in the same workflow run | No API, no tag fetch needed. The changelog date is the PR's date, not the tag's; usually the same day                                                                      |                                                                                                |
| Commits per day         | `git log origin/main --first-parent --format=%cs`, bootstrap-sha to HEAD                                                                                      | Needs `fetch-depth: 0` in CI. Today: 11-18 5, 21 6, 22 9, 23 2, 25 2, 27 9, 28 20 (53 total). The designer's snapshot says 36, so it goes stale                            | shallow repo (`git rev-parse --is-shallow-repository` = true): fail, don't silently show zeros |
| Brand                   | `docs/design/brand/*.svg`, `head.html` (still `YOUR-DOMAIN`)                                                                                                  | Copy at build; `SITE_URL` env for the origin                                                                                                                               | missing file; `SITE_URL` unset in production build                                             |
| Launch gate             | `plugin.json` version ≥ 1.0.0, `userConfig.cockpit.default === true`                                                                                          | (HANDOFF §13)                                                                                                                                                              |                                                                                                |
| Privacy claim           | no `node:http` / `fetch(` / … under `hooks/`, `statusline/`                                                                                                   | `check-privacy.ts` (HANDOFF §13)                                                                                                                                           |                                                                                                |

Repo pattern to copy: `tools/scripts/readme.ts` style, plain `.ts` with `--check` and `--self-test`, documented
functions.

### 3.2 Schema library

| Lib                   | Version (date)                             | Gzip (bundlephobia) | Fit                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| zod                   | 4.6.7 (2026-10-12)                         | 88.9 KB             | **Astro 7.4.13 depends on zod ^4.6.7 and re-exports it as `astro/zod`**, so it costs nothing extra with Astro. Content collections (`file()` loader or inline loader + `schema`) fail the build on invalid data |
| valibot               | 1.5.0 (2026-09-09)                         | 14.7 KB             | Smallest; Standard Schema; fine if the framework isn't Astro                                                                                                                                                    |
| arktype               | 2.2.10 (2026-11-18); 3.0.0-rc.12 on `next` | 46.8 KB             | A major is coming, so there's churn risk                                                                                                                                                                        |
| @standard-schema/spec | 1.1.0 (2025-12-15)                         | types only          | Interop interface; doesn't validate by itself                                                                                                                                                                   |

Size doesn't matter (build-time only). Strictness: use `z.strictObject` / `v.strictObject` so unknown keys fail too.
Recommendation: put loaders in plain TS modules (`site/src/data/*.ts`) that call `schema.parse` at import time.
They're framework-agnostic and unit-testable with `bun test`. With Astro, use the zod it already ships. Otherwise
use valibot.

### 3.3 Keeping internal names off the site

Found today:

| Where                                                       | Internal text                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| PR #27 body / pending CHANGELOG, Docs                       | "say why /compact's rows stay at the left edge **(7.14)**", a spec section number                                  |
| Same, Internal                                              | "time **turn.step**'s own work in the 40,000-file test …", a code identifier; "fixtures, benchmarks, report CI"    |
| Raw git subjects (not in the changelog thanks to overrides) | "Cockpit **v8**", "cockpit **phase 5**" … "**phase 11**", "cockpit **v7** spec, amendments and feasibility report" |
| `docs/development/releases/1.0.0.md`                        | Links "**ADR 0012**" publicly, so "ADR" alone is not internal (a user-owned call)                                  |

Two layers:

1. **Source choice.** Use release-please's CHANGELOG (main or the release branch), never `git log` subjects, for any
   text a user reads. Git is for counts only.
2. **Deny-list gate over `dist/`.** Add `site/scripts/deny.ts` (`--self-test` style), run after the build over every
   `dist/**/*.{html,xml,txt,md,json,svg}`. Patterns, each with a reason:
   - `\b[Vv][0-9]{1,2}\b(?!\.\d)`: design rounds, while still allowing `v1.0.0`
   - `\bphase[ -]?\d+\b`: build phases
   - `\(\d+\.\d+\)`: spec section numbers
   - `\bcockpit-v\d+\b`
   - `\b(HANDOFF|ACCEPTANCE|feasibility|amendments)\b`
   - `YOUR-DOMAIN`, `FROM_REPO`, `TODO`: leftover placeholders
   - `\bdf9ab55\b`: the designer's snapshot SHA

   The deny-list is code, not content: fix the source (a commit override or the release notes), never the
   pattern. **The Internal group** ("turn.step", test names) is the bigger leak surface. The design shows it closed by
   default. Whether to publish it at all is the owner's call.

## 4. Lead's call: scoring hints

These don't rank frameworks alone; they feed C5, C7 and C8 for the framework area:

- **C8 repo fit.** Vanilla `.ts` islands + plain `.html`/`.css` output fit best: oxlint, oxfmt and tsrs cover
  everything natively. **Astro** costs a second type checker (`astro check`), oxfmt's Prettier-backed `.astro` path
  (off by default, needs `@astrojs/compiler-rs` in tools/, Node-dependent and still young), and oxlint script-only
  coverage. **Svelte** has the same shape (svelte-check, Prettier-backed). **Eleventy/Vite + .ts** need neither.
  Score Astro 3/5 and Svelte 3/5 on C8, vanilla/Vite 5/5, unless the spike shows `.astro` formatting is clean under
  Bun.
- **C7 content.** Astro 4.5/5: zod and content collections are built in. Others 4/5 with valibot and plain loaders.
  Same strictness, and one dependency more.
- **C5 agents.** Astro is the best known to models, and `site/AGENTS.md` stays short either way.
- **Tests are framework-neutral.** bun test + Playwright 1.65.1 + @axe-core/playwright 4.14.1 + @lhci/cli 0.16.1 +
  lychee 0.24.2 (already in repo). Don't add Vitest.
- **Package shape is settled by the repo.** site/ is its own package with its own lockfile and Dependabot entry,
  with no workspace.

## 5. Open questions

1. Does oxfmt's `.astro` support work run under Bun from `tools/`, and does it resolve `@astrojs/compiler-rs` there?
   (Spike: 10 min.)
2. Should site/ ship to users at all? With `source: "./"` it does. Option: a `git-subdir` or another marketplace
   source shape. Not researched; this belongs to the plugin area.
3. Should the Internal changelog group appear on the site? (Owner call.)
4. Lighthouse 100 flake rate on mobile throttling on shared runners: no evidence found. Measure during the spike.
5. Does `claude plugin test .` ignore `site/**/*.test.ts`? Use `.spec.ts` to avoid the question.
6. Does a bundler import of `hooks/shared/range.ts` from site/ type-check under the site's tsconfig? That file's
   project expects the engine's types.
7. Does `npx impeccable detect` (the brief's ask) become a gate? It's another tool run through npx, with no pinned
   version yet.

## Sources

- oxlint usage (framework files: script blocks only): <https://oxc.rs/docs/guide/usage/linter.html> (current, © 2026)
- oxfmt language support: <https://oxc.rs/docs/guide/usage/formatter/language-support.html> (current); Astro PR
  <https://github.com/oxc-project/oxc/pull/27386> (Oct 2026)
- GitHub, skipped vs pending required checks:
  <https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks> ,
  <https://docs.github.com/en/pull-requests/reference/status-checks> (current)
- Dependabot options (directories glob, groups update-types, cooldown):
  <https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference> (current)
- Lighthouse CI configuration: <https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md> (main)
- Playwright snapshots: <https://playwright.dev/docs/test-snapshots> (current, v1.65)
- lychee CLI: <https://lychee.cli.rs/guides/cli/> (as of v0.24.2)
- runner image: <https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md> (20261122.23.1)
- release-please exclude-paths:
  <https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json> ,
  docs/manifest-releaser.md (main)
- Claude Code AGENTS.md loading: <https://code.claude.com/docs/en/memory> (fetched 2026-11-28)
- Astro content collections (zod, file loader): Context7 /withastro/docs
- npm registry, 2026-11-28: dist-tags and times for every version above; bundlephobia for gzip sizes
- Repo files as cited; PR #27 via `gh pr view 27`; release branch via `git fetch`
