# 0022. site/ is its own package, beside the plugin, with no workspace

Status: proposed.

## Context

The plugin root has no `package.json`, on purpose: the plugin runs inside Claude Code and installs nothing. A Bun
workspace needs a root `package.json`. The repo already keeps tooling in packages of their own (`tools/`,
`tools/live/`, `docs/assets/`), each with its own `package.json` and `bun.lock`.

The marketplace entry's `source` is `./`, so every file in the repo, `site/` included, reaches each user's plugin
cache. Measured on 2026-11-28: a shallow clone of the repo is 26 MB on disk (a 17 MB working tree, 13 MB of it
`docs/`, and a 9.2 MB pack); a full clone is 29 MB. The walking skeleton's `site/` commits 55 KB of source and a 127 KB
lockfile, and the two font subsets are 27 KB; the full site is estimated at under 1 MB without screenshot baselines.

## Decision

`site/` has its own `package.json`, `bun.lock` and `bunfig.toml`, installed with `bun install --cwd site`. It shares
the repo's oxlint and oxfmt configs and the commit rules. Its build output, `node_modules`, generated brand copies and
test artefacts are gitignored. Whether screenshot baselines are committed waits on the owner's decision about installing the plugin
from a subfolder: today every committed byte reaches each user.

## Consequences

- Dependabot gets a `/site` entry of its own, grouped so minor and patch updates arrive as one pull request.
- release-please gets `exclude-paths: ["site"]`, so site commits never appear in the plugin's changelog.
- commitlint gets a `site` scope.
