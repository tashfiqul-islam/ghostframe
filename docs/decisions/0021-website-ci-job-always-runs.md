# 0021. One website CI job that always runs, and skips its work when site/ is untouched

Status: proposed.

## Context

The site's checks should be a required status check without blocking plugin pull requests. A workflow filtered by
`paths` never starts on a pull request that does not touch those paths, and a required check that never starts stays
pending and blocks the merge. A job that starts and skips its steps reports success.

## Decision

The site has one job in the existing CI workflow. It always runs, compares the pull request against its base, and runs
the site's checks only when `site/`, a site input (the repository files the site reads, listed once as `SITE_INPUTS`
in the site-data module) or the job itself changed. Otherwise it succeeds at once.

## Consequences

- The inputs are one list in the site-data module (`SITE_INPUTS`: `plugin.json`, `README.md`, `CHANGELOG.md`, the
  brand folder, `statusline/render.ts`), and a spec fails when the job's `git diff` list differs from it plus `site/`
  and the job itself. A new input cannot be read without the job watching it.
- The full run, Lighthouse included, has a budget of 4 minutes.
