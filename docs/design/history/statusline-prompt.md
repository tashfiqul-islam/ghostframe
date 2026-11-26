# ghostframe: build the new status line

> History: the brief for the status line phase, kept as written. Superseded by [statusline.md](../statusline.md), the spec as built.

You are working in the ghostframe repo (D:\Projects\ghostframe, GitHub tashfiqul-islam/ghostframe). ghostframe is a Claude Code plugin. Its chat UI, Cockpit, is merged on main. This phase replaces ghostframe's current status line with a new, final design. The design is decided; your job is to build it exactly, make it fast and robust, and prove it on screen.

Rules:

- Work in a new worktree on the branch `feat/statusline`, with one PR. Use conventional commits with the scope `statusline`.
- Don't merge. Don't push to main.
- Verify every Claude Code behaviour you rely on against the current docs (code.claude.com/docs, the status line page) and the engine's types. Don't rely on memory.
- Keep the harness output outside the worktree (LIVE_OUT=D:\Projects\ghostframe-captures).

## Reference material (read these first)

1. **The spec**: below, under "Design spec". It's the source of truth.
2. **The reference renderer**: `docs/design/statusline-preview.ts` (already in the repo, untracked; commit it on your branch). It's a working Bun script that draws the design with sample data at any width: `bun docs/design/statusline-preview.ts --width 160`. Its layout logic (column widths, tile split, note shortening, meter maths, the ghost) is the behaviour to match. Copy its logic, not its sample data or its CLI.
3. **The live script**: `docs/design/statusline-live.ts`. It's what the user runs every day, and it holds behaviour decided after the reference renderer was written. Where the two differ, the live script wins on behaviour and the reference renderer wins on layout. Decisions it adds:
   - **No slab by default.** Rows draw on the terminal background, with no left margin, so the ghost lines up with Claude Code's footer. `GF_SLAB=1` turns the #111117 slab and its 2-cell margin back on.
   - **Width cap.** W = min(COLUMNS − 4 − 2×padding, 210); `GF_MAXW` overrides 210. Very wide terminals keep the layout compact instead of stretching.
   - **Unknown values** (before the first API reply, or a field missing) show "—" in the number slot and an empty meter, never a fake 0%.
   - **No edits:** "+0 −0" shows as "no edits yet". The second row shows "session 28m" once the session is at least 1 minute old, when there's no cache age to show.
   - **Rate-limit cache.** The last known five_hour and seven_day figures are cached in `os.tmpdir()/ghostframe-statusline-limits.json`, so the 5-hour and week tiles fill at once on a new session instead of waiting for the first reply.
   - **Git:** branch and dirty state come from one `git status --porcelain=v1 --branch`.
   - **PR:** the PR replaces the changes column unless its review state is approved.
   - **Effort map:** low 1, medium 2, high 3, xhigh 4, max 5 blocks.
   - **Stdin on Windows:** async `Bun.stdin.text()` printed nothing under Git Bash. Read stdin with `require('fs').readFileSync(0, 'utf8')` and write with `process.stdout.write`.
   - **Compact fallback:** below 90 columns of W it draws one plain line.
   - **Debug:** `GF_DEBUG=1` logs to a temp file.
   - It renders in about 30 ms on the user's machine.
4. **The design board**: the Cockpit canvas, "Status line" page. I'll paste screenshots if you need them.

## What we already know (from the header and status line research, engine 2.1.331)

