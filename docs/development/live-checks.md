# The live checks

`tools/live/` drives the real `claude` in a pseudo-terminal (node-pty, with `@xterm/headless` as its screen), types
the prompts, presses the keys, captures the screen and checks its structure: glyphs, rows, the left and pane regions,
and colours against the spec's palette. It never checks Claude's wording.

The how-to is in [tools/live/README.md](../../tools/live/README.md). In short:

```powershell
cd tools/live
bun install --frozen-lockfile
bun run.ts            # every step
bun run.ts 2 7        # the suites that hold steps 2 and 7
```

## What it needs

- A signed-in Claude Code: each step sends real prompts and uses your plan's budget.
- A settings file and a throwaway project. The defaults are Windows paths; set `LIVE_CLAUDE`, `LIVE_SETTINGS`,
  `LIVE_REPO` and `LIVE_OUT` to change them.
- The project folder trusted once: start `claude` in it and choose **Yes, I trust this folder**. Until then Claude
  Code opens on its trust dialog, and the run stops there and says so; trusting a folder is your call, never the
  harness's.

## On macOS and Linux

The checks run on Windows (ConPTY) every time. On Linux (WSL, Ubuntu) node-pty installs and Claude Code starts in the
pseudo-terminal; what differs, and what to do:

| What                                   | On macOS and Linux                                                                                                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                                | Run it with Node 22.6 or later: `node --experimental-strip-types run.ts`. Under Bun, node-pty delivers no output on Linux, so Claude Code looks as if it exits at once. macOS is untested.                                 |
| Paths                                  | Set `LIVE_CLAUDE`, `LIVE_SETTINGS`, `LIVE_REPO` and `LIVE_OUT`; the defaults are Windows paths.                                                                                                                            |
| The settings file                      | `CLAUDE_CODE_PLUGIN_DIRS` must name the repository's path on that machine.                                                                                                                                                 |
| Git identity                           | None needed: the throwaway repo sets its own (`Live checks`, unsigned).                                                                                                                                                    |
| The repo's guard hook (steps 4 and 11) | It runs `pwsh`. Install PowerShell 7, or those steps see the hook fail instead of blocking `git push`.                                                                                                                     |
| Folder trust                           | Needed once per machine, as above.                                                                                                                                                                                         |
| Questions                              | The harness answers permission dialogs only. In WSL without `pwsh`, step 1\'s turn stopped on a question card Claude asked (the failing guard hook is the likely cause), so install `pwsh` before the prompt-driven steps. |

## What it writes

`$LIVE_OUT/<run>/report.md` and `report.json`, and per suite a folder of captures: each a `.txt` of the rows and an
`.html` page that draws every cell in its colours, plus the engine's debug log. Keep `LIVE_OUT` outside a worktree:
removing the worktree deletes ignored files.

## The steps

| Steps | What it runs                                                  | Columns  |
| ----- | ------------------------------------------------------------- | -------- |
| 1, 5  | Fix a failing test and commit                                 | 200, 100 |
| 2     | A failing test                                                | 200, 100 |
| 3     | A step you deny                                               | 200, 100 |
| 4, 11 | A step a hook blocks, and what Claude does instead            | 200, 100 |
| 6     | Sources: pages read and cited                                 | 200, 100 |
| 7     | Agents                                                        | 200, 100 |
| 8     | An interrupted turn                                           | 200, 100 |
| 9, 12 | A flood of failing commands                                   | 200; 100 |
| 10    | Rewind                                                        | 200, 100 |
| 13    | The status line, normal and under pressure                    | 200, 100 |
| 14    | The README's screenshots ([docs/assets](../assets/README.md)) | 200      |
| 15    | The README's demo ([docs/assets](../assets/README.md))        | 144      |

`tools/live/steps.ts` is the full list, with each check's name.
