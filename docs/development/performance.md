# Performance

ghostframe draws inside Claude Code's own frame, so every millisecond it spends is one Claude Code waits for. This page
holds the budgets it is held to, how to run the benchmarks that check them, and how to profile one hook.

- [The budgets](#the-budgets)
- [Run the benchmarks](#run-the-benchmarks)
- [Profile with GHOSTFRAME_PERF=1](#profile-with-ghostframe_perf1)
- [The fixtures](#the-fixtures)
- [In CI](#in-ci)
- [The Performance check](#the-performance-check)

## The budgets

Every number lives in [`tools/bench/budgets.ts`](../../tools/bench/budgets.ts), each with the reason for it; change it
there and nowhere else.

| Budget         | Limit                                                        | Measured by                                                             |
| -------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `keystroke`    | one key costs ghostframe under 2 ms of its own work          | harness: `AbovePrompt` + `PromptHint` own time per key                  |
| `unchangedRow` | a row drawn again unchanged in under 0.5 ms (cached)         | harness: every row drawn a second time, same id, width and text         |
| `pane`         | the whole pane under 8 ms                                    | harness: `Pane` own time per draw                                       |
| `eventHook`    | each `turn.step`, `tool.call` and `turn.complete` under 5 ms | harness: own time per call while the session streams                    |
| `firstDraw`    | session start to the pane's first draw under 300 ms          | live: `session.start: raised` to the first `Pane` draw in the debug log |
| `statusline`   | one status line run under 50 ms on Windows                   | `tools/bench/statusline.ts`: process start to its last byte             |
| `idleCpu`      | idle CPU under 0.5% of a core over ghostframe off            | live: 30 s with nothing typed or streaming                              |
| `memoryGrowth` | under 20 MB more growth than off, minute 1 to 10             | live, `--memory`: working set every 30 s                                |
| `session`      | the whole session within 1.2× of ghostframe off              | live: CPU of the scripted session, and a streamed turn's wall time      |

Own time is a hook's code alone: the time it waits on `next(e)` or on any `$` call is not its own. It does include
copying: every value a hook reads through `$.state` is copied into ghostframe's worker, and every value it writes is
copied out, whole. So a list ghostframe alone writes is held in the module as last written and never read back
(`hooks/shared/held.ts`), and a hook that is not drawing reads it from there; a draw reads `$.state`, which is what
draws it again when the value changes. `tests/plugin/hook-cost.test.tsx` holds a tool call to the bytes it moves.

Own time also counts what each `$` call costs ghostframe's side of the round trip, about 0.07 ms on a desktop and
twice that on a runner, so a hook pays for the calls it makes one after another. Three rules follow:

- A reply row drawn again unchanged is one round trip (`hooks/shared/trace.ts`). Its draw notes a version of each
  value it read. A later draw of the same row reads those values again, all at once, and returns the tree it kept
  when every version stands. `tests/plugin/perf.test.tsx` holds it to that.
- Work an event's answer does not need runs after the hook returns. A turn's end keeps its history in the session
  at once, for the pane. It writes the history to the store once the session has been quiet for 2 s, and at once
  at the session's end, a rewind or a compaction (`hooks/cockpit/history/store.ts`). That write copies every kept
  turn out of the worker, so a quiet moment is where it costs no hook anything.
- Reads and writes that do not depend on each other go together, in one `Promise.all`.

The profiler counts no timer's wait (`$.clock.after`, `$.clock.every`) as a hook's time. A timer's dispatch stays
open until it is due, long after the hook that set it. The harness holds every timer, so the quiet store write never
runs in it: it costs about 3 ms at 50 kept turns, in a moment when no hook runs.

CI has budgets of its own, in the same file:

| Budget          | Limit                                                     | Why                                                           |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| `ciRequired`    | a pull request's required checks, push to green, 10 min   | short enough to wait for; the jobs run side by side           |
| `ciTests`       | each Tests job (Ubuntu, Windows, macOS) in 4 min          | the suite itself is 2 to 4 min on a shared runner             |
| `ciQualityGate` | the Quality gate in 3 min                                 | it no longer runs the plugin's tests, which the Tests jobs do |
| `ciPerformance` | the Performance check in 10 min, main's and the PR's runs | inside the required checks' 10, side by side with them        |

Every job's `timeout-minutes` is about twice its budget, so a hang fails in minutes. The live benchmark has no limit:
it runs on `main` only, nightly and on each push, never on a pull request.

## Run the benchmarks

```powershell
bun install --cwd tools/live --frozen-lockfile   # once: node-pty and the headless terminal the live run uses
bun tools/bench/run.ts                            # harness and status line, held to the budgets
bun tools/bench/run.ts --live                     # and the real session, on and off, 280 × 70 and 120 × 40
bun tools/bench/run.ts --live --memory            # and the ten-minute memory run (20 more minutes)
bun tools/bench/run.ts --strict                   # exit 1 when a budget breaks
```

The suite prints one table, a row per budget checked, and saves every number as JSON (the path is on its last line).
`tools/bench/` is its own TypeScript project, as `tools/live/` is, since it reuses that folder's node-pty: type-check it
with `tools/node_modules/.bin/tsrs -p tools/bench`. The parts run on their own too:

| Command                                                      | What it runs                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `bun tools/bench/root.ts tests/bench/session.bench.tsx`      | The harness benchmark alone: `BENCH {…}` lines, one per phase and config. |
| `bun tools/bench/root.ts tests/bench/probe.bench.tsx`        | The profiler's own tests.                                                 |
| `bun tools/bench/statusline.ts [repo …]`                     | The status line in its three forms, cold and warm.                        |
| `bun tools/bench/live.ts [--sizes 280x70,120x40] [--memory]` | The real session alone.                                                   |
| `bun tools/bench/live.ts --probe`                            | One session with the profiler: own time per hook in each scenario.        |
| `bun tools/bench/live.ts --memory-only`                      | The two ten-minute memory runs alone.                                     |
| `bun tools/bench/run.ts --harness-log <f> --live-log <f>`    | Judges saved output against the budgets, running nothing again.           |
| `bun tools/bench/fixtures.ts <folder> [small]`               | Builds a repo fixture.                                                    |

### Why the benchmarks live apart from the tests

`claude plugin test .` runs every `*.test.ts(x)` under the folder it is given, and refuses a hooks folder that is a
link. So the benchmarks are named `*.bench.tsx`, and `tools/bench/root.ts` copies the plugin (manifest, hooks, types,
`tests/support`, `tests/fixtures`, the profiler) into a temporary root with only the chosen files under its `tests/`.
The plugin's own suite never runs them.

### The harness benchmark

[`tests/bench/session.bench.tsx`](../../tests/bench/session.bench.tsx) replays the long-session fixture through the
engine's test harness, Cockpit on (pane docked) and off, at 280 × 70 and 120 × 40, with the profiler loaded above
ghostframe. Its phases:

- `start`: `session.start`, `/cockpit`, the pane's first mount.
- `stream`: all 50 turns: prompts, 650 blocks, 300 tool calls, 5 agents, the pane mounted.
- `first-draw`: every one of the 1,000 rows drawn once, mounted and unmounted one at a time.
- `redraw-unchanged`: every row again, unchanged.
- `frame`: a screenful of rows and the pane drawn again, 20 times.
- `pane`: the pane alone, 50 draws.
- `keystroke`: the band above the prompt and the prompt's hint, 100 draws.

Rows are mounted one at a time on purpose: with all 1,000 mounted, each `$.ui.invalidate` redraws every one of them at
once, which a real transcript (only what is on screen) never does.

### The live benchmark

[`tools/bench/live.ts`](../../tools/bench/live.ts) runs the real `claude` in a pseudo-terminal, once with ghostframe and
once without, resuming the long session (written as a transcript, so its 1,000 rows draw with no model call). Each run
gets a throwaway `CLAUDE_CONFIG_DIR`: no login, none of your plugins or settings, the same for on and off but for
ghostframe. A local stand-in for the Messages API ([`tools/bench/mockapi.ts`](../../tools/bench/mockapi.ts), set as
`ANTHROPIC_BASE_URL`) streams each turn's reply, so a turn costs nothing and streams the same every run. It needs no
account and sends nothing anywhere.

With ghostframe on, the run installs this checkout's plugin (manifest, hooks, types) from a throwaway local marketplace,
as a person's install is. It never loads it with `--plugin-dir`: the session watches a plugin folder to reload it, the
whole folder, `tools/node_modules` and `.git` included, and that alone cost 2.5 points of a core while idle (3.07%
against 1.15 to 1.25% installed and 0.52 to 0.57% off).

Per run it times: start to the first prompt and to the pane; 30 s idle (CPU); 60 keys, each from the write to the
screen's answer; 20 page-ups and page-downs; one streamed turn. From the engine's debug log (`--debug-file`), which
records every dispatch, it counts each ghostframe hook's calls per second in each of those windows.

The steady-state runs use a small repo; the 40,000-file repo gets its own run, since what Git returns there changes
everything else.

## Profile with GHOSTFRAME_PERF=1

The profiler is a mod of its own, [`tools/perf/probe/`](../../tools/perf/probe/hooks/register.ts) (`ghostframe-perf`),
loaded only to profile. ghostframe's code is not changed for it, so a session without it pays nothing.

Why a separate mod: the engine compiles a hooks module under fixed rules (`on("<event>", hook)` is always called as
written, `$` is always spelled at the call site), so ghostframe cannot wrap its own hooks; and one `*` hook inside
ghostframe would route every event it does not hook today, keystrokes included, into its worker. Seated above ghostframe
in the `prepend` tier, the probe's one `*` hook reads the engine's `next.trace`, which gives ghostframe's link its own
wall time with its `next()` calls taken out, and takes out the `$` calls too: each is a dispatch the probe also sees,
with `next.origin` naming ghostframe.

`prependPlugins` is read from user settings, so profile in a config folder of its own rather than your everyday one:
set `CLAUDE_CONFIG_DIR` to an empty folder and put this in its `settings.json` (`bun tools/bench/live.ts --probe` does
exactly that, and saves each scenario's numbers):

```json
{
  "env": { "CLAUDE_CODE_PLUGIN_DIRS": "D:\\Projects\\ghostframe;D:\\Projects\\ghostframe\\tools\\perf\\probe", "GHOSTFRAME_PERF": "1" },
  "prependPlugins": ["ghostframe-perf@inline"]
}
```

Then, in the session:

| Command                        | Shows                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `/ghostframe perf`             | The ten slowest hooks by p95: calls, calls per second, p50, p95, max and total, in ms |
| `/ghostframe perf json`        | Every hook's numbers as JSON                                                          |
| `/ghostframe perf reset`       | Starts the count again                                                                |
| `/ghostframe perf save <file>` | Every hook's numbers as JSON, written to the file                                     |

A hook is its event, with the component, command or tool it is matched on (`ui.render Pane`, `tool.call Bash`). A
call that ran beside another dispatch has no own time the engine can tell apart, so it is counted and left out of the
times; the table's last line says how many. Each hook keeps its latest 4,096 times, so the probe's memory stays flat.

The probe itself costs: every event passes through its worker while it is loaded. Read its numbers for which hook is
slow and how often it runs, and measure the session's total cost without it (the live benchmark does).

## The fixtures

- [`tests/fixtures/long-session.ts`](../../tests/fixtures/long-session.ts): 50 turns, 1,000 transcript rows (50
  prompts, 650 blocks of prose, tables, code, figures and lists, 300 tool rows), 300 tool calls of six kinds and 5
  background agents. Generated, so every run is the same.
- [`tools/bench/fixtures.ts`](../../tools/bench/fixtures.ts): the repo, 40,000 untracked files in 200 folders and 20
  committed binaries of 8 MiB each, changed since; and the long session written as a Claude Code transcript.

## In CI

Time budgets get 3× on a shared runner (`CI_HEADROOM`): the plugin's own suite takes 51 s on the desktop the budgets
were set on and 104 to 144 s on GitHub's runners. Ratios, CPU share and memory are measured against the same runner's
ghostframe-off run, so they are not scaled.

- **Benchmarks** ([`benchmarks.yml`](../../.github/workflows/benchmarks.yml)): the whole suite, live session included,
  `bun tools/bench/run.ts --live` on `windows-2025`, on every push to `main` and nightly. It reports only (the job
  summary) and never blocks; the Performance comment links its latest run.
- **Performance** ([`performance.yml`](../../.github/workflows/performance.yml)): on every pull request, below.

## The Performance check

Every pull request gets a check named **Performance** and one comment, edited in place on each push, never a new one.

### How it compares

One job on one `ubuntu-24.04` runner checks out the pull request and, beside it, `main` at the pull request's base.
[`tools/bench/check.ts`](../../tools/bench/check.ts) runs the harness benchmark (Cockpit on, 280 × 70 and 120 × 40) and
the status line's installed form, three times for each side, in turns: main, PR; PR, main; main, PR, so a runner that
slows down part way slows both. Both sides are measured with the pull request's benchmark, fixtures and test support;
only the plugin's own code (`.claude-plugin`, `hooks`, `types`, `statusline`) comes from each side. Every budgeted
measure is then compared by its median over the three runs ([`tools/bench/compare.ts`](../../tools/bench/compare.ts)).
The rating rules and the limits are `main`'s: `check.ts` runs `main`'s `compare.ts`, which takes each limit from its
own `budgets.ts`, never from the report, so a pull request cannot loosen its own. A budget `main` does not know yet keeps
the pull request's limit. The benchmark itself is the pull request's, which is visible in its diff.
The live benchmark is not run on pull requests: its numbers come from `main` and never block.

### What each colour means

| Rating      | When                                                                                        | The check |
| ----------- | ------------------------------------------------------------------------------------------- | --------- |
| 🟢 green    | within its budget, and no more than 5% slower than `main`                                   | passes    |
| 🟡 yellow   | 5 to 15% slower than `main`, or within 10% of its budget, or measured on neither side       | passes    |
| 🔴 red      | over its budget, more than 15% slower than `main`, or measured on `main` but no longer here | fails     |
| 🟠 accepted | a red on a pull request a maintainer labelled `perf-accepted`                               | passes    |

A change smaller than 5% of the measure's budget (as set in `budgets.ts`, never CI's 3× limit) is never called slower,
whatever its percentage: a shared runner
jitters by tenths of a millisecond, and a 0.10 ms row that reads 0.12 ms is 20% slower and no regression at all. The
comment's table puts reds first and ends with a summary line, such as `2 red, 1 yellow, 14 green`.

### perf-accepted

A maintainer adds the `perf-accepted` label when a pull request is slower on purpose and the reason is worth it: a
feature that must do more work, or a measure that moved because the benchmark itself changed. Its reds then show as
accepted and the check passes. Only people with write access can label a pull request, so a contributor cannot pass
their own red. Keep it rare: every accepted red is a slowdown every user pays from then on, and the next pull request
is compared with the slower `main`. Say in the pull request why it is accepted.

### Fork safety

`performance.yml` runs the pull request's code with a read-only token and no secrets. It writes the comment to an
upload and stops. [`performance-comment.yml`](../../.github/workflows/performance-comment.yml) runs when it finishes
(`workflow_run`), from `main`'s code, never checking out the pull request: it takes the pull request's number from
GitHub (the open pull request whose head is the commit measured), checks the upload is a Performance comment, adds the
link to the latest live benchmark, and posts or edits the one comment with `GITHUB_TOKEN`. A `workflow_run` workflow
runs from the default branch only, so the comment job starts working once it is on `main`.

### Changes that skip the work

A pull request that changes only these files changes nothing the tests or benchmarks run, so the Tests jobs and the
Performance check see that ([`.github/actions/changes`](../../.github/actions/changes/action.yml)) and pass in seconds:

- any `*.md` file, anything under `docs/`, `LICENSE`, `.rumdl.toml`, `.diagram-design/`
- `.github/ISSUE_TEMPLATE/`, `.github/CODEOWNERS`
- pictures: `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.svg`, `*.ico`

They still run: a required check that does not run counts as missing and blocks the merge. A renamed file counts by
both its names. The Quality gate always does its whole work, since it lints the docs.

### Make it required

The ruleset is applied by a maintainer, not by CI. To make the check block merging, add it to the `main` ruleset's
required status checks ([`.github/rulesets/main.json`](../../.github/rulesets/main.json)) next to the others:

```json
{ "context": "Performance", "integration_id": 15368 }
```
