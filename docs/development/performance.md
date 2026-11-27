# Performance

ghostframe draws inside Claude Code's own frame, so every millisecond it spends is one Claude Code waits for. This page
holds the budgets it is held to, how to run the benchmarks that check them, and how to profile one hook.

- [The budgets](#the-budgets)
- [Run the benchmarks](#run-the-benchmarks)
- [Profile with GHOSTFRAME_PERF=1](#profile-with-ghostframe_perf1)
- [The fixtures](#the-fixtures)
- [In CI](#in-ci)

## The budgets

Every number lives in [`tools/bench/budgets.ts`](../../tools/bench/budgets.ts), each with the reason for it; change it
there and nowhere else.

| Budget         | Limit                                                | Measured by                                                             |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `keystroke`    | one key costs ghostframe under 2 ms of its own work  | harness: `AbovePrompt` + `PromptHint` own time per key                  |
| `unchangedRow` | a row drawn again unchanged in under 0.5 ms (cached) | harness: every row drawn a second time, same id, width and text         |
| `pane`         | the whole pane under 8 ms                            | harness: `Pane` own time per draw                                       |
| `eventHook`    | each `turn.step` and `tool.call` hook under 5 ms     | harness: own time per call while the session streams                    |
| `firstDraw`    | session start to the pane's first draw under 300 ms  | live: `session.start: raised` to the first `Pane` draw in the debug log |
| `statusline`   | one status line run under 50 ms on Windows           | `tools/bench/statusline.ts`: process start to its last byte             |
| `idleCpu`      | idle CPU under 0.5% of a core over ghostframe off    | live: 30 s with nothing typed or streaming                              |
| `memoryGrowth` | under 20 MB more growth than off, minute 1 to 10     | live, `--memory`: working set every 30 s                                |
| `session`      | the whole session within 1.2× of ghostframe off      | live: CPU of the scripted session, and a streamed turn's wall time      |

Own time is a hook's code alone: the time it waits on `next(e)` or on any `$` call is not its own.

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

The **Benchmarks (report only)** job in [`ci.yml`](../../.github/workflows/ci.yml) runs `bun tools/bench/run.ts --live`
on `windows-2025` and writes the table to the job summary. It does not fail the build yet (`continue-on-error`, no
`--strict`). Time budgets get 3× on a shared runner (`CI_HEADROOM`): the plugin's own suite takes 51 s on the desktop
the budgets were set on and 104 to 144 s on GitHub's runners. Ratios, CPU share and memory are measured against the
same runner's ghostframe-off run, so they are not scaled.
