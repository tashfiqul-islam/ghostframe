# Testing

## Set up

Tool versions are pinned in `mise.toml` (Bun, hk, actionlint, zizmor, shellcheck, lychee).

```sh
mise run setup      # installs the dev tools in tools/ and the git hooks
```

The dev tools live in `tools/`, not at the plugin root: a `package.json` with a lockfile at the root would make
Claude Code install dependencies on every user's machine.

## The checks

| Command                               | Runs                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `bun run --cwd tools test`            | The plugin's tests: `claude plugin test .`, every `tests/**/*.test.ts(x)`.           |
| `bun run --cwd tools test:statusline` | The status line's specs: `bun test ./statusline`, every `statusline/*.spec.ts`.      |
| `bun run --cwd tools typecheck`       | tsrs over the plugin, the tests, the tools and the status line.                      |
| `bun run --cwd tools lint`            | oxlint, type-aware.                                                                  |
| `bun run --cwd tools fmt:check`       | oxfmt.                                                                               |
| `bun run --cwd tools boundaries`      | The import rules in `hooks/README.md`, and that the spec's screens match the tests'. |
| `bun run --cwd tools validate`        | `claude plugin validate .`                                                           |
| `mise run check`                      | All of the above, plus workflow lint and audit, no-JavaScript, and the docs' links.  |

The plugin's tests run in Claude Code's own harness, so `claude` must be on your `PATH`. The engine's type
declarations come from a local session (`.claude-plugin/types/`, never committed), so the plugin's type-check and the
type-aware lint run locally only; CI runs the syntax lint and type-checks the dev tools.

## Where tests go

`tests/` mirrors `hooks/`: a test lives at the path of the module it covers. [tests/README.md](../../tests/README.md)
has the layout and the helpers. The engine fills the manifest's option defaults into every test, so Cockpit is on in a
test unless it passes `OFF` (`{ options: { cockpit: false } }`) from `tests/support/cockpit.ts`.

## The spec's screens

`tests/support/screens.ts` is generated from the spec's section 12 by `bun run --cwd tools screens`. The screen tests
feed the renderers each screen's data and compare their rows with it. `boundaries` fails when the file is out of date.

## CI

`.github/workflows/ci.yml` runs the gate on Ubuntu with a pinned, checksum-verified Claude Code, and **Tests** on
Ubuntu, Windows and macOS: the plugin's tests with the same pinned CLI, and the status line's specs. `pr.yml` checks the
PR title against the commit rules. A pull request runs only the jobs its files need, decided by `tools/ci/map.ts`, and
the required **CI** job reports for all of them: [ci.md](ci.md). Run `mise run ci:plan` before pushing.

`.github/workflows/canary.yml` runs every Monday, and by hand, against the **latest** Claude Code on all three systems:
plugin validation, the plugin's tests, the status line's specs, and the live checks' own unit tests. ghostframe draws
through the engine's plugin API, so an engine change should fail there first. When it fails, fix what changed, then
raise `CLAUDE_CODE_VERSION` and its three checksums in `ci.yml` (each from that version's `manifest.json`), and the
same lines in `performance.yml` and `benchmarks.yml`: `tools/scripts/engines.ts --check` fails while they differ.

`.github/actions/claude` installs the CLI for every job: the binary for the runner's platform, checked against the
checksum pinned in `ci.yml`, or for `latest` against the release's own manifest.

## The live checks

The unit tests cannot see what Claude Code actually draws. The [live checks](live-checks.md) drive a real session.
