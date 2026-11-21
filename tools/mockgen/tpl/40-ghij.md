## G. Edge cases

Cases 1 to 52 are v6's, each checked against the new structure; where the rule changed, the row says how. Cases 53 to 84 exist because of the pane.

| # | Case | Rule |
|---|---|---|
| 1 | Unbroken 200-character URL in prose | Prose shows `host/…/last-segment` and a mark. The Sources row prints the full URL, wrapped at the last `/`, `?` or `&` that fits, continuation rows marked `↩` in column 0. `/copy link n` gives it whole. In the pane a URL is cut with `…`; `c` copies it whole. |
| 2 | 64-character hash or a long token in prose | Never cut silently. A git hash shows its first 7 characters and `…`; anything else breaks at the measure with `↩`. In the pane, a hash as a result is always 7 characters. |
| 3 | Long POSIX path | Cut in the middle, keeping the first segment and the file name: `~/AppData/…/scratchpad/findings.md`. In the pane the same cut, harder: at 40 columns `hooks/…/register.tsx`, then the file name alone. |
| 4 | Windows path (`C:\Users\…`) | Same middle cut; backslashes are kept exactly; a path inside the home directory is shown from `~\`. Never rewritten to forward slashes, because it must paste back into PowerShell. `c` in the pane copies the full path. |
| 5 | A path as the whole content of a code block | Not cut: code rules apply (wrap with `↩`). |
| 6 | CJK text | Each wide character is 2 cells; wrapping and truncation count cells. A cut never splits a wide character: if 1 cell remains, it is left blank before `…`. The same function measures pane rows. |
| 7 | Emoji, including ZWJ sequences and skin tones | Measured per grapheme cluster. Any row containing a ZWJ sequence reserves the larger width and is never right-aligned against. In the pane such a subject is cut one cell early, so the result and clock columns cannot shift. |
| 8 | Right-to-left and bidirectional text | Drawn in logical order and left-anchored; the terminal reorders. Rows with RTL runs are cut only at the end and never share a row with right-aligned meta: in the pane, a step whose subject has an RTL run puts its result and clock on a second row. |
| 9 | Combining marks | Zero cells; they attach to the previous cell. |
| 10 | Tab characters in output | Expanded to the next multiple of 8 cells inside code and output frames and in the pane's detail view, to 1 space in prose and in step subjects. |
| 11 | Empty tool result | Result word `no output` (muted) in the pane and the unfolded view. |
| 12 | 10,000-line output | Never on the left. Pane detail view: the last 7 rows on failure, the first 7 otherwise, and `… n more lines · ctrl+o shows all`. Unfolded: first 20 and last 20 rows. |
| 13 | Binary output | One muted row: `binary · 212 kB · not shown`. |
| 14 | ANSI escape codes in tool output | Colour codes are mapped to the palette. Cursor movement, clears, OSC and bell sequences are stripped. A stripped sequence never shifts the grid of either half. |
| 15 | Carriage returns and progress bars in output | Only the final state of each line is kept. A step's subject is never updated from its output. |
| 16 | A table with 12 columns | Pivoted to records whenever columns × 8 + gaps exceeds the measure. Docked at 110 columns the measure is 65, so tables pivot earlier there than in fallback at the same terminal width. |
| 17 | A cell holding code, a link and a number | Code keeps its chip, the link becomes text plus a mark, the number stays; the column is text. |
| 18 | The number 0 | Printed as `0`. A count of 0 removes its field from a receipt, a capsule or a section label, except `0 errors` in a check's result, where zero is the news. |
| 19 | Negative numbers | `−` (U+2212), as wide as `+`, so signed columns align, including `+n −n` in `[ FILES ]`. |
| 20 | Large numbers | Counts: `999`, `1.2k`, `38.2k`, `1.2M`. Three significant digits at most. |
| 21 | `99.999%` | An answer's number is never rounded. The plugin's own percentages are integers, except below 1% and above 99%. |
| 22 | A 1-second turn | Receipt `─ done · turn 9 ─── 0.9s`. The pane's `[ LAST ]` says `done · no steps`, and `[ STEPS ]` keeps the previous turn's. |
| 23 | A 6-hour turn | Clock format switches to `1h 12m` after 59m 59s; the time edge is 7 cells, which holds `23h 59m`. Past 24h: `1d 02h`. Both halves switch at the same second. |
| 24 | 0 steps | No capsule, no steps field, `[ STEPS ]` unchanged (case 22). |
| 25 | 1 step | `1 step` (singular) in the receipt, the capsule and the section label. |
| 26 | 999 steps and more | `999 steps`, then `1.2k steps` on the left. The pane's label and `[ NOW ]` show the exact number: `step 1204`. The `… n earlier` row is exact too. |
| 27 | Several agent notices in the same second | Docked: nothing on the left; the roster rows change in the same pane update. Fallback: engine rows, one each, touching. |
| 28 | A resize mid-stream | The newest block re-wraps to the new width. Outside fullscreen, rows already in scrollback keep the width they were drawn at, which is why all right-aligned meta is the last thing on its row. |
| 29 | A resize while idle in fullscreen | The engine redraws; all rows are recomputed at the new width, in the style of the mode that width gives (E.47). |
| 30 | Very small window height (under 16 rows) | The pane follows the ladder of E.37 down to head and 3 step rows. Under 10 rows the status line script prints one row. Under 8 body rows the pane is head only. |
| 31 | Window narrower than 40 columns | Fallback. Capsules, receipts and frames keep working (cut with `…`); tables always pivot. Below 24 columns nothing is guaranteed. |
| 32 | Copying a code block with the mouse | The selection contains the code with a uniform 2-space indent; no borders, no numbers, no glyphs. Docked, see cases 76 to 78 for what a selection does at the divider. `/copy code n` avoids all of it. |
| 33 | Copying an answer | Lists copy as valid Markdown. Tables copy as space-aligned columns. Footnote marks copy as superscript digits. |
| 34 | Copying a capsule or a step row | Plain text with its glyph: `│ worked · 20 steps · …`. `/copy steps 7` gives a whole turn's log as text. |
| 35 | `NO_COLOR` | All colour is off in both halves. Bold, underline and inverse stay. Inline code regains its backticks; the prompt keeps `▍`; the focused pane row is inverse; diff rows keep `+` / `-`; state words stay bold; marks stay in the spine. |
| 36 | Colour-blind check | ok-green and err-pink converge. Every use of either has a second signal: `✓` / `✕`, `+` / `-`, `pass` / `fail`, bold on the failing word. In the pane the mark column alone tells the story. |
| 37 | A decision row and a prompt row both start with `▍` | A prompt is bright on `surface`; a decision is muted on the base and starts with a fixed verb (`allowed`, `always allow`, `denied`, `approved`, `rejected`, `edited`, `interrupted`, `no answer`) or carries `→`. In the pane `▍` only ever marks a step, so there is nothing to confuse it with. |
| 38 | A capsule or subject that is one unbroken token | Cut at the cell limit with `…`. |
| 39 | An answer made only of a code block | No lead sentence to light. In fallback the capsule still comes first: it is the first row of that block's tree. |
| 40 | A heading as the first row of an answer | The heading takes the place of the lead. |
| 41 | Nested lists deeper than 4 levels | Flattened to level 4. |
| 42 | A list with more than 99 items | Number column is sized for the count known at first draw. |
| 43 | A code fence that never closes | The frame's closing rule is drawn at settle with the meta `cut`. |
| 44 | A table that never completes | The placeholder is replaced by the rows that arrived, followed by a muted row `table cut`. |
| 45 | Two turns in the same minute | Both rules show the same clock; the turn number disambiguates, on the rule and on the receipt. |
| 46 | Clock crossing midnight during a turn | Turn clocks are elapsed time and unaffected. The next turn rule and the next `[ LAST ]` label show the date. |
| 47 | Prompt containing ANSI codes or control characters | Stripped before drawing; shown as typed in ctrl+o. |
| 48 | A file path with spaces | Drawn as is; wrapped in double quotes in permission prompts, event rows and step subjects. |
| 49 | Step subject that is a multi-line command | First line, then `…`. A heredoc shows its first line and the line count: `cat > patch.mjs <<'EOF' · 14 lines`. The detail view shows the whole command. |
| 50 | Ambiguous-width glyphs in a CJK-locale terminal | They may render 2 cells wide. When the terminal reports ambiguous-as-wide (probe 16) the plugin switches to the ASCII set of I.4 in both halves at once. |
| 51 | The engine draws a row wider than the frame | Accepted. Docked, engine rows run to the divider, not through it. |
| 52 | More than one frame of the same kind in a row | 1 blank row between them; their rules never merge. |
| 53 | The pane is 24 columns wide (you dragged it) | E.36's last row: kind, subject, mark. No result, no clock, no agent subject. Section labels keep their first meta field only. |
| 54 | The pane is 90 columns wide (45% of 200) | Rows stretch; the subject takes the extra cells. Nothing new is added: a wider pane is the same pane with fewer `…`. |
| 55 | You drag the divider while a turn runs | The engine asks for a new drawing at each width **(types)**; rows are recomputed, the layout (which sections, how many rows) is not, because the height did not change. |
| 56 | The pane is 5 rows tall | Head only (3 rows), then the `[ STEPS ]` label and the step in progress. |
| 57 | 1,000 steps in one turn | The fitted view is the same size as ever. The full view is a tree of about 1,300 rows; **probe 21** decides whether it is drawn whole or in pages of 200 with `… 800 earlier · p for the previous page`. |
| 58 | A burst: 40 reads start within one second | The pane updates at most 4 times in that second (H.2). The rows appear in order, several per update; the `… n earlier` row jumps instead of counting. |
| 59 | A step that never ends (a watcher, a server) | Its row stays `▸ … running` with a clock that ticks. `[ NOW ]` shows it. If the turn ends while it runs, its result becomes `left running` and it carries no mark. |
| 60 | Parallel tool calls | Each is a row, in start order. `[ NOW ]` shows the oldest and `+n`. Rows settle in whatever order the calls finish; they do not reorder. |
| 61 | Eight or more agents | Seven rows and `… n more`; the label has the full counts; `a` lists all. |
| 62 | An agent launches agents three levels deep | Two levels are drawn, inset; the third is `+n nested` on its parent. |
| 63 | An agent's name is 60 characters | Cut to the name column with `…`; the full name is in its conversation's title. |
| 64 | A to-do list of 40 items | The window of E.41: 3 rows (5 in a tall pane) around the current item; `t` shows all. |
| 65 | 200 files changed (a codemod, a formatter) | 3 rows and `… 197 more files · +a −b`. `f` shows all, in pages of 100. `/files` on the left prints the 11 largest and a count. |
| 66 | A file is changed, then changed back | It stays listed with `+0 −0` in muted: the turn touched it, and that is what the section records. |
| 67 | A binary or generated file changes | Listed with the tag `bin` and no counts. Enter says `binary · no diff`. |
| 68 | The same page is fetched twice | One `[ SOURCES ]` row; the status is the last one. |
| 69 | A fetch is redirected | The row shows the final host; the detail shows both. |
| 70 | 60 sources | 2 rows and `… 58 more` (3 and `… 57 more` in a tall pane); the label has both counts; `u` shows all. The answer's frame on the left lists every cited one, because that is answer content. |
| 71 | A pinned turn while a permission prompt arrives | `[ NOW ]` turns to `needs you` as always; the pin holds. The pinned `[ STEPS ]` does not contain the asking step, and it does not need to: the head names it. |
| 72 | `/steps 7` for the turn that is running | Same as releasing the pin. |
| 73 | `/steps 7` when the pane is closed, docked width | The command is a request from you, so the engine places the pane at any width **(types)**; it opens pinned. |
| 74 | The pane has the keyboard and a permission prompt arrives | The engine's dialog takes the keys; the pane's props say `isPromptCovered` **(types)** and its key row is drawn dim until the dialog closes. |
| 75 | You type a letter while the pane has the keyboard | It is a pane key, not text. This is why the hint line names the mode and Escape is always shown (E.18). Opening the pane never takes the keyboard on its own: Cockpit asks for focus only in answer to `/steps` in fallback, and the engine refuses it when the composer holds text **(types)**. |
| 76 | A mouse selection that starts on the left and is dragged across the divider | Fullscreen draws its own selection and reports it per region: a selection lies in a transcript row, the prompt or a pane **(types)**. Whether a drag is clipped at the divider is **probe 20**. If it is not, the copied text has pane text at the end of each row, and the escape hatches below apply. |
| 77 | A native terminal selection (shift+drag in Windows Terminal) | It is a line selection across the whole terminal row, so it picks up the pane. Use alt+shift+drag for a block selection confined to the left columns, or the commands below. |
| 78 | The escape hatches for copying, docked | `/copy` (the last answer, as Markdown), `/copy code n`, `/copy link n`, `/copy turn n` (prompt and answer), `/copy steps n` (the step log as text), `/copy diff <path>`; `c` on any focused pane row. All use the engine's clipboard path (`$.ui.copy` **(types)**), which is the same one `/copy` uses. `/cockpit off` removes the pane entirely when you want to select freely. |
| 79 | A selection inside the pane | It selects pane text only if case 76 clips; otherwise it runs to the right edge, which is the pane's own edge, so nothing foreign joins it. |
| 80 | The plugin is reloaded while the pane is open | The engine keeps the pane and the module finds it with `$.ui.panes()` **(types)**. The step log is in `$.state` and is still there. One notice: `ghostframe reloaded · pane kept`. |
| 81 | Another plugin opens a pane | The engine shows one pane and draws the rest as tabs, with titles **(types)**. Cockpit's title is `cockpit`. While its tab is not the one shown, Cockpit stays in docked style (the pane exists) and the left now-row gains the kind word again, so the step in progress is not invisible. |
| 82 | You are viewing an agent's conversation | The pane's props carry that agent's id **(types)**. `[ STEPS ]` shows that agent's steps and says so; `[ NOW ]` shows that agent's current step; the roster marks the agent in view with `▸`. |
| 83 | The session is driven from the desktop or mobile app as well | The pane hook is raised on every attached surface **(types)**. On a `widget` placement Cockpit draws only the head, two rows, because clicks may not reach a widget **(types)**. |
| 84 | Step logs outgrow the store | Oldest turns are dropped first, whole. `/steps n` for a dropped turn says so (E.45). The current session's logs in `$.state` are never dropped. |

A width check with wide characters (60 × 5):

<<g-width>>

---

## H. Motion and time

### H.1 Spinner

- **Frames:** `⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏`, one every 80 ms, in accent, in column 0 of the left now-row. It is the only animated cell on screen, in every mode. The pane has none: `▸` marks the step in progress and does not move.
- **Reduced motion** (`GHOSTFRAME_MOTION=off`, or the terminal's reduced-motion hint when available): the cell shows a static `⠿` and the elapsed times update once per second as usual.
- **No verbs.** The engine's rotating words are replaced: docked, by `working` or `writing`; in fallback, by the kind word of the current step.

### H.2 What the pane may change, and how often

The pane is not append-only. That is its point, and also its risk: a region that changes in the corner of your eye is a distraction. These are the limits.

| What | May change | At most | Never |
|---|---|---|---|
| Clocks (`[ NOW ]` step time, a running step's clock, running agents' times) | every second, on the second | 1 per second, all in the same update | sub-second ticks; a `0s` (hidden for the first second) |
| `[ NOW ]` row 2 (the step) | when a step starts | 4 per second | blanking between steps |
| `[ NOW ]` row 1 (the sentence) | when Claude says a new sentence | once per sentence | scrolling or typing-in the text |
| A step row | twice: it appears, it settles | — | changing after it settled |
| The step window | scrolls by whole rows when a step starts | 4 updates per second, any number of rows each | smooth scrolling; reordering |
| An agent row | its kind and subject, when its step changes | 1 per second per agent | changing position |
| A file row | its counts, when the file is edited again | 1 per second | changing position |
| A to-do row | its mark; the window when the current item moves | on the event | |
| A section's height | grows when it must | on the event | shrinking before the turn ends |
| A section's position | once, when a section above it appears for the first time | — | any other time during a turn |
| Section order | never | — | |
| Colour | with the state it reports | — | flashing, fading, a highlight for "new" |
| The whole layout | at `turn.start`, at `turn.complete`, on a resize, on a key | — | on a timer |

- **One update, one frame.** Every change that falls in the same 250 ms is drawn together. A step that ends and the next that starts are one update: the row settles and the next row appears in the same frame.
- **Nothing in the pane asks for attention except `needs you`.** A failure is a pink mark that stays where it is; it does not blink, and the pane does not scroll to it. The left half and the bell are what interrupt you.
- **At turn end** exactly two things happen in the pane, in one frame: `[ NOW ]` becomes `[ LAST ]`, and `[ SOURCES ]` sorts cited pages first. Everything else is already in its final state.

### H.3 What the head and the live area show, second by second

| Moment | Left now-row | `[ NOW ]` row 2 | Fallback now-row |
|---|---|---|---|
| request sent, nothing back yet | `⠋ working` | `waiting` | `⠋ waiting  for the first token` |
| thinking | `⠙ working` | `thinking` + its elapsed time | `⠙ thinking` + its elapsed time |
| the model is writing a tool call | `⠹ working` | `shell    preparing…` | `⠹ shell    preparing…` |
| a tool runs | `⠸ working` | `shell    <subject>` + step time | `⠸ shell    <subject>` + `step n · <step> · <turn>` |
| several tools run | `⠼ working` | the oldest, plus `+2` | the oldest, plus `+2` |
| the answer streams | `⠴ writing` | `writing  the answer` | `⠴ writing  the answer` |
| API retry | `⠦ working` | `waiting  API overloaded (529) · retry 3 of 10 in 8s` | the same, on the now-row |
| waiting on you | no row | `! needs you · …` and the step | `! needs you · …` (no spinner) |

The turn's elapsed time is on the left now-row's time edge in every row of this table, and nowhere else.

### H.4 How running becomes done

1. A step ends. In the pane its row settles and the next row appears, in one update. On the left nothing is appended, unless the step published something (`↗`), which is appended in that frame. In fallback, a failure appends its `✕` row.
2. Text starts. It streams as prose on the left, bright. `[ NOW ]` says `writing`.
3. A tool call follows the text. If the text was narration, **the fold**: in one frame the block leaves the transcript and its sentence becomes row 1 of `[ NOW ]`. The block's height can only shrink, it is the newest block, and nothing above it moves. If the text was a report, it stays, and in fallback it already carries its capsule as its first row.
4. The turn ends. In one frame: the left now-row disappears, any `still failing` rows and the receipt are appended, `[ NOW ]` becomes `[ LAST ]`.

No fades, no colour transitions, no progress bars. A meter exists only in the status line.

### H.5 Time formats

One function formats every duration in both halves.

| Range | Format | Example |
|---|---|---|
| under 1 s | one decimal | `0.4s` |
| 1 s to 59 s | whole seconds | `12s` |
| 1 min to 59 min 59 s | minutes and two-digit seconds | `4m 03s` |
| 1 h to 23 h 59 min | hours and two-digit minutes | `1h 12m` |
| 24 h and more | days and two-digit hours | `1d 02h` |

- **Which clock a row carries.** A step row, a capsule and an event row carry the *turn* clock at which the thing finished, so every right edge reads as one timeline and the two halves can be compared row against row. A step's *own* duration appears in three places only: `[ NOW ]` row 2 while it runs, the unfolded view, and the detail view.
- The concept sketch wrote step times as `0:04` and `2:31`. Cockpit does not: one format everywhere means `2m 31s` in the pane is the same string as `2m 31s` in a capsule.
- Sub-second precision is shown only for a step's own duration and for whole turns under 1 second.
- Wall-clock times are 24-hour `HH:MM`. A date is `Thu 19 Nov` and appears only when the day changed. "In" and "left" are spelled out: `in 1h 12m`, `4h 40m left`. No `~`, no `≈`, no `ago`.
- The longest duration string is 7 cells (`59m 59s`), which is the width of both time edges.

---

## I. Feasibility map

### I.1 Components

Risk is the chance that the design cannot be built as drawn: **low** (the types say so), **medium** (plausible, needs a probe), **high** (depends on an engine behaviour that is not documented).

| Component | Render site / source | Risk | Probe |
|---|---|---|---|
| Turn rule, prompt, steer | `UserMessage` | low | — |
| Receipt | `TurnDuration` + the plugin's step log | medium | 3 |
| `still failing` rows above the receipt | `TurnDuration`, a tree of several rows | medium | 3 |
| Narration leaving the transcript (the fold) | `AssistantMessage` drawing an empty tree once a tool call follows; `isSummary` blocks always | **high** | 1 |
| Capsule on a kept text block | `AssistantMessage`, first row of its tree | **high**: same dependency as the fold | 1 |
| Checkpoint capsule after 5 quiet minutes | `ToolUse` | low | 2 |
| Hidden passing step on the left | `ToolUse` / `ToolGroup` drawing nothing | medium | 2 |
| `↗`, denial and limit rows | `ToolUse` (`isErrored`, `output`); engine rows for limits | low / high | 2, 9 |
| Unfolded view | `ToolUse` with `isExpanded`; no `ToolGroup` in fullscreen ctrl+o **(types)** | low | — |
| Answer prose, headings, lists, code, tables, figures, links | `AssistantMessage` (own Markdown layout) | medium | — |
| Sources frame; marks shared with the pane | `AssistantMessage` final block + URLs from `tool.call` | medium | 1 |
| Permission dialog | none (engine) | — | 8 |
| Permission outcome rows | `ToolUse` + `tool.call` result | medium | 8 |
| Question card, answered row | `AskUserQuestion`, `ToolUse` | low | — |
| Plan frame and verdict | `ToolUse` for `ExitPlanMode` | medium | 8 |
| Mode indicator, pane-keyboard hint | `PromptHint`; the pane's `isFocused` | low | — |
| Left now-row, docked | `Spinner` (tree in place of the line) | low | 7, 23 |
| Live area, fallback | `Spinner`, `AbovePrompt` | low | 7 |
| Status line | status line script | low | 15 |
| **The pane, docked** | `Pane` via `$.ui.open({ id, columns })`; `placement`, `bodyColumns` **(types)** | low | 17 |
| The pane's fitted layout | `scroll.bodyRows` **(types)** | low; stale after a height-only change | 27 |
| `[ NOW ]` | `turn.start`, `turn.step`, `tool.call`, `Spinner` `mode` / `message` | low | 22 |
| `[ STEPS ]` rows and results | `tool.call`: the input, then the result after `next(e)` | low | 22 |
| `[ AGENTS ]` | `agent.spawn`, `agent.report`, `agentId` on `turn.step` and `tool.call` **(types)** | medium | 5 |
| `[ TODO ]`, `[ FILES ]`, `[ SOURCES ]` | `tool.call` on the tools concerned | low | — |
| Pane focus, Tab, arrows, close | engine: ctrl+x tab, Esc, ctrl+x x **(types)** | low | — |
| Pane keys (`s`, `p`, `n`, `c`, …) | `Button` with `hotkey`: one digit or lower-case letter **(types)** | low | — |
| Full view, diff view (scrolling) | a tree taller than `bodyRows`; engine scrolls; `$.ui.scroll` **(types)** | medium: size and follow behaviour | 21 |
| Opening an agent from the roster | `$.ui.view({ agentId })`, only in answer to a press **(types)**; `view` on the pane's props | low | — |
| Copy from the pane, `/copy …` | `$.ui.copy` **(types)** | low | — |
| Pin (`/steps n`) | `command.run`, `$.state` | low | — |
| Pin by clicking a receipt | a `Button` inside `TurnDuration` | medium | 25 |
| Step logs across a resume | `$.store` | medium: size limit | 24 |
| Inline inspector | `$.ui.open({ focus, closeOnEscape, rows })` from `command.run`; placed at any width when asked **(types)** | low | — |
| Docked ↔ fallback on resize | `placement` change re-runs the hook **(types)**; un-dock behaviour | medium | 18 |
| Fullscreen on ↔ off | `viewport.isFullscreen`, fixed per session **(types)** | **high** | 19 |
| Selection confined to one half | engine selection (`$.ui.selection` is per region **(types)**) | medium | 20 |

### I.2 What the types settled since v6

| v6 said | 2.1.329 types say | Effect on the design |
|---|---|---|
| "scrolling inside the pane, if possible" (the brief) | The pane's body is a window over the tree; the engine moves it with the person's keys and wheel; `scroll.offset` and `bodyRows` are on the props; `$.ui.scroll` moves it from code | Not a probe. The full view and diff view rely on it. |
| Pane docks "from 110 columns" | An unasked open is placed from 144 columns; from 110 once the person opened that pane themselves, until they close it by hand | The default threshold is 144. `/cockpit` lowers it to 110. |
| "no docked pane outside fullscreen" (the brief) | True, and more: outside fullscreen the pane is seated inline above the prompt at any width | The inline inspector (E.46) exists because of this. |
| Pane width is whatever the engine gives | `columns` may be requested: at most 45% of the terminal, at least 24; a width the person dragged wins | Cockpit asks for 72, 56 or 40. It must still draw at 24 to 90. |
| Copy needs OSC 52 (probe 12) | `$.ui.copy({ text })` writes "as `/copy` does" | Probe 12 is closed. |
| Pane keyboard was unspecified | ctrl+x tab focuses, Esc returns, ctrl+x x closes; Tab walks elements; a `Button` `hotkey` is one digit or lower-case letter and works only while the site has focus | E.44's key table is built on exactly this. No chord can be bound from the prompt, so the prompt side uses commands. |
| — | With one pane open the engine draws no title; the dock has a row of its own for the close mark | The first pane row in every mock is the engine's. |
| — | `isPromptCovered` is on the pane's props while a dialog or search has the keys | The pane knows a permission dialog is up without guessing. |
| — | `view.agentId` on the pane's props; `$.ui.view` switches the transcript to an agent | E.40's "open an agent". |
| — | The terminal's `isFullscreen` is "fixed per session" | Toggling `/tui` mid-session is probe 19, not a typed fact. |
| — | "A change of height alone re-draws nothing" for a site | The fitted layout can be stale after a height-only resize (probe 27). |

### I.3 Engine rows Cockpit cannot draw

| Engine row | Looks like | Plan |
|---|---|---|
| Agent finished | `◇ Agent "…" finished · 3m 52s` | **Probe 5.** Docked: draw nothing through `UserMessage` if raised (the roster has it). Otherwise leave: it starts with `◇` at column 0. |
| Message from an agent | `› Message from @general-purpose (ctrl+o to expand)` | **Probe 5.** Same. |
| Background agents launched | `● 7 background agents launched (↓ to manage)` and a tree | **Probe 5.** Docked: nothing, if it is the `Agent` call's own row. If not, leave. |
| Loaded rules | `└ Loaded C:\…\rules\typescript\hooks.md` × 5 | **Probe 4.** If the plugin may draw such a group, nothing on the left and one `read` step each in the pane. If not, leave: `└` sits in the content column. |
| Skills restored, files re-read after compaction | `└ Skills restored (…)`, `└ Read … (44 lines)` | Design around: they belong to the recap block. |
| Recap | `※ recap: …` | Design around (on the grid). |
| Compaction notices | `● Compacted while idle …` | Design around. Cockpit adds its own `●` row with the numbers. |
| Update banner | right of the prompt footer | Design around. |
| Expanded grey Bash blocks | `● Bash(cd …)` on a grey slab | Replace: `ToolUse` receives `isExpanded` in the ctrl+o view, so the plugin draws E.4 there. |
| Plugin hook failures | `● ghostframe: turn.start hook skipped: …` | Fix the bug. Development sessions only. |
| Permission, plan-approval, `/model`, `/config`, `/theme` dialogs | engine dialogs | **Probe 8, 13.** Theme colours only. |
| Prompt box, autocomplete, history search | engine | Theme colours and `PromptHint`. |
| `n new messages (ctrl+End) ↓` pill | engine, bottom of the transcript | Leave. It appears when you have scrolled back (F.35). |
| The dock's divider, close mark and tab row | engine | **Probe 17.** Reserved: Cockpit draws only the body. |
| The band's `[-]` mark and `n more` row | engine | Reserved: fallback band rows end 5 cells early. |

### I.4 Probes

Each probe is one small mod or one manual check, with the fallback if it fails. Probes 1 to 16 are v6's (12 is closed); 17 to 27 are new.

| # | Question | How to check | If it fails |
|---|---|---|---|
| 1 | Can a text block that has started to draw be redrawn as nothing when a tool call follows it? Fullscreen redraws every frame, which makes this more likely than it was for v6. | A `ui.render` hook on `AssistantMessage` that reads an atom; a `tool.call` hook that sets it; log whether the row redraws, in fullscreen and outside it. Log how often `isSummary` blocks arrive. | **Degraded:** only `isSummary` blocks leave the transcript. Other narration stays as short paragraphs in muted weight. `[ NOW ]` row 1 still shows the latest sentence. The left is then less quiet, and every other rule holds. |
| 2 | May a `ToolUse` / `ToolGroup` hook return an empty tree, with no row and no blank row left behind? | Return an empty `Box` for every non-errored call; count rows. | Draw each *run* of passing steps as one muted row at column 2, `3 shell · 1 read`. Docked that is noise, so the fallback is to accept the engine's one-line `ToolGroup` fold and restyle it muted. |
| 3 | Is `TurnDuration` raised for every turn? May its tree be several rows? | Log every raise. Return a 5-row tree. | No receipt where it is not raised: the next turn rule closes the turn, and `still failing` rows are drawn by the failing step's own `ToolUse` site at once, as in fallback. |
| 4 | Does the plugin's drawing of a non-`isCallsOnly` `ToolGroup` replace the "Loaded …" rows? | Draw such a group as empty and look. | Leave them. |
| 5 | Are agent notifications and messages raised as `UserMessage` on the terminal? Is the "agents launched" row a `ToolUse`? | Log `origin.kind`, `task`, `from` for every `UserMessage`; log every `ToolUse` whose `tool` is `Agent`. | Keep the engine's rows on the left. |
| 6 | What does the expanded view receive for thinking? | Log render events in ctrl+o on a turn with thinking. | Thinking time only. |
| 7 | May the `Spinner` tree be 2 rows? Is it drawn above or below the band? | Return 2 rows; screenshot. | One row. Docked needs only one anyway. |
| 8 | Is any site raised while a permission or plan dialog is open? Can `tool.call` tell "allowed once" from "always allow"? | Log all `ui.render` events while a dialog is open; inspect the `tool.call` result after each choice. | Dialogs keep the engine's look. Outcome rows shrink to `▍ denied …`; the pane step's result is `allowed`. |
| 9 | Do final API, rate-limit and cap errors reach any site? | Force a 529 with a proxy; log. | Engine rows stay; Cockpit adds the receipt state and `[ LAST ]`. |
| 10 | How do `!` commands arrive at `UserMessage`? | Run `! echo hi`; log. | The engine's rendering stays. |
| 11 | Can a hook read "update installed" or "MCP server disconnected"? | Search the types; try listing. | No notice rows for these. |
| 12 | ~~OSC 52 from inside the engine's output~~ | Closed: `$.ui.copy` **(types)**. | — |
| 13 | Which colours of the engine's lists and dialogs follow `$.theme.set`? | Set every theme colour to a distinct value; screenshot. | Document which stay. |
| 14 | Are `warn` and `accent` told apart at a glance? | Show F.36 to three people for two seconds. | Move `warn` to `#E5C07B`. |
| 15 | Does the engine inset the status line? | Print a ruler from the script. | Adjust the script's left padding. |
| 16 | Does the font carry every glyph in table D at 1 cell? | Print the test card below. | ASCII fallback (I.5) for the glyphs that fail. |
| 17 | What does the dock's frame cost? How many cells for the divider and padding, where is the close mark, is there a row above the body? | Open a pane that draws a ruler; screenshot at 144 and 200 columns. | Adjust `L = C − P − k`. Nothing else depends on the exact chrome. |
| 18 | What happens to a docked pane when the terminal narrows below its threshold: unplaced, or reseated inline? Does the hook run again? | Dock a pane, shrink the window through 144 and 110, log `placement` and `$.ui.panes()`. | If it is reseated inline: Cockpit closes it when it was not asked for. If the hook is not re-run: poll `$.ui.panes()` on a 1 s clock while a turn runs. |
| 19 | What does `/tui fullscreen` (and back) do mid-session: restart the surface, re-run `session.start`, keep `$.state`? Are earlier rows reprinted on the main screen? | Toggle it mid-session with a logging mod. | If state is lost: logs come back from `$.store` as after a resume. If rows are not reprinted: the mixed scrollback of E.47. |
| 20 | Is a mouse selection in fullscreen clipped to the region it started in? What does `$.ui.selection()` return for a drag across the divider? | Drag from the transcript into the pane; read the clipboard and the call's answer. | The escape hatches of G.78; the hint line shows `/copy` while a selection crosses the divider, if `$.ui.selection()` can tell. |
| 21 | Does the engine follow the end of a growing pane tree and hold position after a scroll? How does a 1,300-row tree perform? | Draw 1,300 rows, append one per second, scroll up. | The full view pages at 200 rows; `$.ui.scroll({ to: "end" })` after each append when the offset was at the end. |
| 22 | Does an atom write redraw only the pane, or the transcript too? Is there visible flicker at 4 updates per second plus a 1 s tick? | A pane that updates on a 250 ms clock beside a long transcript; record the screen. | Lower the cap to 2 per second; tick clocks every 2 seconds. |
| 23 | Does the `Spinner` hook know the pane's seat in time, so the docked now-row never shows the kind word for a frame? | Log the order of `Pane` and `Spinner` raises at `turn.start`. | The now-row starts as `working` in every mode and gains the kind word only once fallback is confirmed. |
| 24 | How much can `$.store` hold, per plugin and per key? | Write step logs of growing size until refused. | Keep receipts only (counts, no steps) across a resume; `/steps n` then works for the current session alone. |
| 25 | May a `TurnDuration` tree hold a `Button`, and does a click reach it in fullscreen? | Return a `Button`; click it. | No click-to-pin. `/steps n` and `p` / `n` remain. |
| 26 | Does an unasked open at `session.start` wait correctly below 144 columns and place itself when the window widens, or must it be opened again? | Start at 120 columns, widen to 160, log. | Open again on every width change (already the plan). |
| 27 | After a height-only change, how long until the pane is asked to draw again? | Shrink the window by 10 rows while idle; time the next raise. | While idle, a 2 s clock redraws the pane only if `bodyRows` differs from the last drawing. |

