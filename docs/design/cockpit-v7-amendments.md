# Cockpit v7: amendments

These override [cockpit-v7.md](cockpit-v7.md). The spec is kept byte for byte as generated (`bun tools/mockgen/gen/build.ts docs/design/cockpit-v7.md`, or `bun run --cwd tools mockgen`, reproduces it), so changes are recorded here and not edited into it. Where an amendment and the spec disagree, the amendment wins.

## Decisions (owner, 2026-11-21)

### 1. `[ STEPS ]` never lists agents one by one

A parallel launch is one step row: kind `agent`, subject `7 launched`. The roster lives only in `[ AGENTS ]`.

- Replaces: E.12 (the `agent` row of the kind table: subject "the agent's name", result `running` / `done` / `failed`), E.39, and the `[ STEPS ]` section of scenario F.34, which draws seven `agent` rows.
- The row settles once, when the launch call returns. Its result is the count that finished, for example `6 done · 1 failed`, written when the last agent of that launch reports. A failed agent is marked in `[ AGENTS ]`, not in `[ STEPS ]`.
- Several launches in one turn are one row each.

### 2. Every pane section is separated by exactly one blank row

This includes the head: one blank row between `[ NOW ]` / `[ LAST ]` and `[ STEPS ]`, at every pane height.

- Replaces: C.2 ("separated by 1 blank row when the pane has 24 body rows or more, and by none below that") and step 4 of the fitting rule in E.37, whose first move was to drop the blank rows.
- The ladder of E.37 now starts at "`[ SOURCES ]` to its label". A pane too short for the head, one blank row and three step rows shows the head alone.
- `fitPane` in `tools/mockgen/gen/lib.ts` still implements the old rule (`gap: R >= 24 ? 1 : 0`); it is the reference for everything else in E.37, not for this.

### 3. The receipt says `done`, not `done · turn N`

The turn rule already names the turn.

- Replaces: E.1 and E.32 ("the state word and `· turn n` from column 2"), and every receipt in section F.
- Consequence for E.45: the number for `/steps 7` is read from the turn rule `[ TURN 7 ]`, not from the receipt. `p` and `n` in the pane, and a click on a receipt (probe 25 passed), do not need the number at all.

### 4. Fullscreen must be on by default

Cockpit needs the fullscreen layout, and a terminal's layout is fixed for the life of a session (types: `isFullscreen` is "fixed per session").

- The setting is `"tui": "fullscreen"` in `~/.claude/settings.json`. It is already set on this machine (line 136). Nothing was changed.
- Two things turn fullscreen off regardless of that setting, both from the 2.1.329 types: the environment variable `CLAUDE_CODE_NO_FLICKER=0`, and running inside tmux, where the main screen is the default.
- Evidence: a probe session started with `"tui": "fullscreen"` reported `viewport.isFullscreen: true` and `presentation.isFullscreen: true`, and docked the pane. A session with the key absent was not tested, and the key is not described in the plugin types, so "absent means main screen" is unverified.
- Scenario F.40 (toggling fullscreen mid-session) and probe 19 stay unrun: `/tui` writes this setting.

### 5. `/cockpit` docks the pane below the 144-column threshold, down to 110

Confirmed by probe 26: an open the plugin makes on its own is refused below 144 columns; an open made in answer to a command is placed and docked at 120 and at 110; at 109 the engine reseats the pane inline.

- This is what E.24 and C.1 already say. It is recorded here because it is now a requirement and not only a typed fact.

### 6. A failed fetch or search is a source problem, not a turn failure

Owner, 2026-11-22, from the phase 6 screen check: a 404 made the turn `failed` and left `✕ still failing · fetch · httpbin.org/status/404 · 404` above the receipt.

