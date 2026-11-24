# tools/live/

The live checks, run headless: the real `claude --settings D:\Projects\cockpit-test-settings.json` in
`D:\Projects\cockpit-live`, inside a pseudo-terminal (node-pty on ConPTY) with `@xterm/headless` as its screen. Each
check script types the exact prompt, presses the exact keys, captures the screen and checks its structure: glyphs,
rows, the left and pane regions, and colours against spec section 2. It never checks Claude's wording.

A dev tool only. It has its own `package.json` and lockfile, so neither the plugin nor the `tools/` gate installs its
native dependency.

## Run

```powershell
cd tools/live
bun install --frozen-lockfile
bun run.ts            # every step (1 to 12)
bun run.ts 2 7        # the suites that hold steps 2 and 7
bun run.ts --keep-repo 9
```

Each suite rebuilds the throwaway repo (`repo.ts`: the same files as `D:\Projects\cockpit-live-setup.ps1`), starts a
fresh session at its size (200 × 50, or 100 × 40 for step 12), and ends it the way a person does (ctrl+c twice). A
killed session makes the next launch fall back to the classic renderer.

Every run writes `out/<run>/`: `report.md` and `report.json`, and per suite a folder of captures, each saved as a `.txt`
of the rows and an `.html` page that draws every cell in its colours, plus the engine's `debug.log` for that session.

Paths can be changed with `LIVE_CLAUDE`, `LIVE_SETTINGS`, `LIVE_REPO` and `LIVE_OUT` (the runs' folder, `tools/live/out`
by default). Set `LIVE_OUT` outside the worktree when running from one: `git worktree remove` deletes ignored files, so
runs saved inside it go with it.

## Files

- `session.ts`: the driver: `type`, `key`, `send`, `waitFor`, `waitSettled`, `capture`, `close`.
- `screen.ts`: a capture (every cell's character, foreground, background and bold) and its `.txt` and `.html`.
- `checks.ts`: helpers that read a capture: a cell or text at a place, the regions found from the divider, matching
  rows, the receipt, the pill, the selected row, a cell's colour against a section 2 token.
- `harness.ts`: a step's results, and the turn helpers (`turn`, `waitIdle`: the receipt drawn or a dialog up, and the
  screen still for 1.5 s).
- `steps.ts`: the checks, steps 1 to 12, grouped into suites that share a session.
- `run.ts`: the runner and its report.

`bun test` runs the helpers' own tests (`checks.spec.ts`: a `.test.ts` anywhere in the repo is the plugin's, and `claude plugin test` would load it); `bun run typecheck` type-checks the folder.
