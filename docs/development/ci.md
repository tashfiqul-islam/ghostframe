# What CI runs, and why

A pull request runs only the jobs its files need, and every required check still reports. One TypeScript module
decides: [`tools/ci/map.ts`](../../tools/ci/map.ts). The change-detection job, `mise run ci:plan`, `mise run ci:run`
and the pull request's CI comment all read it; this page explains it and does not restate it.

For an agent, in one line: **run `mise run ci:plan` before pushing; the PR's CI comment says what ran and why.**

## The map

`map.ts` holds three lists:

- **Rules:** paths (`Bun.Glob` patterns) and the areas they touch, each with its reason. The first rule a path matches
  decides, so narrow rules come first. Shared setup (workflows, actions, anything a workflow or tool reads such as
  `.github/actionlint.yaml`, `mise.toml`, `hk.pkl`, `package.json`, lockfiles, `tsconfig`, lint and format configs,
  git attributes) and this map itself touch `all`, which runs everything. Repo settings GitHub applies and nothing in
  CI reads (rulesets, `CODEOWNERS`, issue forms, the pull request template, `dependabot.yml`) touch `settings`: their
  JSON and YAML only have to parse and be formatted. Before a path leaves shared setup, grep the workflows and tools
  for a reader; the rule's comment says what was checked. A file no rule claims falls to the last rule, `unclassified`, which runs everything too.
- **Decisions:** the yes or no each guard needs (`gate`, `docs`, `settings`, `tests`, `plugin_tests`, `perf`,
  `readme`, `site`), each turned on by its areas and saying what it guards. `all` turns on every one but `docs` and
  `settings`: the Quality gate checks the Markdown and formats the settings itself, so the Docs and Repo settings jobs
  run only for a change with no code.
- **Jobs:** every job in every workflow, when it runs on a pull request (a decision, always, or never), and the steps
  CI runs through `ci.ts`.

A push to `main`, a dispatched run and the release-please pull request run everything. The report-only benchmarks
(`benchmarks.yml`) sort a push's own files too: a push that touches no measured path measures nothing, and the
nightly run always measures.

Jobs skip with `if:`, never with a workflow's `on: paths`: a required check that never starts counts as missing and
blocks the merge. The ruleset requires **CI**, the job at the end of `ci.yml`, which passes only when every job in
the workflow passed or was skipped and fails on any failure or cancellation; it also requires **Conventional title**,
which never skips (it lints the title on every open, edit, reopen and push, since a skipped required check
counts as passing and the title becomes the squash commit release-please reads), **Dependency review**, and **Performance**, which runs on every pull request and passes at once when nothing measured
changed.

## The map checks itself

`bun tools/ci/ci.ts --self-test` (the Quality gate's `ci-map` step) holds every rule to a fixture, a list of changed
files and the decisions they must turn on, and fails on a rule with no fixture. `bun tools/ci/ci.ts --check` fails
when a workflow job is not in the map, when the map names a job or step no workflow has, when a step that runs only
under a decision has an `if:` that does not say so, when the change-detection job or the action lacks a decision's
output, or when a tracked file falls to `unclassified`: it still runs everything, but the map gets its rule instead
of running everything forever.

## Before pushing

```sh
mise run ci:plan                  # what CI will run for this branch against origin/main, and why
mise run ci:run                   # run exactly that here (the Tests job on this system only)
mise run ci:run -- check tests    # just these jobs, every step
```

`ci:plan` reads the same diff CI does (committed, staged, unstaged and untracked files against the merge base with
`origin/main`) and prints the areas, each file's rule and reason, and every job with its yes or no and its local
command. `ci:run` runs each job's steps from `map.ts`: CI runs each step as `bun tools/ci/ci.ts step <job> <id>`, so
both run the same command. `mise run check` is still the whole local gate.

## What a pull request says

The change-detection job writes the plan to its job summary. The CI job writes the result to its summary and uploads
it, and [`performance-comment.yml`](../../.github/workflows/performance-comment.yml) puts it in the pull request's
one comment: a CI section (the result, each job's result and reason, the local command for each failure, and the
plan) above the Performance section. Each section is replaced when its workflow finishes, and the comment is never
posted twice.

## Reading a failure

A finding from a linter that speaks GitHub's annotation format (oxlint, actionlint, zizmor) also shows on its line
in the pull request's diff; `map.ts` turns those formats on only on GitHub, so a local run prints plain text. A step
that fails ends its log, and its job's summary, with a short block: the command, the first lines that look
like errors (else the last 20 lines), and how to reproduce it (the step's command, and `mise run ci:run -- <job>`).
The CI section names each failed job with its local command. To read the first errors without paging through the
logs:

```sh
gh pr checks <pr>                       # which check failed, with its run's link
gh run view <run-id> --log-failed       # only the failed steps' logs; the summary block is at the end of each
```

The run id is the number at the end of the run's link, and in the CI section's `gh run view` line.