- **A plugin can't ship a status line.** `statusLine` is read only from user or managed settings. plugin.json has no statusLine field, and unknown keys are stripped.
- **What the user runs today:** a personal Bun script, `~/.claude/ghostframe-statusline.ts` (a copy is in the repo as `docs/design/statusline-live.ts`). Their settings are `"command": "bun ~/.claude/ghostframe-statusline.ts"`, `padding: 0`, `refreshInterval: 10`, with a backup at `~/.claude/settings.json.bak`. The older `~/.claude/statusline.sh` is no longer used. Your installer replaces the personal script's settings entry; it must not delete the personal script itself.
- **Schema:** `type: "command"`, `command`, `padding?`, `refreshInterval?` (seconds, at least 1) and `hideVimModeIndicator?`.
- **Stdin JSON:**
  - model.{id, display_name}; effort.level; thinking.enabled; fast_mode
  - workspace.{current_dir, project_dir, git_worktree, repo.{host, owner, name}}; worktree.{name, path, branch, …}
  - cost.{total_lines_added, total_lines_removed, total_duration_ms, …}
  - context_window.{used_percentage, …}
  - rate_limits.{five_hour, seven_day}.{used_percentage, resets_at}; rate_limits.spend_limit
  - prompt_cache (shape to be confirmed)
  - pr.{number, url, review_state, kind}
  - session_id, session_name, version, output_style.name, vim.mode, agent.name

  Branch and dirty state are not in the JSON (except for worktrees), so they come from git. Read every field defensively, because fields get added over time.

- **When it runs:** at start and resume, on each assistant message, after /compact, on permission-mode or vim changes, on the refreshInterval timer, and when a resets_at time passes. Runs are debounced at 300 ms, and a new run cancels the one in flight.
- **Width:** COLUMNS and LINES are passed in. Lines longer than `COLUMNS − 4 − 2×padding` are cut with "…". So the renderer's width is `W = COLUMNS − 4 − 2×padding`, and the design's "flush right" means flush to W, not to the terminal edge.
- **Windows:** the command runs through Git Bash, or PowerShell if Git Bash is missing.
- **The mod API alternative:** `$.session.usage()` gives a mod the same figures (context, rateLimits, cost), and a mod can draw in its own sites (AbovePrompt, BesidePrompt, SessionMode, PromptHint, a Placed row). `$.ui.status(text)` is plain text only, so it's no use here.

## Stage 0: audit, then report and wait

- **Delivery (decide this first).** Compare two routes and recommend one:
  - **A. A user-installed statusLine command.** It sits in exactly the right place. It needs an install step: a ghostframe command or script that writes the binary or script and the `statusLine` entry into the user's settings, shows them the change first, keeps a backup, and has an uninstall. It must never edit settings silently.
  - **B. Drawn by the mod** in one of its own sites, from `$.session.usage()`. It ships with the plugin and needs no install, but it sits in a different place.

  Check which sites can sit directly below the prompt, and whether any can be two rows tall. My default is A, unless B can reproduce the exact position.

- **Runtime.** Measure on Windows, through Git Bash, three options:
  - a bash script, which is the current setup;
  - `bun statusline.ts`;
  - a single executable from `bun build --compile`.

  The budget is under 60 ms per render, including git. My default is the compiled executable.

- **Tokens.** The colours and glyphs must come from one place (`hooks/shared/tokens.ts`). Generate or import them; never copy them by hand again.
- **Width.** In the harness, measure the column where the status line's first cell lands and the exact width available, with padding 0 and with padding 1. Report the numbers, and confirm the ghost lines up with Claude Code's footer row with no slab.
- **Fields.** Map each part of the design to the fields above, and confirm `prompt_cache`'s real shape and `pr.review_state`'s values from a live session.
- **Today's status line.** Find where ghostframe's old status line is implemented in the repo and how it's installed, and decide what replaces it. The user's personal script (above) is the behaviour to productise.

Report as a short table and a list of open questions. Stop and wait for my go-ahead.

## Stage 1: build

- **Renderer:** a pure function from (status JSON, width, options, now) to two rows of styled cells. Keep it separate from I/O and ANSI encoding, so it can be tested without a terminal. Match the reference renderer cell for cell at 200 and 100 columns, in both sample states.
- **Runtime:** keep whatever the current status line uses, unless it can't meet the budget. The budget is under 60 ms per render on Windows, measured, including git.
  - Run git at most once per render, with a short timeout.
  - Cache branch and dirty state for a few seconds in a temp file keyed by the repo path.
  - The script must never hang or print an error to the status line. On any failure it draws what it has.
