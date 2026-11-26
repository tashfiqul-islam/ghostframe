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
- Windows so far: it has run on ConPTY only. node-pty also runs on macOS and Linux, untested here.

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

`tools/live/steps.ts` is the full list, with each check's name.