The test card for probe 16 (80 × 4). Every glyph must sit exactly under its ruler mark:

<<i-card>>

### I.5 ASCII fallback

Used per glyph when probe 16 fails for it, and as a whole with `GHOSTFRAME_ASCII=1`. One table for both halves.

| Glyph | Fallback | Glyph | Fallback |
|---|---|---|---|
| `▍` | `>` | `◇` | `o` |
| `│` | `\|` | `●` | `*` |
| `✕` | `x` | `∴` | `~` |
| `⊘` | `#` | `─` `┄` | `-` `.` |
| `✓` | `v` | `▰` `▱` | `#` `.` |
| `↗` | `^` | `▸` | `>` at column 0 of the pane, where `▍` cannot appear on the same row |
| `±` | `=` | `…` | `~` |
| `↺` | `<` | `↩` | `\` |

---

## J. Self-critique

Reviewed once more as a senior designer who has to live in this for a 3-hour session, with the pane open the whole time. The ten weakest spots, each with the fix that is now in the document.

| # | Weak spot | Fix made |
|---|---|---|
| 1 | **A quiet left half can hide a failure that mattered.** In the first draft every failure lived only in the pane, and a pane is easy not to look at. | Principle 12 and E.5: a failure or block that nothing fixed is restated on the left at turn end, as `still failing`, with its original clock. A fixed one is three words in the receipt. |
| 2 | **The pane jittered.** `[ STEPS ]` grew with every step and pushed the sections under it down, so the whole right half crawled. | E.37: lower sections are measured first and `[ STEPS ]` is a fixed window between them. Sections move once, when a new one appears, and never shrink mid-turn. H.2 states the limits as a table. |
| 3 | **Two spinners.** One on the left, one in `[ NOW ]`. Two things moving at 12 frames a second, two homes for one fact. | The pane has no animation at all. `▸` marks the step in progress. The left spinner is the only moving cell on screen. |
| 4 | **The fallback was a lesser product.** A single capsule per turn left a 51-minute turn with nothing in scrollback until the end. | Checkpoint capsules every five quiet minutes, drawn by a step's own site (E.3), and failures as rows the moment they happen. F.5 reads as a timeline again. |
| 5 | **The capsule could not be drawn where it belongs** (between the prompt and the answer) without editing history, since the counts are unknown until the work is done. | It is the first row of the tree of the text block that follows the work. At that moment the work before it is finished, so nothing is ever amended. |
| 6 | **Pinning could hide the present.** A pane pinned to turn 7 while turn 12 asks for permission would be a trap. | Only `[ STEPS ]`, `[ FILES ]` and `[ SOURCES ]` follow a pin. The head is always live, and each pinned label says `PINNED` or its turn. A new prompt releases the pin. |
| 7 | **A turn with no steps blanked the pane**, so after a one-line question the instrument was empty. | `[ STEPS ]` keeps the last turn that had steps and names it in its label (F.2, F.27). |
| 8 | **Sources were said twice**, once in the answer's frame and once in the pane, with different numbering. | One numbered list, two views (E.9, E.43): the frame holds cited pages with URLs; the pane holds every page read, and cited ones carry the answer's own marks. |
| 9 | **300 steps: the important ones scrolled away.** A failure at step 58 was gone from the window by step 70. | Open exceptions are pinned under the `… n earlier` row until something fixes them (E.39). Fixed ones leave. The top of the list is "what is still wrong". |
| 10 | **I designed against the brief's facts and three were not quite true.** No scrolling in the pane, a 110-column threshold, no pane outside fullscreen. | Re-read the types (I.2): scrolling is real, the unasked threshold is 144, and outside fullscreen the pane seats inline. The full view, the `/cockpit` rule and the inline inspector each come from one of those corrections. |

Weak spots that remain and are accepted:

- **Probe 1 still carries the signature.** If narration cannot leave the transcript, the left half is a conversation with muted interjections. The pane, the receipt and every other rule survive; the calm does not, fully.
- **A selection can cross the divider** until probe 20 says otherwise. Commands cover every copy that matters, and that is a workaround, not a fix.
- **At 110 to 143 columns the transcript is 67 wide.** Prose is fine; tables pivot early and wide figures are cut. `/cockpit off` is one command, and the default threshold of 144 means nobody lands here without asking.
- **The pane is stale after a height-only resize** until the next event (probe 27).
- **Two places show your answer to a question:** the row on the left and the `ask` step's result. Removing either makes that half incomplete on its own.
- **Engine rows still run to the edge of the region** while Cockpit stops at 120.
- **Permission and plan dialogs keep the engine's look** until a site reaches them.

### Migration note: what survives from v6

For the builder. "As is" means the v6 implementation can be reused without a design change.

| v6 | In v7 | Reuse |
|---|---|---|
| D.1 colour tokens, both contrast fixes | D.1 | as is |
| D.2 attributes | D.2 | as is |
| D.3 glyphs, kind words, state words | D.3 | as is, plus: `▸` may sit in the pane's spine; `│` now means the capsule on the left; three head-only kind words; two compound state words |
| C.1 left grid: spine, gutter, content, prose measure 88, frame 120 | C.1 | as is, with `L` in place of `C` when docked |
| C.2 rhythm matrix | C.2 | as is, with "rail row" read as "capsule or event row" |
| E.1 turn rule | E.1 | as is; the receipt adds `· turn n` |
| E.2 prompt, E.7 answer, E.8 code, E.10 figures, E.11 tables | same numbers | as is (the Markdown renderer, the table buffer, the wrap and cut functions) |
| E.9 links and the Sources frame | E.9 | as is, minus uncited rows |
| E.3 the rail, the silence rule | E.3 capsule | replaced. The summary-block detection (`isSummary`) and the fold are reused to decide what leaves the transcript; the silence rule's "a step's own site draws a row" trick is reused for checkpoint capsules |
| E.4 expanded view | E.4 unfolded view | as is; the same rows are also the pane's full view |
| E.5 exception rows | E.5 | row anatomy as is; when they draw changed |
| E.6 thinking | E.6 | the `Spinner` hook as is; the row moved to the pane |
| E.12 tool kinds: tool → kind, subject and result extraction | E.12 | as is. This is the largest reusable piece: every `[ STEPS ]` row is built from it |
| E.13 roster rows | E.40, E.13 | row format as is; `AbovePrompt` in fallback, `Pane` when docked |
| E.14 to-do frame and row | E.41, E.14 | row format as is; the automatic frame is removed |
| E.15 to E.17 permission, question, plan | same numbers | as is on the left |
| E.18 to E.29 mode, interrupt, steer, errors, compaction, resume, slash, bash, memory, hooks, notices, rewind | same numbers | as is, with the additions each section names |
| E.30 git events | E.30 | detection as is; `±` and `✓` rows removed from the left |
| E.31 files frame | E.42, E.31 | row format as is; the automatic frame is removed |
| E.32 footer | E.32 receipt | as is, minus the by-kind breakdown and tokens, plus `· turn n` and the exception story |
| E.33 live area | E.33 | as is in fallback; one row when docked |
| E.34 prompt input | E.34 | as is |
| E.35 status line | E.35 | layout as is; icons kept |
| E.36 the pane | E.36 to E.47 | replaced |
| G.1 to G.52 edge cases | G.1 to G.52 | as is, with the additions each row names |
| H.1 spinner, H.4 time formats | H.1, H.5 | as is |
| I.3 probes 1 to 16 | I.4 | as is; 12 closed; 1, 2, 3 restated for the new use |
| I.4 ASCII fallback | I.5 | as is |
| The mock format (text, paint, bg; fixed widths) | this document | as is |
| The generator | `chat-design-v7-gen/` beside this file | rewritten, same idea: every row is built from cells that carry text, token and background, and the build fails on a wrong width or an unknown glyph. `fitPane` in `lib.mjs` is the layout rule of E.37 as code, and can be ported as it stands |

### What was cut, and why

| Cut | Why |
|---|---|
| The rail (one transcript row per sentence Claude said while working) | It was the best answer to a single column. With a pane, narration has a better home (`[ NOW ]`, then the full view), and the left can be only the conversation. |
| The spinner in the pane (the concept's `◐`) | Two animated cells are two things asking for the eye. Also `◐` is not in the glyph table and `▸` already means "current". |
| The `0:04` clock format of the concept sketch | A second time format. `4s` and `2m 31s` are the same strings the left already uses. |
| The left-hand clock column in `[ STEPS ]` | Time belongs on the right edge of each half (principle 5). A clock on the left would also put a number, not a word, where the eye lands first. |
| A `CONTEXT / LIMITS` section in the pane | The status line has all three meters at every width. A second copy breaks "say it once" and costs three rows of an instrument that is short on rows. |
| A session summary when idle (cost, turns, totals) | The idle pane is for "what just happened". The summary is `/cost`. |
| The automatic `[ TODO ]` and `[ FILES ]` frames in the transcript | They were work written into the conversation. Both are live in the pane and one command away without it. |
| `±` commit and `✓` check rows on the left | A commit is local and the answer names it; a passing check is the expected end. Only what left the machine, or stayed broken, earns a row. |
| Launch and finish rows for agents | Seven launches and seven finishes are fourteen rows about work. The roster shows them live; the capsule counts them. |
| Uncited pages in the answer's Sources frame | They are a reading log, not something the answer stands on. |
| The by-kind breakdown and tokens in the receipt | The pane and the capsule have the kinds; the status line has context. |
| Beat rows (sentences) in the fitted `[ STEPS ]` | Text rows of ragged length break the list's columns and push steps out of a window that is already small. The latest sentence is in `[ NOW ]`; all of them are in the full view. |
| A "hold" option for pins | One rule (a prompt releases the pin) is easier to trust than two. |
| Opening the inline pane automatically in fallback | It would push the conversation up to show a list you did not ask for. |
| A new colour token for "pinned" or "focused" | Bright label text and the engine's own inverse are enough; a token used in one place is not a system. |
| Tabs or pages inside the pane | The engine already has tabs, for panes. Inside one pane, sections that collapse to their label do the same job with no mode to remember. |
| A progress bar for the to-do list | `4 of 7` is a number you can read; meters exist only in the status line. |
| A minimap or step tape of the turn | Cut in v6 for being colour-only; still true. The mark column is the tape, and each mark is a glyph. |
| Clicking a step on the left to reveal it in the pane | There are no steps on the left to click. |
| Everything v6 cut | Still cut: the label gutter, per-step rows on the left, side borders, line numbers, chip padding, icons in the transcript, syntax highlighting, spinner verbs, dollar cost, slabs behind figures and tables, dimming old turns, a centred or wider transcript. |