- **Widths** (here "columns" means the renderer's width W, not COLUMNS):
  - 140 columns and up: the wide layout.
  - 90 to 139: the narrow layout.
  - Below 90: the one-line fallback, as the live script draws it.
  - W is capped at 210 (`GF_MAXW`).
  - Notes in the tile corners shorten step by step, exactly as the reference does.
- **Pace:** the share of the window that has elapsed, from resets_at and the window length (5 hours, 7 days). Show the pace block only when the window and reset time are known.
- **Cross-platform:** ghostframe runs wherever Claude Code does: Windows, macOS and Linux.
  - If you ship a compiled executable, build it for windows-x64, darwin-arm64, darwin-x64 and linux-x64 (`bun build --compile --target=…`). The installer picks the right one.
  - Handle POSIX and Windows paths, and git on both.
  - Run the renderer's unit tests on all three OSes in CI.
  - Development and live checks so far have been Windows only. Say plainly in the report which platforms you actually ran it on.
- **Icons:** the branch, PR and cache icons are Nerd Font glyphs. Add a ghostframe setting to turn them off (default: on), and make the layout identical with icons off: same column widths, no icon cells.
- **Colour:** 24-bit colour. If the terminal doesn't support it (COLORTERM not truecolor and no known terminal), fall back to the nearest 256-colour values. Don't remove colour entirely.
- **Settings and setup:** use refreshInterval 10 and padding 0, as the user has now, so the cache age stays current while idle. Resets also re-run on their own when a resets_at time passes.
  - In the docs, state the terminal setup the design assumes: line height 1.5 (Windows Terminal: Settings → profile → Appearance → "Line height" 1.5, stored as `font.cellHeight`; VS Code `terminal.integrated.lineHeight` 1.5), and a font with block elements and ▮. The user runs GeistMono Nerd Font 11.5.
- **The ghost slot.** Draw the ghost in one function behind a fixed 6-cell × 2-row slot. A new brand mark is being designed for this slot and will replace the obsidian ghost in a follow-up; swapping it must not touch the layout.
  - Don't change the user's terminal settings from code.

## Stage 2: tests

- **Unit tests on the renderer:**
  - every width from 90 to 300 in both states: exact row width W = min(COLUMNS − 4 − 2×padding, 210), no overflow, the last tile ends at the last column of W;
  - below 90: one line, no overflow;
  - each left column at the same position in every state;
  - the number in each tile starting on its meter's first cell;
  - meter fill and pace positions at 0, 1, 59, 60, 84, 85, 99 and 100%;
  - each threshold colour;
  - the ghost's eyes red at 85% and up;
  - icons off giving the same column positions;
  - missing fields keeping their slots empty, and unknown values showing "—";
  - "no edits yet" at +0 −0, and the session timer only from 1 minute;
  - the rate-limit cache filling the tiles on a fresh session, and ignoring a corrupt cache file.
- **Snapshot tests** of the plain-text rows at 260, 200, 160, 140, 120, 100 and 80.
- **Performance:** a test that renders 1,000 times and fails above the budget. Also run one real end-to-end timing on Windows (JSON in, ANSI out, git included) and report it.
- **Harness:** add status line checks to tools/live at 200 and 100.
  - The status line occupies exactly its two rows above the engine's footer row.
  - The last tile ends at the last cell Claude Code allows, and nothing is cut with "…".
  - No row wraps.
  - Under pressure, the tile warms and the alert text shows.

## Stage 3: on screen

- Take screenshots in Windows Terminal at line height 1.5, at 200 and 100 columns, in a real session. Force the under-pressure state with a test fixture if you need to.
- Put them next to the reference renderer's output in the same terminal, and list any difference you can see.
- Check the ▮ blocks, the half-block ghost and the tile backgrounds for gaps or seams in your font, and report what you saw.
- Compare against the user's live script at the same width; the only differences should be ones you listed and I approved.

## Stage 4: docs and report

- Add the design spec as docs/design/statusline.md. Use the spec below, the setup notes, and a screenshot.
- Update any README or docs section that shows the old status line.
- Report:
  - each Stage 0 decision as implemented;
  - test and harness results at both widths;
  - the measured render time;
  - the screenshots and capture paths;
  - anything you couldn't do.

  Open the PR and wait for CI. Don't merge.

## Design spec

LAYOUT

- Two rows on the terminal background, W wide (W is capped at 210). The optional slab (#111117, `GF_SLAB=1`) adds a 2-cell margin.
- Left to right:
  - the ghost (6 cells), then a gutter;
  - model (12), then gutter │ gutter;
  - repo (10), then gutter │ gutter;
  - changes (17), then a gutter;
  - then three equal tiles with 1-cell gaps. The last tile ends at the last cell of W.
- Gutters at 140 columns and up: 4 after the ghost, 3 on each side of each rule, 3 before the tiles.
- Tiles grow with the width up to 54 cells each. Past that, only the four gutters around the two rules grow, by up to 2 cells each, so the left side breathes. The gutters after the ghost and before the tiles stay fixed. The tiles then share whatever is left equally, so there's never dead space.
- Every column is sized for its longest state. Nothing moves between states.

LEFT COLUMNS (name on top, detail below)

- **Model:** name bold (#ECECF1). Below it, the effort meter: 5 ▮ blocks, lit in amber #FAB387 up to the level, unlit #2C2C37, then the level word in #7A7A86.
- **Repo:** name bold. Below it, the branch in teal #7EC8BE (icon #4E7A75), then an amber ● when there are uncommitted changes.
- **Changes:**
  - Normally: +added (#96D292) and −removed (#EC84A0). Below that, ⚡ "cache" and its age (#7A7A86).
  - When a PR needs you: "PR #n" bold with the PR icon in #EC84A0. Below that, its review state in #EC84A0.
- Hairline rules │ in #2A2A34 between the left columns.

TILES (context, 5-hour, week)

- A hairline edge ▏ on the left in the status colour: #2E5A55 calm, #E8B98A amber, #EC84A0 red.
- 2 cells of padding on each side.
- The number, bold, in a 4-cell slot with its %. It's #ECECF1 when calm and the status colour otherwise. The % is #6E6E7A when calm.
- The LABEL in uppercase, #7A7A86, or #EC84A0 at 85% and up.
- ↻ and the reset time right-aligned, in #6E6E7A.
- Surface: #17171F calm, #1E1A15 from 60%, #22161C from 85%.

METERS

- One ▮ per cell, lit in the status colour up to the reading.
- Status colours: teal #7EC8BE under 60%, amber #E8B98A for 60 to 84%, red #EC84A0 from 85%.
- Unlit blocks are #2A2A34, except at 25, 50 and 75%, which are #3A3A47.
- Pace: one #ECECF1 block where an even burn would be now (5-hour and week only).

STATES AND NOTES

- **Context at 85% and up:** the note is "compacts at 95%" in amber. It shortens to "at 95%".
- **A limit at 85% and up and ahead of pace:** the note is "ahead of pace ↻ 38m" in red. It shortens to "ahead ↻38m", then "↻ 38m", then "↻38m".
- **Labels:** CONTEXT, 5-HOUR and WEEK shorten to CTX, 5H and WK before any note is dropped.
- **The ghost (obsidian):** 6×4 pixels in half blocks (rows `.####.`, `#W##W#`, `######`, `#.##.#`). The body is shaded by pixel row, top to bottom: #A29DB0 (an ash rim), #4F4B59, #403D49, #35323D. The eyes glow amber #FAB387, and #D7263D when any budget is at 85% and up. The reference renderer's `GHOSTS.obsidian` is the source of truth.

NARROW (100 to 139 columns)

- The gutters drop to 2 cells, the rules go, and the effort word goes. (In the reference renderer, narrow means under 140 columns.)
- The changes column keeps one word.
- The labels are CTX, 5H and WK.
- The reset shows only when the budget is red.

TERMINAL

- Line height 1.5.
- A font with block elements and ▮.
- Icons need a Nerd Font; there's a setting to turn them off.