- A `fetch` or `web` step that fails keeps its `✕` and its result in `[ STEPS ]`, and its status in `[ SOURCES ]` (err, bold). It adds no `still failing` row, and it never makes the receipt or `[ LAST ]` say `failed`, nor counts in their failures.
- `still failing` stays for tests, builds, commands, edits and agents: every other kind.
- Replaces: the parts of E.5 and E.32 that count any `✕` step as a failure of the turn.

### 7. The keys the focused pane gets, and the ones the engine keeps

From the phase 7 probe (see the feasibility report). E.44's own keys hold: a single lowercase letter or digit is a `hotkey` Button and fires only while the pane holds the keyboard, never from the prompt. The engine keeps every other key, and none of these reaches Cockpit as a key:

- Tab and Shift+Tab move the focus ring through the pane's Buttons (Cockpit hears `ui.focus`); the arrows, the page keys, Home and End scroll the pane (`ui.scroll`).
- Enter presses the Button under the ring: Cockpit's openable rows are Buttons, so Enter opens the row, but there is no Enter key to bind.
- Escape returns the keyboard to the prompt; Cockpit sees only that the pane is no longer focused. So Escape cannot close a view and leave the pane focused: an unfocused pane is always the fitted layout, and `b` is the way back that keeps the keyboard.
- ctrl+x tab focuses the pane and ctrl+x x closes it.
- Replaces: E.44's "Escape, or `s` again, returns to the fitted layout" (Escape also returns the keyboard), and E.44's step detail `r` key, which is not built: `c` copies a detail's command.

### 8. History keeps every turn to a budget, its bulky parts first to go

Owner, 2026-11-22 (phase 8). Replaces E.45's "the last 50 turns are also written to the plugin's store" and "Output and diffs are not kept".

- Every typed turn is kept, in the session's state and in `$.store` under `history:<session id>`: its steps (subjects cut at 200 characters), files, pages, agents and receipts (the summary rows), and its bulky parts, the steps' output excerpts and patches and each file's diff over the turn.
- The store holds 4 MiB of JSON in all, every session's history together (probe 24). Over the budget, the oldest turn that still has bulky parts loses them first, whichever session it belongs to; with none left, the oldest other session goes; only then this session's oldest summaries. A detail or diff that was trimmed says so.
- A 30-turn session of 20 steps a turn, with excerpts, patches and diffs, is about 1.5 MB, of which about 0.3 MB are summaries.
- A file's diff in `[ FILES ]` is its content at the turn's start (read just before the first call that could change it) against its content now, so a shell's changes are in it. A file no call named before it changed falls back to Git when Git saw it clean at the turn's start; otherwise the view says why it has no fuller diff.
- After a compaction nothing on screen changes: E.45's `· before the compaction` in `[ LAST ]` is not drawn.
- A pin is released by a typed prompt, `/steps` alone, `l`, or pinning the live turn; `p` at the oldest kept turn stays and says `no earlier turn kept`.
- After a resume (`claude --continue`), the transcript the engine draws again ends each answer with its receipt, as the live session did. History messages carry no turn id, so each kept receipt records the key of its turn's last answer block (its first 100 characters, spaces folded), and a resumed block finds its receipt, and its `claude` label, by that key. The engine draws the resumed transcript before `session.start`, so those rows take the left's mode only once the pane is placed. A resumed answer split over several messages gets the label on its last block.
- A click on a receipt pins its turn and says so in a toast (`pinned turn N · l in the pane or /steps for live`). On the live turn's receipt it pins nothing and says `turn N is the live turn · the pane follows it`. Clicks reach the plugin in the terminal: in fullscreen the engine turns on SGR mouse reporting.
- A click on any Cockpit row (a receipt, a step row, a key hint) only pins, opens a view or says something; it never submits, runs again or rewinds a prompt. Cockpit draws nothing clickable on a prompt row.

## Corrections from the probes (facts, 2026-11-21)

Observed in a real fullscreen session at 200 × 50, Claude Code 2.1.329. Each replaces a statement in the spec. Evidence is in [cockpit-v7-feasibility.md](cockpit-v7-feasibility.md).

| #   | The spec says                                                                                       | Observed                                                                                                                                                                | Effect                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | The dock's chrome is 2 cells: a divider and a pad (C.1, "probe 17")                                 | 1 cell: the divider. At 200 columns with a 72-column body the transcript region is 127 columns, not 126                                                                 | `L = C − P − 1`. Every docked mock is one column off on the left side                                                                                                                                  |
| B   | The engine grants a pane "at most 45% of the terminal" (C.1)                                        | The 45% includes the divider: body 66 at 150 columns, 63 at 144, 53 at 120. A 72-column body needs 163 columns or more                                                  | At 144 to 162 columns the pane is 63 to 71 wide, not 40 or 56, unless Cockpit asks for less                                                                                                            |
| C   | The permission dialog and the question card span the full width under both halves (F.9, F.12, F.36) | The dialog takes the place of the prompt in the left region only. The pane grows to the bottom of the screen while it is open: `bodyRows` went from 42 to 49            | The fitted layout must keep its rows where they are when `bodyRows` grows, and leave the new rows blank. The status line is hidden while a dialog is open, so `needs you` cannot rely on its mode cell |
| D   | In the ctrl+o view "the pane stays where it is" (E.4)                                               | The ctrl+o view takes the whole width; the pane is not drawn                                                                                                            | ctrl+o is the full-width record. Nothing else changes                                                                                                                                                  |
| E   | An answer streams token by token and the newest block grows (E.7, H.4, F.30)                        | While the model writes, the transcript shows only the spinner row. Each text block is raised once, complete. The final block of a turn is raised after `turn.complete`  | Scenario F.30's frames t1 to t4 do not occur. The table placeholder is not needed. Whether a block is narration or the answer is known at its first draw in the cases seen                             |
| F   | A tool step is a `ToolUse` row                                                                      | In the folded transcript every call, `Bash` included, arrives as a `ToolGroup`. `ToolUse` and `ToolResult` are raised only in the ctrl+o view, and for the `Agent` tool | The quiet left half is one hook on `ToolGroup`                                                                                                                                                         |
| G   | `TurnDuration` draws the receipt of every turn, interrupted ones included (E.19)                    | Not raised when a turn is interrupted or ends on a refusal at the dialog. The engine draws `⎿ Interrupted · What should Claude do instead?`                             | An interrupted turn has no receipt. `[ LAST ]` carries the state; the next turn rule closes the turn                                                                                                   |
| H   | "allowed once" and "always allow" give different outcome rows (E.15)                                | `tool.call` resolves to the same shape for both. A refusal is distinguishable (`isError`, and the text)                                                                 | One outcome for every allow: nothing on the left. `▍ denied` stays                                                                                                                                     |
| I   | `!` commands arrive at `UserMessage` (E.25, "probe 10")                                             | No site is raised for the input or the output of a `!` command. It also starts a turn                                                                                   | Bash mode keeps the engine's look                                                                                                                                                                      |
| J   | The height of a site "re-draws nothing" when it changes alone (E.37, "probe 27")                    | The pane was redrawn 0.6 s after a height-only resize, with the new `bodyRows`                                                                                          | No stale layout. The 2-second idle check is not needed                                                                                                                                                 |
| K   | Opening the pane again keeps its width                                                              | Each open sets the width anew. An open without `columns` took 89 of 200 columns; `columns: 40` stayed 40 after widening to 200                                          | Every open passes `columns`, and Cockpit opens again when the terminal's width changes                                                                                                                 |
| L   | The wheel scrolls the pane "while the pane is focused" (E.44)                                       | The wheel scrolls the pane under the pointer without focus, 2 rows per notch                                                                                            | Better than specified                                                                                                                                                                                  |
| M   | —                                                                                                   | A site named `AgentRow` is raised per background agent, with `description`, `status`, `tokenCount`, `cost`, `startTime`                                                 | A second source for `[ AGENTS ]`                                                                                                                                                                       |
