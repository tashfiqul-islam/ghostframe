# Cockpit v8

The look and behaviour of Cockpit, ghostframe's chat UI for Claude Code: the conversation on the left, the work on the right. This document is the written form of the **Cockpit v8** design canvas (https://claude.ai/artifact/TmpUf8DEVeWyyAHrER5KA2): one design-system board and 33 screens, each with a note. The canvas shows what it looks like; this document says exactly what to build.

**Precedence.** v8 replaces the look of [cockpit-v7.md](cockpit-v7.md) and of [cockpit-v7-amendments.md](cockpit-v7-amendments.md) wherever they differ (section 11 lists each case). It keeps every v7 fact about the engine: the corrections A–M, the probes, the render sites, the store budget, the switching thresholds. Where this document and the canvas differ, this document wins and the difference is a bug in the canvas.

**References.** "Amendment 8" and "correction C" are in `cockpit-v7-amendments.md`. "v7 E.21" is section E.21 of `cockpit-v7.md`. "Screen 03" is board `S03Failed` on the canvas and section 12.3 here.

**Unchanged from v7.** The Cockpit switch (`GHOSTFRAME_COCKPIT=1`) stays off by default, and with it off every row draws exactly as on main. Drawn rows never change after their first draw, except where amendment 10 redraws a row in the mode the session switched to.

## Contents

1. Principles
2. Colour tokens
3. Type
4. Glyphs
5. Formats: time, durations, numbers, paths, state words, kinds, results
6. Grid
7. The left: components
8. The pane: components
9. Behaviour
10. What the engine owns
11. What v8 replaces in v7
12. The screens, 01–33
13. Real-session polish (Phase 12)

## 1. Principles

1. **Two colours carry meaning.** Amber is you and anything live. Cyan is data the machine reports. Green, red, warn and violet appear only on status glyphs, state words, results, diff lines and agent bars.
2. **One time format each.** Clock times are `HH:MM:SS` in cyan. Durations are `6s`, `2m 44s`, `1h 02m` in dim cyan. Section 5 has the full rules.
3. **Numbers are plain.** No zero-padding, no decimals. Counts read `23 steps · 3 files`. Results and counts stay lowercase.
4. **State words are capitals.** A word that names the state of a turn or a step is in capitals, bold, in its state colour, wherever it is a label: `DONE`, `FAILED`, `LIVE`, `NEEDS YOU`, `WAITING`, `BLOCKED`, `DENIED`, `INTERRUPTED`, `QUEUED`, `PLAN`. The detail after it stays in sentence case.
5. **Paths.** Folder dim, file name bright. Relative to the project. Cut from the middle with `…` so the file name survives.
6. **Surfaces, not lines.** Cards have half-cell top and bottom edges (`▄` `▀`) in the card's own colour. No boxes, no dotted rules. The only full lines are the turn header rule, the ruler and the tab underline.
7. **Every key hint is real.** Key in amber, action dim: `tab move`. Only keys that work in that view. Escape is never offered while an agent is in view.
8. **Nothing on the left that is not the conversation.** Plugin notices go to the debug log. Narration hides. A step that succeeded gets no row of its own on the left, with one exception: a wait you asked for (`✓ CI passed` before a merge). What stays: your messages, Claude's answers, failures that stayed failing, waits on you, anything that left the machine (`↗`), blocks (`⊘`), the receipt, and the engine rows that matter.
9. **Rows never move.** A row keeps its place once drawn. The pane re-sorts only at turn end. When the engine grows the pane under a dialog, the new rows stay blank.
10. **Never invent.** No fake detail, no empty sections, no receipt for a turn that has none, no keys the view does not have.

## 2. Colour tokens

Truecolor hex. Cockpit draws on the terminal's background; `bg` is the colour the canvas assumes for it.

| Token             | Hex       | Used for                                                           |
| ----------------- | --------- | ------------------------------------------------------------------ |
| `bg`              | `#0B0B0E` | base of both halves                                                |
| `surface`         | `#14141B` | your message card, the selected row                                |
| `code`            | `#0F0F14` | code, table and diff bodies                                        |
| `codeHead`        | `#16161D` | label strip of code cards and table headers                        |
| `pane`            | `#0D0E12` | pane background                                                    |
| `paneCard`        | `#13141A` | pane head card, detail drawer                                      |
| `hairline`        | `#1E1E26` | turn header rule, ruler ticks                                      |
| `spine`           | `#24242E` | the turn spine, tree guides                                        |
| `textBright`      | `#ECECF1` | your words, lead sentences, file names, hashes, PR numbers         |
| `text`            | `#B2B2BC` | answer prose, step subjects                                        |
| `muted`           | `#7C7C88` | labels, kind words, narration in ctrl+o                            |
| `dim`             | `#5E5E6A` | folders, meta, key actions                                         |
| `accent`          | `#FAB387` | you and live: your message glyph, the live turn, the spinner, keys |
| `machine`         | `#7EC8BE` | clock times, code language, NOTE, PLAN, slash commands             |
| `machineDim`      | `#4E7A75` | durations, results, counts                                         |
| `ok`              | `#96D292` | `✓`, DONE, passing results, added lines                            |
| `err`             | `#EC84A0` | `×`, FAILED, failing results, removed lines                        |
| `warn`            | `#E8B98A` | `!`, NEEDS YOU, WAITING, `⊘` BLOCKED                               |
| `agent`           | `#B4A0DE` | `◇` agents and their bars                                          |
| `link`            | `#8FB8DE` | URLs, YAML keys                                                    |
| `barDone`         | `#3F6E68` | gantt bars of finished work                                        |
| `wordmark`        | `#3A4846` | the pane's `ghostframe` wordmark                                   |
| `wordmarkVersion` | `#56706B` | the wordmark's version                                             |

Tints, drawn as cell backgrounds:

| Tint             | Hex       | Used for                                     |
| ---------------- | --------- | -------------------------------------------- |
| `addedLine`      | `#111B15` | a diff's `+` row, the full width of the card |
| `addedWord`      | `#1D3A28` | the changed words inside a `+` row           |
| `removedLine`    | `#1D1317` | a diff's `−` row, the full width of the card |
| `removedWord`    | `#3A1E27` | the changed words inside a `−` row           |
| `errCard`        | `#1A1216` | the failure card                             |
| `zebra`          | `#121218` | every second table row                       |
| `drawer`         | `#121219` | the pane's detail drawer and step output     |
| `selected`       | `#1E1E26` | the selected pane row                        |
| `dividerFocused` | `#2A2A34` | the divider while the pane has the keyboard  |

Trace steps, the braille trace's colour at each of its levels (0 is the lowest cell, 6 the highest; 6 is `machine`):

| Level | 0         | 1         | 2         | 3         | 4         | 5         | 6         |
| ----- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| Hex   | `#2E3A39` | `#3B524F` | `#496965` | `#56817C` | `#639992` | `#71B0A8` | `#7EC8BE` |

Pill backgrounds, one per state:

| Pill          | Background |
| ------------- | ---------- |
| `✓ DONE`      | `#132019`  |
| `● LIVE`      | `#2A1D15`  |
| `× FAILED`    | `#24141A`  |
| `! NEEDS YOU` | `#241C12`  |
| `◇ PLAN`      | `#10201E`  |
| `◇ AGENT`     | `#1C1726`  |

Use only the hexes in this section.

## 3. Type

Cockpit sets no font. The terminal uses the person's own monospace font for every cell, so Cockpit gets emphasis only from colour, bold and capitals. The canvas draws terminal cells in JetBrains Mono, 12 px on a 19 px row, ligatures off, and its own captions and notes in Hanken Grotesk. Neither font is part of the plugin.

Only bold is used for weight. No italic, no underline, except where the engine draws a link.

## 4. Glyphs

One meaning each. Nothing outside this table is drawn by Cockpit.

| Glyph        | Colour                           | Meaning                                                           |
| ------------ | -------------------------------- | ----------------------------------------------------------------- |
| `◆`          | accent (live) / spine (finished) | a turn starts                                                     |
| `✓`          | ok                               | DONE, or a passing step                                           |
| `×`          | err                              | FAILED, or a failing step                                         |
| `!`          | warn                             | NEEDS YOU, or WAITING                                             |
| `⊘`          | warn                             | BLOCKED by a hook, classifier, sandbox or policy; never a failure |
| `◇`          | agent / machine / dim            | an agent; PLAN (machine); folded work, the `worked` node (dim)    |
| `●`          | accent                           | the live group in the pane                                        |
| `●` (left)   | muted                            | a notice from outside the turn: memory, compaction                |
| `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` | accent                           | spinner on the live line (left only)                              |
| `∴`          | muted                            | thinking                                                          |
| `❯`          | accent                           | your message                                                      |
| `↳`          | muted                            | a message you added mid-turn                                      |
| `⋯`          | muted                            | a message queued for the next turn                                |
| `›`          | muted                            | a message to an agent; a bullet (cyan)                            |
| `▸`          | accent                           | the current to-do item, or a running sub-step                     |
| `○`          | dim                              | an open to-do item                                                |
| `↗`          | accent                           | pushed, published, opened or created somewhere else               |
| `/`          | machine                          | a slash command you ran                                           |
| `▲`          | machine                          | NOTE                                                              |
| `→`          | text                             | the next action, in a failure card                                |
| `◼`          | muted                            | INTERRUPTED, in the pane                                          |
| `┊`          | spine                            | earlier work folded; the live spine; the now-line                 |
| `├ └ │`      | spine                            | tree guides from the spine or a pane row                          |
| `━ ╸ ╺`      | bar colours                      | gantt bars, half-cell ends                                        |
| `┬ ─`        | hairline                         | the ruler                                                         |
| `▁▂▃▅▆▇█`    | machine                          | the sparkline                                                     |
| `⣀⣤⣶⣿…`      | machine, dim to bright           | a braille trace of a turn's activity                              |
| `▄ ▀ ▐ ▌`    | the card's colour                | soft card edges and pill ends (half cells)                        |
| `■`          | ok / err / dim                   | a file's change bar, 5 cells                                      |
| `↩`          | dim                              | a diff line wrapped under itself                                  |
| `▏`          | machine                          | a quote, at the start of each quoted line                         |
| `▍`          | err                              | DENIED: you refused a permission (13.8)                           |
| `¹²³⁴` / `·` | machine / dim                    | a cited source's number / an uncited source                       |
| `⎿ ※ ↺`      | the engine's                     | engine rows: interrupted, compacted, resumed                      |

`✕` (v7) is replaced by `×` everywhere. The rounded boxes (`╭ ╮ ╰ ╯`) and `✻` on the screens are the engine's dialogs and welcome header, not Cockpit's.

## 5. Formats

### 5.1 Time

- **Clock times** are `HH:MM:SS`, 24-hour, local, in `machine`. They label turn headers, added and queued messages, notices, slash commands and the ctrl+o sentences.
- **The day.** When the local calendar day differs from the previous typed prompt's, the turn header adds it after the label: `TURN 31 · RESUMED · Tue`. The pane head shows it before the start time: `Tue 09:02:10 → 09:03:16`. The clock itself never gets wider than 8 cells.
- **Ranges** in the pane head: `10:14:02 → 10:16:46`, or `10:14:02 → now` while live.
- **The ruler** labels its two ends with `HH:MM` (or `HH:MM:SS` when the turn is under two minutes) and `now` while live.

### 5.2 Durations

| Length         | Reads                                                 |
| -------------- | ----------------------------------------------------- |
| under 1 second | `<1s`                                                 |
| under 1 minute | `6s`, `41s`                                           |
| under 1 hour   | `2m 44s`, `1m 06s` (seconds two digits after minutes) |
| 1 hour or more | `1h 02m` (minutes two digits after hours)             |

Durations are `machineDim`. A live elapsed time in a label is `accent`, and `warn` on a WAITING or NEEDS YOU row. No decimals anywhere: this replaces amendment 11's tenths below ten seconds.

### 5.3 Numbers and counts

- Plain integers, no padding: `23 steps`, `3 files`, `2 of 14`, `+12 −1`.
- The minus is `−` (U+2212), not `-`.
- A count joins its noun: `1 step`, `2 steps`. `0 steps` is drawn only where nothing is the point (screen 17).
- In tab labels, `0` means none so far and `—` means not applicable (no to-do list yet).
- Large diffs read `+1.1k −191` only in the engine's status line. Cockpit writes the exact number.

### 5.4 Paths

- Relative to the project root: `.github/workflows/ci.yml`, never `D:\Projects\ghostframe\.github\…`.
- A path under the home folder and outside the project reads `~/…`: `~/.claude/settings.json`.
- The folder is `dim`, the file name is `textBright`. In the pane, a subject that does not fit is cut from the middle with `…`, keeping the file name: `docs.github.com/…/setup-bun`.
- `:line` and `:line:col` follow the file name in `dim`.
- Forward slashes on every platform.

### 5.5 State words

| Word          | Colour  | Where                                             |
| ------------- | ------- | ------------------------------------------------- |
| `DONE`        | ok      | receipt, pane pill                                |
| `FAILED`      | err     | receipt, pane pill                                |
| `LIVE`        | accent  | pane pill                                         |
| `NEEDS YOU`   | warn    | the left's waiting row, pane pill                 |
| `WAITING`     | warn    | rate limit, API retry, a receipt while agents run |
| `BLOCKED`     | warn    | `⊘` rows                                          |
| `DENIED`      | err     | you refused a permission                          |
| `INTERRUPTED` | muted   | the pane's line for an interrupted turn           |
| `QUEUED`      | muted   | at the right end of a queued card                 |
| `PLAN`        | machine | plan card label, closing node, pane pill          |
| `AGENT`       | agent   | pane pill while an agent is in view               |

Other capitals: `TURN`, `NOTE`, the code language (`YAML`, `TS`), `STEPS`, `ALL STEPS`, `PINNED` and the tab names. Everything else is sentence case. Step titles in the pane ("Waiting for CI") are sentences, not state words. The engine's own rows keep the engine's words.

### 5.6 Kinds

The kind word names the tool family, in `muted`, 6 cells, left-aligned:

`read` `edit` `write` `shell` `test` `fetch` `search` `agent` `todo` `browser` `mcp` `ask` `plan` `skill`

- `ask` is `AskUserQuestion`, `plan` the plan tools, `skill` the `Skill` tool: v7's words, kept.

- `test` is a shell command that runs tests (`bun test`, `vitest`, `pytest`, `go test`, `cargo test`).
- `mcp` steps read `mcp · <server> <tool>`, for example `mcp · linear create issue`, from the tool name `mcp__<server>__<tool>`.
- `browser` steps read `browser · <action>`.
- A parallel launch is one `agent` step: `agent  3 launched`, result `2 done · 1 failed` (amendment 1).

### 5.7 Results

A result is a short noun phrase of at most 14 cells, right-aligned, in `machineDim`, or `err` / `ok` where it says pass or fail.

| Step             | Result                                                           |
| ---------------- | ---------------------------------------------------------------- |
| read             | `96 lines`                                                       |
| edit, write      | `+1 −1`, `+12`                                                   |
| test             | `14 pass`, `2 of 14` (failing), `412 pass ×2`                    |
| shell            | the decisive output: `1.4.4`, `exit 1`, `9 outdated`, `38 files` |
| fetch            | the status: `200`, `404` (err, bold)                             |
| search           | `3 matches`                                                      |
| git push, commit | the short hash: `a1f3c2e` (textBright)                           |
| PR               | `#23`                                                            |
| mcp              | the created key or a count: `GHO-142`, `3 teams`                 |
| browser          | `1 image`, `200`, `wraps`                                        |
| agent launch     | `3 agents`, `2 done · 1 failed`                                  |
| running          | `running` (accent)                                               |
| waiting          | `needs you`, `until 14:05`, `in 8s` (warn)                       |
| blocked          | `blocked` (warn)                                                 |

Never a sentence, never a full command echo, never more than 14 cells.

## 6. Grid

Everything is laid out in character cells. The terminal is `C` columns wide; the pane body is `P`; the left region is `L = C − P − 1` (correction A: the dock's chrome is one divider cell).

### 6.1 The left

```text
| 2 margin | 10 label, right-aligned | 1 | spine | 2 | text column 86 |
```

- **Label column.** Ten cells, right-aligned. It holds a clock time (8 cells), a duration (at most 7), `from main`, or nothing. Words like `added` and `queued` never go there: they sit at the right end of their card.
- **Spine column.** One cell: `◆` on a turn header, `│` inside a turn, the turn's node glyph on event rows and the receipt, `┊` above the live line. The spine is continuous inside a turn and breaks between turns.
- **Text column.** 86 cells, from column 16 (counting from 0). Prose wraps at 86. Cards (your message, code, tables, notes, failures, plans) span the 86 cells, with a 2-cell inner pad. A card row with nothing held at its right end may run into the right pad (screen 01's note); a row with `added`, `QUEUED`, `c copy` or a count at its right end keeps it. A turn header's rule ends at column 101, the text column's last cell.
- **Narrow (no pane, under 110 columns, ctrl+o included):** the same margins, text column 78.
- **Wide:** the text column never grows past 86. Extra width is empty space on the right of the left region (screen 33).

### 6.2 The pane

```text
| select 1 | 1 | glyph 1 | 1 | title 25 | 2 | track 20 | result 20, right-aligned | 1 |
```

Counting from 0: select at 0, glyph at 2, title 4–28, track 31–50, result 51–70.

- 72 cells when the terminal is 163 columns or wider. At 144–162 columns the engine allows 63–71 (correction B: the 45% cap includes the divider). Below 72 the result area shrinks first, to 14, then the track, to 12.
- **Select column.** Blank, or a half-cell accent bar `▐` on `surface` for the selected row, whose whole width then takes `surface`.
- **Indented rows** (agents under a group, sub-steps) put the tree guide `├ ` / `└ ` / `│ ` in the title's first two cells.
- **Detail lines** start `└` under the glyph, with text under the title.
- **The ruler** sits exactly over the track: `┬────┬────┬────┬───┬`, 20 cells, labels above its two ends.
- **The divider** between the left and the pane is the engine's. It is `bg` when the pane does not have the keyboard and `dividerFocused` when it does.

### 6.3 Rows

One row is one terminal line. The canvas uses a 19 px row at 12 px type; nothing in Cockpit depends on pixel sizes.

## 7. The left: components

Examples are exact rows from the canvas, left region only, the 2-cell margin included.

### 7.1 Turn header

```text
    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────────────
```

- Label: the prompt's submit time (`machine`). Spine: `◆` (accent while the turn is live, `spine` once finished). Two spaces, `TURN` (muted) and the number (textBright, bold), two spaces, a `hairline` rule to column 101, the text column’s end.
- **Label states**, from amendment 12: `TURN 30 · AFTER COMPACT`, `TURN 31 · RESUMED` (the state word in `machine`, bold). The day follows the state: `TURN 31 · RESUMED · Tue`.
- An agent's conversation opens with `◇  AGENT Audit tests` (agent colour) in place of the turn header (screen 27).
- One blank row (`│`) follows.
- Drawn at `UserMessage` with origin `composer`. The number and time come from the prompt's stamp in `$.store` (amendment 12).

### 7.2 Your message

```text
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
```

- A `surface` card across the 86-cell text column, its content indented 2 cells. The top and bottom edges are half-block rows: `▄` and `▀` in `surface` on `bg`, so the card has soft half-cell edges. The canvas draws them as exact half cells.
- `❯` in accent, the text in `textBright`, wrapped inside the card.
- **Added mid-turn** (folded into the running turn, amendment 12): the label column has the clock it arrived at, the glyph is `↳` (muted), and `added` (muted) sits at the card's right end, 2 cells from its edge.
- **Queued** (waiting for the turn to end): the label has its clock, the glyph is `⋯`, `QUEUED` (muted, bold) sits at the right end. The row under the card reads `Sends when this turn ends · ctrl+enter send now` in dim. A queued message gets its turn number only when its turn starts.
- **To an agent:** `›` and the label `from main` (screen 27).

### 7.3 Thinking

```text
          6s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
```

- Label: the thinking duration. Glyph `∴` (muted), `thought` (muted), a 15-cell braille trace in the trace steps (section 2), the same fixed shape on every thought row since only the duration is known, `ctrl+o` (accent) `expand` (dim).
- The thinking text is never drawn, in ctrl+o too: only its duration is available.

### 7.4 The answer

- **Lead sentence** in `textBright`; the rest in `text`.
- **Headings:** `##` / `###` in `dim`, then the heading text in `textBright`, bold. No blank row is added around a heading: the list or paragraph under it starts on the next row (screens 01, 18).
- **Blank rows and line breaks** follow the answer: a blank row only where the answer has a blank line, and a paragraph's own line breaks are row breaks. Words wrap only within them.
- **Bullets:** `›` in `machine`, two spaces, then the item. A nested bullet's `›` sits 5 cells right of its parent's, under the parent's text (screen 18).
- **Numbered lists:** the numeral in `machine`, two spaces.
- **Task items:** `[x]` in ok, `[ ]` in dim.
- **Quotes:** `▏` in `machine` at the start of each line, the text in `text`.
- **Inline code and paths:** `textBright`, no background.
- **Footnote refs** `[1]` in `machine`. The footnote lines go at the end of the answer, two per row, the second at the row's 31st cell (screens 01, 23): `[1] bun.sh/blog/bun-v1.4.2`, the number in `machine` and the host-and-path in `link`.
- Heading and list markers stay visible but dim. Backticks and `**` are dropped; their text draws in `textBright` and bold. No boxes around prose. The text column is 86 (screen 18).
- Each text block arrives whole: the engine never streams (correction E). While Claude writes, only the live line shows.

### 7.5 Code card

```text
             │    YAML   .github/workflows/ci.yml                                   +1 −1     c copy
             │
             │     14  14    - uses: oven-sh/setup-bun@v2
             │     15      −   with: { bun-version: latest }
             │         15  +   with: { bun-version-file: mise.toml }
```

- **Head strip** (`codeHead`, half-block edges): the language in `machine`, bold capitals, then the path (folder dim, file textBright), then `+n −n` (ok / err), then `c` (accent) `copy` (dim) at the right.
- **Body** (`code`): two line-number gutters of 4 cells each (old, new) in `dim`, then `+` / `−` / space, then the line.
- Added rows are tinted the full width of the card, removed rows likewise; changed words get the word highlight.
- A code block that is not a diff has one gutter.
- The head strip is a Button: a click copies the block without the indent it was nested at. `c` is not bound on the left, since a left row cannot hold a hotkey without taking the key from the prompt; `/copy code n` copies by key (amendment 11).

### 7.6 Table

```text
             │    Runner                        Bun   Width tests
             │
             │    CI before                   1.4.1   × 2 of 14 fail
             │    CI after                    1.4.4   ✓ 14 pass
             │    Local                       1.4.4   ✓ 14 pass
```

- A header band (`codeHead`) in sentence case, bold, in `muted`. Zebra rows. Numbers right-aligned. A result column may lead with `✓` / `×` in their colours.
- The table spans the text column. The first column takes a third of the card or its content, whichever is wider (screen 01); the others are sized to their content, 3 cells apart.

### 7.7 Note

```text
             │    ▲ NOTE   The first CI run after this rebuilds the Bun cache, about a minute longer.
```

A one-row card: `▲ NOTE` in `machine`, bold, then one sentence in `text`. Used for an aside the person should not miss. No warn or red callouts.

### 7.8 Failure card

```text
             │  I couldn’t finish this. Two tests depend on a POSIX locale that Windows runners don’t set,
             │  so width("e\u0301") still splits the accent there.
             │
             │    × 2 still failing                                                   windows-latest
             │    × tests/width.test.tsx:41                                   expected 1, received 2
             │    × tests/width.test.tsx:58                                   expected 1, received 2
             │    → Next: set LANG=C.UTF-8 in ci.yml, or skip these two on Windows. Tell me which.
```

- An `errCard` card: a count row (`× n still failing`, err, bold) with the target at the right, then at most 3 failure rows. A failing test's row has its path, `:line`, and expected and received at the right, read from the test output kept in the step's detail; a failure with none of these shows the step's subject and result.
- One `→ Next:` line follows only when Claude's answer gives the next action. Nothing in the engine says it apart from the prose, so Cockpit never writes one of its own.
- Docked, this card is how a failure shows on the left; a `×` event row (7.10) draws only in fallback (13.1).
- More than 3 failures: the 3rd row is `+ n more · /steps n` (dim).
- The answer above it says the outcome first: `I couldn’t finish this.`
- Section 13.1 defines what counts as a failure.

### 7.9 Plan card

```text
             │    PLAN   4 steps                                             enter approve    e edit
             │    1  Add a windows-latest job that reuses the Bun pin from mise.toml
             │    2  Set LANG=C.UTF-8 for that job only
```

`PLAN` (machine, bold), the step count, the engine's approve keys at the right, numbered steps. Cyan because the plan is the machine's. The keys shown are the engine's own (v7 E.17); Cockpit invents none.

### 7.10 Event rows

One row each, on the spine, label = the duration into the turn at which it happened:

```text
     38m 10s ×  Batch 6 tests   3 of 412 fail
             │  └ hooks/ledger.test.tsx:88 · claim() returned the old turn
         41s !  NEEDS YOU   shell  rm -rf dist
      3m 31s !  WAITING   rate limited · resumes at 14:05 · or /model to switch
      1m 02s !  WAITING   API overloaded · retrying in 8s · attempt 2 of 10
         12s ⊘  BLOCKED   by a hook · PreToolUse · guard-main.sh · commits to main are not allowed
             │  └ Claude switched to a branch instead.
         12s ↗  committed   a1f3c2e fix(ci): read Bun from mise.toml
         15s ↗  pushed   fix/ci-bun-pin · 1 commit · origin
         19s ↗  opened   PR #23 fix(ci): read Bun from mise.toml
      4m 02s ✓  CI passed   3 checks · 3m 41s
      4m 06s ↗  merged   PR #23 into main · squash · 7c1e2a9
    16:20:44 ●  Memory saved · prefers squash merges
             !  Context 82% · compaction will run automatically at 95%
```

- Glyph and state word in the state colour. The detail is dim, with hashes, PR numbers, commands and file names in `textBright` and times in `machine`.
- A `└` detail line under the row says the one thing that explains it.
- A `×` event row such as `Batch 6 tests` draws in fallback only; docked, failures show in the failure card (7.8, 13.1).
- A `⊘ BLOCKED` row names the hook event and its reason. The engine never names the hook's script, so `guard-main.sh` shows only when the reason says it. Its `└` line draws only when what Claude did instead is already known as the row draws (13.7).
- `↗` rows draw the moment the call returns (v7 E.5).
- A WAITING countdown updates in place; the row does not move.
- Notices (`●`, the context `!`) are grey and one line. The memory notice carries its clock in the label.

### 7.11 The live line

```text
             ┊
     12m 40s ⠏  Auditing in parallel   ◇◇◇   46 steps
```

- The last row of a live turn. Label: the turn's elapsed time (accent). The spinner glyph (accent), Claude's current working sentence, `◇` per running agent (agent colour), the step count (dim). The spine above it becomes `┊`.
- Drawn at the `Spinner` site. While Claude writes text, this is all that shows (correction E).

### 7.12 The receipt

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · 2 sources · ↗ a1f3c2e
      3m 12s ×  FAILED   ⣀⣤⣶⣿⣷⣶⣿⣤⣀   12 steps · 2 still failing · 1 file
```

- Label: the turn's duration (the same value the pane head shows). The glyph, the state word (bold), a braille trace of the turn's activity (bucketed, in the trace steps), then the counts in dim, in the order the screens draw them: steps, fixed, still failing, files, blocked (screen 13), sources (`n sources, m cited` when not every one is cited), `n agents`, `n browser` and `n mcp`, then `↗` and the commit hash or PR.
- **Waiting** (background agents still running after the answer): `!` and `WAITING` in warn, the counts ending `n agents running`. The pane head's summary then reads `Waiting on n agents`.
- Narrow, the counts drop in v7 E.32's order (commit, sources, files, agents, steps). The state word never drops.
- Drawn at `TurnDuration`, anchored to the turn's answer row (amendment 8), or to its last call row when the turn wrote no text (amendment 10).
- No receipt for an interrupted turn (correction G).
- `no steps` when the turn made none.

### 7.13 The worked node

```text
      2m 44s ◇  worked   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷   23 steps · 3 agents · 1 fixed
```

The v8 name for v7's capsule. `◇` and `worked` in dim, a trace, the counts.

- **Fallback (no pane docked):** each finished turn gets one worked node above its answer (amendment 9's triggers).
- **Docked:** a turn that wrote no answer text gets one worked node, below its `↗` rows and directly above its receipt, so the receipt tree reads node, then receipt. The `↗` rows draw as their calls return (7.10), before the node exists (screen 16). A turn with any answer text gets none.
- Its counts are its own, not the receipt's: steps, agents and fixes (`23 steps · 3 agents · 1 fixed`); a turn with no agents and no fixes names its two largest step kinds instead (`7 steps · 6 shell · 1 edit`, screens 16, 31).

### 7.14 Engine rows

`⎿ Interrupted · What should Claude do instead?`, `※ Conversation compacted · …`, `↺ Resumed · claude --continue · Tue 24 Nov`, the welcome header and Bash mode keep the engine's look. Cockpit places them on the spine (`│`) and draws nothing over them.

### 7.15 Slash commands

```text
    16:31:20 /  /copy code 1
             ✓  Copied code block 1 · 3 lines · yaml
    16:31:34 /  /copy code 9
             ×  There is no code block 9 · the last answer has 1
```

- The command as a `/` node (machine) with its clock. Its output is one quiet row (`✓` / `×`).
- `/steps n all` prints at most 20 step rows (8.11's rows), so one command never floods the transcript. With more, it ends `… n more · /steps n all is in your scrollback`; the pane's every-step view shows the rest.
- `/copy` says `Copied code block 1 · 2 lines · ts`, `There is no code block 3 · the last answer has 2`, or `Not copied · <reason>`.
- A wrong number always says what exists.

## 8. The pane: components

### 8.1 Tabs

```text
  TIMELINE   FILES 3   SOURCES 2   TODO 5/5   AGENTS 3
  ━━━━━━━━   ───────   ─────────   ────────   ────────
```

- Five tabs, in this order, with counts: `FILES n`, `SOURCES n`, `TODO done/total` (`—` with no list), `AGENTS n`. The active tab is `textBright`, bold, with an accent `━` underline; the others are `dim` with a `hairline` `─` underline.
- **Keys:** `1` timeline, `2` files, `3` sources, `4` todo, `5` agents. They work only while the pane has the keyboard (amendment 7).

### 8.2 Head card

```text
   ✓ DONE   TURN 7                                10:14:02 → 10:16:46
  Width tests fixed; CI now reads Bun from mise.toml
  ▁▂▃▂▅▃▂▁▃▅▆▃▅▇█▆▇█▆▇▅▆▇▅▃▂▁▂▃▅▃▂▃▃▂▁▂▃▂▁
  23 steps    1 fixed    3 agents    3 files                     2m 44s
```

A `paneCard` card with half-block edges:

1. **Pill and range.** A pill (glyph and state word, bold, in its colour, on its pill background from section 2, with `▐` `▌` half-cell ends): `✓ DONE`, `● LIVE`, `× FAILED`, `! NEEDS YOU`, `◇ PLAN`, `◇ AGENT`. Then `TURN n` and the time range at the right.
2. **Summary.** One sentence, `textBright`: what the turn did, or what it is doing now.
3. **Sparkline.** The turn's activity, one cell per bucket, `machine`; failed buckets in `err`. It always shows the whole turn: steps are bucketed per column (screen 08).
4. **Stats.** Steps, then the counts that apply (`1 fixed`, `2 still failing`, `1 open`, `1 waiting`, `1 blocked`, `3 agents`, `3 files`), 4 cells apart, in `dim` with the numbers in `text`; the duration at the right.

- **Pinned** (screen 09): the live turn shrinks to one line on top, `● LIVE  TURN 8  running · 4 steps  2m 10s`, and the card below reads `PINNED  TURN 7`. The top line's pill is the live turn's state (`LIVE`, `DONE` or `FAILED`), on its own row above `PINNED`, so a pinned past turn never hides what the session is doing now.
- **Waiting on agents:** while background agents run after the turn's answer, the summary reads `Waiting on n agents`, as the left's waiting receipt does (7.12).
- **An interrupted turn** before the shown one: one line under the card, `TURN 11   ◼ INTERRUPTED after 3 steps · 2 files changed   11:02:05`, the clock its start. It draws once the next turn starts, from what the step log kept: the turn before ended aborted, or never ended before the next prompt. While the interrupted turn is the live one nothing draws, since Esc sends nothing a row could draw from.

### 8.3 The timeline

```text
                               10:14            now
                               ┬────┬────┬────┬───┬
  ┊ Earlier work               ━━━━━━━━━━━━━      ┊            31 steps
  × Reproducing the failure                ╺━╸    ┊             2 of 14
  └ width("e\u0301") · expected 1, received 2
  ✓ Comparing Bun versions                   ━━   ┊       1.4.1 · 1.4.4
 ● Auditing in parallel                       ╺━━╸            3 agents
  ├ ◇ Audit tests                               ━━╸              1m 10s
  │ ▸ shell bun test hooks/width --rerun                        running
  └ ◇ Audit dependencies                        ━╸               1m 02s
    × shell npm audit --omit dev                                 1 high
```

- **Rows are groups**, not single steps. A group is one of Claude's working sentences, with the steps under it collapsed into its bar and result. Its title is the sentence's first sentence without its closing stop, cut at the end to 25 cells (13.5); Cockpit never rewrites Claude's words, so the canvas's shorter titles ("Comparing Bun versions") are hand-written. Steps before Claude's first sentence form a group titled by the first step's kind and subject. The glyph is the group's outcome: `✓`, `×`, `◇` (it launched agents), `↗` (it pushed or published), `⊘`, `!`, or `●` on the live group.
- **The track** is the turn's time from left to right. A bar starts and ends at its group's first and last step (`━`, with `╺` / `╸` half-cell ends). Finished bars are `barDone`, a failed group's bar is `err`, the live group's is `accent`, agents' bars are `agent`, a push is `accent`, a wait is `warn`.
- **The now-line** `┊` (spine colour) runs down the track at the current time only while the turn is `LIVE`: not while it is NEEDS YOU (screen 04), and not for an agent in view, whose timeline is the agent's (screen 27). It fills the empty track cells at that time; a bar over that cell hides it.
- **Agents** sit under their launch group as `├ ◇ name` rows with their own bars (parallel bars). The running or last sub-step goes under each: `│ ▸ shell bun test …  running`. This replaces amendment 1 for the timeline only; the flat step list keeps one `agent  3 launched` row.
- **Detail lines** `└` under a failed group: the decisive line of output.
- **Folding.** When the groups do not fit, the oldest fold into one row from the top: `┊ Earlier work · batches 1–5 · 214 steps`. Never fold the live group or an open failure. A failure that was fixed keeps its `×` row and detail, followed by its passing rerun.
- **Selecting.** `tab` moves the selection; `enter` opens the selected group's drawer (8.4).
- **Order.** Start time. Nothing re-sorts until the turn ends.
- **Empty states:** `Steps, files, sources and agents appear here as Claude works.` and `No steps in this turn.` with one dim line saying what would appear.

### 8.4 Detail drawer

```text
 × Width tests on Windows             ╺━━━━                    2 of 14
      shell   bun test hooks/width                          exit 1
      × width("e\u0301")  expected 1, received 2
      × width("o\u0308")  expected 1, received 2
      c copy output   enter full output
```

Opens in place under the selected row, on `paneCard`: kind and command, the exit status at the right, the decisive lines (at most 3), then the keys. A waiting row's drawer says what it waits for and where to answer: `Answer in the dialog on the left.`

### 8.5 Files tab

```text
  3 files changed                                               +14  −1
  turn 7 · against the start of the turn
   .github/workflows/ci.yml                             +1   −1  ■■■■■
      @@ 14,3 @@                                            c copy
       14    - uses: oven-sh/setup-bun@v2
       15  -   with: { bun-version: latest }
       15  +   with: { bun-version-file: mise.toml }
    hooks/runtime.ts                                    +12       ■■■■■
  ◇ tests/width.test.tsx                                 +1       ■■■■■
  ◇ changed by an agent
```

- A summary card: the count, the total `+n −n`, the baseline line.
- One row per file: path (folder dim, file bright), `+n` `−n`, a 5-cell change bar: lit in proportion to the file's change against the turn's largest, split ok and err by its additions and removals, the rest dim. `◇` at column 0 marks a file an agent changed (amendment 13).
- The selected file's first hunk opens in place: the file row the focus ring is on (Tab, the arrows, a click) draws its first hunk under it, `@@` header and `c copy` first. Moving the ring off closes it; Enter opens the full diff (8.6).
- The diff is the file at turn start against now (amendment 8). Order is first-touched.
- **Keys:** `enter` diff, `c` copy path, `1` timeline.

### 8.6 The full diff

`enter` on a file: path, `+12 · 2 hunks`, the baseline line, then every hunk with its `@@` header in `machine`, two gutters (old, new), tinted rows. A line longer than the pane wraps under itself, marked `↩` in the gutter. Nothing is cut. Hunks in file order.

**Keys:** `b` back, `c` copy, `↑↓` scroll, `n` next file.

### 8.7 Sources tab

```text
  3 pages read   2 cited                                       1 failed
  cited pages first, in answer order
 ¹ bun.sh   Bun v1.4.2                                             200
      https://bun.sh/blog/bun-v1.4.2
  · docs.sigstore.dev   Cosign · keyless signing                    404
```

- The summary: pages read, cited, failed (err).
- Cited pages first, with the footnote number the answer uses (`¹`–`⁴` in `machine`). Uncited pages follow with `·`. Host in `machine`, title in `text`, status at the right: `200` dim, a failure in `err` bold.
- URLs dim under each row; `u` hides or shows them.
- The numbers in the answer and in Sources are the same numbers. Cited pages re-sort to answer order at turn end only.
- A failed page is a source problem, not a turn failure (amendment 6).
- **Keys:** `enter` copy URL (no API opens a browser, amendment 13), `u` hide URLs, `c` copy, `1` timeline.

### 8.8 Todo tab

```text
  2 of 5 done                                                    turn 7
  ━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓  Reproduce the width failure
  ▸  Find why CI runs Bun 1.4.1
  ○  Pin Bun in CI
```

A progress bar (ok for done, hairline for the rest), then the items in the order Claude wrote them, never re-sorted: `✓` done (dim text), `▸` current (accent, `textBright`), `○` open. From `TodoWrite` calls (`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`).

### 8.9 Agents tab

```text
  3 agents   2 running                                         1 failed
  launched together at 10:25:20
 ◇ Audit tests                                        9 steps   1m 10s
      ▸ shell bun test hooks/width --rerun                      running
  × Audit dependencies                             ×1  6 steps   1m 02s
      × shell npm audit --omit dev                              stopped
```

- One row per agent: `◇` (or `×` when it ended failing), the name, its open failures `×n` in err, its steps and duration. Under it, its current or last step with its state.
- An agent's failed edit or command shows only here and on its bar, never as a main-loop failure (amendment 13).
- **Keys:** `enter` opens the agent's conversation, `tab` moves, `1` timeline.

### 8.10 An agent in view

- The left becomes the agent's conversation: the `◇ AGENT name` header, its brief as a `›` card labelled `from main`, its steps and text on the spine. The prompt reads `Message Audit tests…`.
- The pane shows the `◇ AGENT` pill, `The conversation on the left is this agent’s.`, its stats and its own timeline.
- **Keys:** `m` back to main from anywhere in the pane, `tab` move, `enter` open step. Escape is never offered: at the prompt it can stop the agent (amendment 13).
- When the engine refuses the view (a finished agent it has dropped, or after a resume), the pane lists the kept steps with `conversation not held`.

### 8.11 Every step

`s` replaces the timeline with every step of the turn, no folding:

```text
  ALL STEPS · TURN 7                                23 steps · 1 failed
  ✓ read   tests/width.test.tsx                        96 lines     <1s
 × test   bun test hooks/width                         2 of 14      3s
```

One row per step: glyph, kind (6 cells), subject, result, the step's own duration. `enter` opens the step's output in place: exit, the decisive lines, the totals. Output excerpts are kept within the history budget (amendment 8); a trimmed one says so. **Keys:** `s` fit, `enter` output, `c` copy, `p` `n` turns.

### 8.12 Key hints and the wordmark

```text
  tab move    enter open    1–5 tabs                  ghostframe v0.1.0
```

The last row of the pane. Keys in accent, actions in dim, 4 cells apart. They show only while the pane has the keyboard. The wordmark `ghostframe` (`wordmark`) and the version (`wordmarkVersion`) sit at the right on every view, ending on the last cell but one; screen 24 alone draws none, and its test keeps the canvas's row. The version is read once at session start from `.claude-plugin/plugin.json`; it is `dev` when the manifest has none or cannot be read.

### 8.13 The inline inspector

Below 110 columns or outside fullscreen, `/steps` opens one card above the prompt, seated inline by the engine (amendment 9):

```text
   STEPS · TURN 8                                                             12 steps · 2 failed
   ✓ shell   bun --version                                                           1.4.4    <1s
   × test    bun test hooks/width                                                  2 of 14     3s
   ▸ shell   bun test hooks/width                                                 running     27s
   s all   c copy   p previous   n next   esc close
```

One card, never taller than the left can spare. It closes on `esc` or a typed prompt.

## 9. Behaviour

### 9.1 Modes

| Terminal                                 | Pane                 | The left                                                        |
| ---------------------------------------- | -------------------- | --------------------------------------------------------------- |
| 144 columns or more, fullscreen          | docked, unasked      | quiet (section 1.8)                                             |
| 110–143, after `/cockpit` or `/steps`    | docked, asked        | quiet                                                           |
| 110–143, unasked; under 110; main screen | not docked           | fallback: worked nodes, failure rows, the live tree (screen 31) |
| any, ctrl+o                              | hidden by the engine | the full record (screen 30)                                     |

Switching follows amendment 10: an unasked pane leaves at once below 144, and returns once the width has held for 150 ms. Every open passes `columns` (correction K).

### 9.2 Live

- The left shows the turn header, your message, any answer blocks as they arrive whole, event rows as they happen, and the live line at the bottom.
- The pane follows the live turn. The head says `● LIVE`, the now-line moves, and the live group's bar grows.
- Rows already drawn never change. A failure row stays `×` after a later fix; the fix shows as its own row in the pane and as `1 fixed` in the receipt.

### 9.3 Waits

- **NEEDS YOU** (permission, question): the left's last row is `! NEEDS YOU` with what it waits on. The engine draws the dialog or card in the left region (correction C). The pane's pill is `! NEEDS YOU` and the waiting group is selected with a one-line drawer.
- **WAITING** (rate limit, API retry): a pause, not a failure. The turn continues by itself. The pane stays `● LIVE` for a retry and shows `! NEEDS YOU` for a rate limit (you can `/model` to switch).

### 9.4 Pins

`/steps n` or `p` pins turn n. A pin is released by a typed prompt, `/steps` alone, `l`, or pinning the live turn (amendment 8). The live turn is never hidden. **Keys:** `l` live, `p` previous, `n` next, `s` all.

### 9.5 Keys

All single-letter and digit keys are hotkey Buttons that fire only while the pane has the keyboard (amendment 7). `tab` / `shift+tab` move the ring, `enter` presses the row, the arrows scroll. Escape returns the keyboard to the prompt.

| Key     | Where                           | Does                                              |
| ------- | ------------------------------- | ------------------------------------------------- |
| `1`–`5` | any tab                         | switch tab                                        |
| `enter` | a row                           | open its drawer, diff, URL copy, agent, or output |
| `c`     | a pane row                      | copy (a code card on the left copies on a click)  |
| `s`     | timeline                        | every step / fit                                  |
| `p` `n` | timeline, every step, inspector | previous / next turn                              |
| `l`     | pinned                          | back to live                                      |
| `b`     | full diff                       | back                                              |
| `u`     | sources                         | hide / show URLs                                  |
| `m`     | agent in view                   | back to main                                      |

## 10. What the engine owns

Cockpit designs around these and does not redraw them.

| Thing                            | What happens                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status line                      | Your own `statusline.sh` draws it, icons included. Cockpit does not change it. It hides while a dialog is open.                                                                |
| Permission dialog, question card | Drawn by the engine in the left region only (correction C). The pane grows to the bottom and its rows stay put.                                                                |
| ctrl+o                           | Full width; the engine hides the pane (correction D). Cockpit draws each sentence and step row (amendment 11). `ToolUse` and `ToolResult` are raised only here (correction F). |
| Interrupted turns                | No `TurnDuration` (correction G). The engine's `⎿ Interrupted` row stays; the next turn header closes the turn.                                                                |
| Streaming                        | There is none (correction E). Each text block is raised once, complete.                                                                                                        |
| Bash mode, welcome header        | Engine look, unchanged (correction I).                                                                                                                                         |
| Opening a URL                    | No API. `enter` copies the URL.                                                                                                                                                |
| The prompt and its hints         | The engine's. The canvas draws them to show placement only.                                                                                                                    |
| Fonts                            | The terminal's. Cockpit sets none.                                                                                                                                             |
| The divider                      | The engine's one cell (correction A).                                                                                                                                          |

**ctrl+o.** Cockpit draws its own turn header and message card for a prompt, not the engine's row. Under 110 columns it uses the narrow text column (6.1). A step row carries its result word and, for an edit, its diff card (7.5); there is no output frame, and a command's output stays in the step's detail in the pane.

## 11. What v8 replaces in v7

| v7                                                                                                       | v8                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Turn rule `─ [ TURN n ] ─── 09:23` (amendment 12)                                                        | Turn header `HH:MM:SS ◆  TURN n  ───` with the clock in the label column (7.1)             |
| Day `Sun 22 Nov · 09:02` in the rule (amendment 12)                                                      | `· Tue` after the label (5.1)                                                              |
| Receipt `─ done ───… 4 steps · 2m 44s` (amendment 3)                                                     | `2m 44s ✓  DONE   ⣀⣤⣶…   counts` on the spine (7.12)                                       |
| `✕`                                                                                                      | `×`                                                                                        |
| Lowercase state words                                                                                    | Capitals (5.5)                                                                             |
| Steer `steer · 14s` on the time edge (amendment 12)                                                      | `↳` card, clock in the label, `added` at the card's end (7.2)                              |
| Capsule (amendment 9)                                                                                    | The worked node (7.13)                                                                     |
| Pane sections `[ NOW ]` / `[ LAST ]` / `[ STEPS ]` / `[ FILES ]` … separated by blank rows (amendment 2) | Five tabs (8.1), a head card (8.2), the timeline (8.3)                                     |
| `[ STEPS ]` never lists agents (amendment 1)                                                             | Kept for every step list; the timeline shows agents as bars under their launch group (8.3) |
| ctrl+o durations in tenths below ten seconds (amendment 11)                                              | Whole seconds, `<1s` (5.2)                                                                 |
| `esc: prompt` hint                                                                                       | Never shown while an agent is in view (already amendment 13)                               |
| Tab and section keys from v7 E.44                                                                        | `1`–`5` tabs (8.1); the rest per 9.5                                                       |
| Plugin notices on the left                                                                               | The debug log only (`$.ui.log` with `{ to: 'debug' }`)                                     |

Everything not in this table keeps v7 and its amendments.

## 12. The screens, 01–33

Each screen: its canvas board, the caption, the note (always SHOWS · DATA · ENGINE · RULES · KEYS) and the exact rows, the left and the pane apart. Rows are copied from the boards, with half cells written as `▄ ▀ ▐ ▌`: a card’s soft top and bottom edges, pill ends, the selected row’s accent bar, the sparkline’s low cells. Trailing blank rows are dropped. The prompt and the status line are the engine’s and are left out.

### Turns and states

A turn’s whole life, from idle to every kind of wait.

#### 12.1 · Idle after a turn

Board `S01Idle` · a rich answer on the left · the finished turn as a timeline on the right

- **SHOWS** A finished turn: answer with heading, bullets, diff card, table, note, sources; receipt on the spine. Pane: DONE head card, sparkline, gantt timeline.
- **DATA** Turn header from the prompt row (UserMessage, composer). Receipt from TurnDuration, matched by the answer row id (amendment 8). Timeline groups = Claude’s working sentences; the steps under each come from tool.call.
- **RULES** Lead sentence bright. Finished bars dim teal; results dim cyan, failures red, the push amber. The pane re-sorts only at turn end.

The left (127 columns):

```text
    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          6s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  CI was on Bun 1.4.1, whose ICU splits a skin-tone modifier into its own grapheme.
             │  The tests and the code were right; the runner was old.
             │
             │  ## What changed
             │  ›  .github/workflows/ci.yml installs Bun from mise.toml, the pin you use locally
             │  ›  hooks/runtime.ts fails fast when Bun is older than the pin
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    YAML   .github/workflows/ci.yml                                   +1 −1     c copy
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │     14  14    - uses: oven-sh/setup-bun@v2
             │     15      −   with: { bun-version: latest }
             │         15  +   with: { bun-version-file: mise.toml }
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    Runner                        Bun   Width tests
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    CI before                   1.4.1   × 2 of 14 fail
             │    CI after                    1.4.4   ✓ 14 pass
             │    Local                       1.4.4   ✓ 14 pass
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ▲ NOTE   The first CI run after this rebuilds the Bun cache, about a minute longer.
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  [1] bun.sh/blog/bun-v1.4.2     [2] github.com/oven-sh/setup-bun
             │
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · 2 sources · ↗ a1f3c2e
```

The pane (72 columns):

```text
  TIMELINE   FILES 3   SOURCES 2   TODO 5/5   AGENTS 3
  ━━━━━━━━   ───────   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 7                                10:14:02 → 10:16:46
  Width tests fixed; CI now reads Bun from mise.toml
  ▁▂▃▂▄▅▃▂▁▃▅▆▄▃▅▇█▆▇█▆▇▅▄▆▇▅▃▂▁▂▃▄▅▄▃▂▃▄▃▂▁▂▃▂▁
  23 steps    1 fixed    3 agents    3 files                     2m 44s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               10:14          10:17
                               ┬────┬────┬────┬───┬
  × Reproducing the failure    ━━╸                              2 of 14
  └ width("e\u0301") · expected 1, received 2
  ✓ Comparing Bun versions       ━━                       1.4.1 · 1.4.4
  ◇ Audit tests                    ━━━━━━                         clean
  ◇ Audit CI setup                 ━━━━━╸                        no pin
  ◇ Audit dependencies             ━━━━━                         1 high
  ✓ Pinning Bun in ci.yml                ╺━━━                     +1 −1
  ✓ Failing fast on old Bun                 ╺━━╸                    +12
  ✓ Running the width tests                    ━━━              14 pass
  ↗ Pushing the fix                              ╺━             a1f3c2e














                                                      ghostframe v0.1.0
```

#### 12.2 · Live, three agents, pane focused

Board `S02Live` · the spinner row while Claude writes · an added message · agents as parallel bars

- **SHOWS** The answer so far, each block whole (the engine never streams it, correction E); a message added mid-turn (↳, its clock, ‘added’ at the card’s end); the spinner row on the spine. Pane focused: divider brighter, LIVE pill, now-line through the gantt, three agents as parallel bars, the running sub-step under each.
- **DATA** Spinner site for the live line; agent.spawn / agent.report / AgentRow for agents; ‘added’ = a queued prompt the engine folded into the turn (amendment 12).
- **ENGINE** While the model writes, only the spinner row shows; each text block arrives complete (correction E).
- **RULES** Amber only on live things. Key hints appear only while the pane has the keyboard.
- **KEYS** tab move · enter open · 1–5 tabs (1 timeline · 2 files · 3 sources · 4 todo · 5 agents). Tab keys work only while the pane has the keyboard (amendment 7).

The left (127 columns):

```text
          6s ✓  DONE   ⣀⣤⣶⣤⣀   2 steps · which bun does CI install?

    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          6s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  CI is on Bun 1.4.1 and you are on 1.4.4. I’m auditing tests, CI and dependencies in
             │  parallel before changing anything.
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
    10:26:31 │    ↳ also check whether the lockfile pins bun anywhere                          added
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  The lockfile has no Bun pin either; mise.toml is the only one, so CI should read from
             │  it. I’ll point setup-bun at it and add a guard so the two can’t drift again.
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             ┊
     12m 40s ⠏  Auditing in parallel   ◇◇◇   46 steps
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 3   TODO 2/5   AGENTS 3
  ━━━━━━━━   ───────   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ● LIVE ▌  TURN 7                                     10:14:02 → now
  Waiting on three auditors
  ▁▂▃▂▄▅▃▂▁▃▅▆▄▃▅▇█▆▇█▆▇█
  46 steps    1 open    3 agents                                12m 40s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               10:14            now
                               ┬────┬────┬────┬───┬
  ┊ Earlier work               ━━━━━━━━━━━━━      ┊            31 steps
  × Reproducing the failure                ╺━╸    ┊             2 of 14
  └ width("e\u0301") · expected 1, received 2
  ✓ Comparing Bun versions                   ━━   ┊       1.4.1 · 1.4.4
  ✓ Reading the CI workflow                   ╺━  ┊             2 steps
▐ ● Auditing in parallel                       ╺━━╸            3 agents
  ├ ◇ Audit tests                               ━━╸              1m 10s
  │ ▸ shell bun test hooks/width --rerun                        running
  ├ ◇ Audit CI setup                            ━━╸                 58s
  │ ▸ fetch docs.github.com/…/setup-bun                         running
  └ ◇ Audit dependencies                        ━╸               1m 02s
    × shell npm audit --omit dev                                 1 high












  tab move    enter open    1–5 tabs                  ghostframe v0.1.0
```

#### 12.3 · A failed turn, step opened

Board `S03Failed` · cause, evidence, one next step · the failing step opens in place

- **SHOWS** ‘I couldn’t finish this’ + a red card: count, each failing test (path dim, file bright, :line), expected/received, then the ‘→ Next’ line Claude’s answer gave. Receipt × FAILED. Pane: FAILED pill, red sparkline cells, the selected failed step opens a drawer (command, exit, failing cases, keys).
- **DATA** tool.call results: isError, exit code and output, keyed by program + subcommand + target.
- **RULES** Failures are keyed by program + subcommand + target; ‘fixed’ = a later success of the same key; at most 3 rows on the left + ‘+ n more · /steps n’. Fetch/search failures never count (amendment 6). Auto-mode refusals are ‘blocked’, not failures.

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    10:31:07 ◆  TURN 8  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ make the width tests run on Windows too
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          4s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  I couldn’t finish this. Two tests depend on a POSIX locale that Windows runners don’t
             │  set, so width("e\u0301") still splits the accent there.
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    × 2 still failing                                                   windows-latest
             │
             │    × tests/width.test.tsx:41                                   expected 1, received 2
             │    × tests/width.test.tsx:58                                   expected 1, received 2
             │
             │    → Next: set LANG=C.UTF-8 in ci.yml, or skip these two on Windows. Tell me which.
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
      3m 12s ×  FAILED   ⣀⣤⣶⣿⣷⣶⣿⣤⣀   12 steps · 2 still failing · 1 file
```

The pane (72 columns):

```text
  TIMELINE   FILES 1   SOURCES 1   TODO 2/4   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ × FAILED ▌  TURN 8                              10:31:07 → 10:34:19
  Width tests still fail on Windows
  ▁▂▂▃▄▃▅▆▄▃▅▆▇▅▄▃▂▃
  12 steps    2 still failing    1 file                          3m 12s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               10:31          10:34
                               ┬────┬────┬────┬───┬
  ✓ Adding a Windows job       ━━━                                   +9
  ✓ Running on windows-latest    ━━━━━━━                        started
▐ × Width tests on Windows             ╺━━━━                    2 of 14
    ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
      shell   bun test hooks/width                          exit 1

      × width("e\u0301")  expected 1, received 2
      × width("o\u0308")  expected 1, received 2

      c copy output   enter full output
    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
  ✓ Checking the locale                    ━━━               LANG unset
  × Retrying with LANG set                   ╺━━━━              2 of 14
  ✓ Writing up the options                       ╺━           2 options










  tab move    enter open    1–5 tabs                  ghostframe v0.1.0
```

#### 12.4 · Needs you: a permission prompt

Board `S04NeedsYou` · the engine’s dialog takes the left only · the status line hides · the pane keeps its rows

- **SHOWS** The engine’s dialog at the bottom of the left region; the left’s last row ‘! NEEDS YOU · shell rm -rf dist’. Pane: NEEDS YOU pill in warn, the waiting step selected with a one-line drawer.
- **DATA** The pending tool.call; the dialog and its choices are the engine’s.
- **ENGINE** Dialog is drawn by Claude Code in the left region only; the status line hides; the pane grows to the bottom and its existing rows must not move (correction C).
- **RULES** Warn colour only for NEEDS YOU and WAITING. No sound or flash.

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    10:40:12 ◆  TURN 9  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ clean the build output and rebuild from scratch
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          3s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  I’ll remove dist/ and rebuild. Removing it needs your permission.
             │
         41s !  NEEDS YOU   shell  rm -rf dist















  ╭────────────────────────────────────────────────────────────────────────────────────────────────╮
  │ Bash command                                                                                   │
  │ rm -rf dist                                                                                    │
  │ Remove the old build output                                                                    │
  │                                                                                                │
  │ Do you want to proceed?                                                                        │
  │ ❯ 1. Yes                                                                                       │
  │   2. Yes, and don’t ask again for rm in this folder                                            │
  │   3. No, and tell Claude what to do differently                                                │
  ╰────────────────────────────────────────────────────────────────────────────────────────────────╯
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 0   TODO 1/3   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ! NEEDS YOU ▌  TURN 9                                10:40:12 → now
  Waiting for permission to run rm -rf dist
  ▁▂▃▂▁█
  3 steps    1 waiting                                              41s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               10:40            now
                               ┬────┬────┬────┬───┬
  ✓ Reading the build script   ━━━━━                       package.json
  ✓ Checking dist/                  ━━╸                       214 files
▐ ! Removing dist/                    ━━━━━━━━━━╸             needs you
    ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
      shell   rm -rf dist

      Answer in the dialog on the left.
    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
















                                                      ghostframe v0.1.0
```

#### 12.5 · Plan mode

Board `S05Plan` · the plan is a card in the answer · approve with enter · the pane shows only reads

- **SHOWS** The plan as a cyan card inside the answer: PLAN · n steps, numbered steps, keys ‘enter approve · e edit’. Closing node ◇ ‘PLAN · ready · waiting for your approval’. Pane: PLAN pill, only read steps.
- **DATA** Plan mode from the mode indicator / ExitPlanMode tool; approval is the engine’s.
- **RULES** Cyan = machine, so the plan is cyan, not amber. If the engine owns the approve keys, show its keys, never invented ones.

The left (127 columns):

```text
    10:52:30 ◆  TURN 10  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ plan how to add a Windows job to CI, don’t change anything yet
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          9s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  Here is the plan. Nothing has been changed.
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    PLAN   4 steps                                             enter approve    e edit
             │
             │    1  Add a windows-latest job that reuses the Bun pin from mise.toml
             │    2  Set LANG=C.UTF-8 for that job only
             │    3  Run the width tests on both runners
             │    4  Report any test that behaves differently on Windows
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
      1m 12s ◇  PLAN   ready · waiting for your approval · 7 steps, all reads
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 0   TODO 0/4   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ◇ PLAN ▌  TURN 10                               10:52:30 → 10:53:42
  Plan ready: a Windows job for CI
  ▁▂▃▃▂▃▂
  7 steps    0 changes                                           1m 12s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               10:52          10:53
                               ┬────┬────┬────┬───┬
  ✓ Reading the CI workflow    ━━━━━                           48 lines
  ✓ Reading mise.toml               ━━                          6 lines
  ✓ Searching for locale use         ╺━━━━━━╸                 3 matches
  ◇ Writing the plan                        ━━━━━━━             4 steps




















                                                      ghostframe v0.1.0
```

#### 12.6 · Interrupted, then a new turn

Board `S06Interrupted` · an interrupted turn has no receipt · the engine’s row stays · the next turn closes it

- **SHOWS** Turn 11 interrupted: the engine’s ‘⎿ Interrupted · What should Claude do instead?’ row, no receipt; the spine breaks; turn 12 runs and closes normally. Pane: turn 12 in the head card, turn 11 as a one-line ‘◼ INTERRUPTED after 3 steps’ above the ruler.
- **DATA** The engine’s Interrupted row; the pane keeps the steps already seen.
- **ENGINE** TurnDuration is not raised for an interrupted turn (correction G).
- **RULES** The interrupted turn keeps its steps in history; the next turn header closes it. No receipt is invented.

The left (127 columns):

```text
    11:02:05 ◆  TURN 11  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ rename every test file to the .spec.tsx pattern
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          2s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  Renaming the 14 test files and updating imports.
             │
             │  ⎿ Interrupted · What should Claude do instead?


    11:02:41 ◆  TURN 12  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ only the ones in tests/width, leave the rest
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          2s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  Renamed the 3 files in tests/width/ and updated their imports. The other 11 are
             │  untouched.
             │
         38s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   9 steps · 6 files
```

The pane (72 columns):

```text
  TIMELINE   FILES 6   SOURCES 0   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 12                               11:02:41 → 11:03:19
  Renamed the width tests only
  ▁▂▃▃▄▃▂
  9 steps    6 files                                                38s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

  TURN 11   ◼ INTERRUPTED after 3 steps · 2 files changed      11:02:05

                               11:02:41    11:03:19
                               ┬────┬────┬────┬───┬
  ✓ Finding tests/width files  ━━━╸                             3 files
  ✓ Renaming 3 files              ━━━━━━╸                     3 renamed
  ✓ Updating imports                    ━━━━━━━                   +3 −3
  ✓ Running the width tests                   ╺━━━━             14 pass


















                                                      ghostframe v0.1.0
```

#### 12.7 · Compacted, then resumed

Board `S07Resumed` · turn labels carry AFTER COMPACT and RESUMED · the day appears when it changes

- **SHOWS** Engine rows ※ compacted and ↺ resumed; turn labels ‘TURN 30 · AFTER COMPACT’, ‘TURN 31 · RESUMED’; when the day changes the turn header adds it (· Tue).
- **DATA** Numbers and stamps from $.store prompts:<session> (amendment 12); resumed rows draw in final look on first draw.
- **RULES** Rows already on screen never change after a compaction (amendment 8); only the next header carries the label.

The left (127 columns):

```text
             │  ※ Conversation compacted · summary kept, 182 earlier messages folded

    18:20:44 ◆  TURN 30 · AFTER COMPACT  ─────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ where were we on the Windows job?
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  The Windows job is in ci.yml; two width tests still fail there because of the locale.
             │
          9s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   2 steps


             │  ↺ Resumed · claude --continue · Tue 24 Nov

    09:02:10 ◆  TURN 31 · RESUMED · Tue  ─────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ set LANG for the Windows job and rerun
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          3s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  Set LANG=C.UTF-8 on the Windows job. Both runners now pass all 14 width tests.
             │
      1m 06s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   8 steps · 1 file · ↗ c41d9e0
```

The pane (72 columns):

```text
  TIMELINE   FILES 1   SOURCES 0   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 31                           Tue 09:02:10 → 09:03:16
  Windows job passes with LANG set
  ▁▂▂▃▄▅▃▂
  8 steps    1 file                                              1m 06s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               09:02          09:03
                               ┬────┬────┬────┬───┬
  ✓ Editing ci.yml             ━━━━                                  +1
  ✓ Running on both runners       ╺━━━━━━━━━━━━╸             14 pass ×2
  ↗ Pushing                                    ━━━━             c41d9e0

  Earlier turns are kept: p previous turn



















                                                      ghostframe v0.1.0
```

#### 12.8 · A 312-step, 51-minute turn

Board `S08LongTurn` · earlier work folds into one row · the sparkline keeps the whole shape

- **SHOWS** The pane folds earlier work into one row (‘Earlier work · batches 1–5 · 214 steps’) and keeps the latest groups; the sparkline still shows the whole turn; a failure that was fixed keeps its × row and detail, followed by its passing rerun.
- **DATA** tool.call per step; the history budget folds the oldest parts first (amendment 8).
- **RULES** Fold from the top, never the live group or open failures. The sparkline is the turn’s full shape at any length (bucket steps per column).

The left (127 columns):

```text
    13:05:00 ◆  TURN 14  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ migrate every hook from the v6 API to the v7 API and keep the tests green
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
         12s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  Migrating 41 hooks in batches of five, running the tests after each batch.
             │
     38m 10s ×  Batch 6 tests   3 of 412 fail
             │  └ hooks/ledger.test.tsx:88 · claim() returned the old turn
             │
             │  Batch 6 broke claim(); fixed it and rerunning.
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             ┊
     51m 02s ⠏  Running batch 9 tests   312 steps
```

The pane (72 columns):

```text
  TIMELINE   FILES 38   SOURCES 0   TODO 6/9   AGENTS 0
  ━━━━━━━━   ────────   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ● LIVE ▌  TURN 14                                    13:05:00 → now
  Running batch 9 tests
  ▁▂▃▂▃▄▃▂▃▅▄▃▄▅▆▄▃▄▅▄▃▅▆▇▅▄▅▆▅▄▆▇█▆▅▆▇▆▅▇█▇▆▇█▇▆█▇▆▇█▆▅▇█▇██
  312 steps    1 open    2 fixed    38 files                    51m 02s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               13:05            now
                               ┬────┬────┬────┬───┬
  ┊ Earlier work · batches 1…  ━━━━━━━━━━━━       ┊           214 steps
  ✓ Batch 6 · 5 hooks                     ╺━━     ┊           +212 −180
  × Batch 6 tests                           ╺━    ┊            3 of 412
  └ ledger.test.tsx:88 · claim() returned the old turn
  ✓ Fixing claim()                           ╺━   ┊               +9 −4
  ✓ Batch 6 tests again                       ╺╸  ┊            412 pass
  ✓ Batch 7 · 5 hooks                          ━╸ ┊           +190 −171
  ✓ Batch 8 · 5 hooks                           ━━┊           +204 −188
▐ ● Batch 9 tests                                ╺━             running















                                                      ghostframe v0.1.0
```

#### 12.9 · A past turn pinned while another runs

Board `S09Pinned` · the live turn stays on top as one line · the pinned turn fills the timeline

- **SHOWS** /steps 7 (or p) pins turn 7: the head card keeps the live turn as one line on top, then ‘PINNED TURN 7’; the timeline is turn 7’s.
- **DATA** Turn 7 from $.store history (amendment 8).
- **RULES** A pin is released by a typed prompt, /steps alone, l, or pinning the live turn (amendment 8). The live turn is never hidden.
- **KEYS** l live · p previous · n next · s all.

The left (127 columns):

```text
             │
             │  ## What changed
             │  ›  .github/workflows/ci.yml installs Bun from mise.toml, the pin you use locally
             │  ›  hooks/runtime.ts fails fast when Bun is older than the pin
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    YAML   .github/workflows/ci.yml                                   +1 −1     c copy
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │     14  14    - uses: oven-sh/setup-bun@v2
             │     15      −   with: { bun-version: latest }
             │         15  +   with: { bun-version-file: mise.toml }
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    Runner                        Bun   Width tests
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    CI before                   1.4.1   × 2 of 14 fail
             │    CI after                    1.4.4   ✓ 14 pass
             │    Local                       1.4.4   ✓ 14 pass
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ▲ NOTE   The first CI run after this rebuilds the Bun cache, about a minute longer.
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  [1] bun.sh/blog/bun-v1.4.2     [2] github.com/oven-sh/setup-bun
             │
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · 2 sources · ↗ a1f3c2e


    10:31:07 ◆  TURN 8  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ make the width tests run on Windows too
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          4s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             ┊
      2m 10s ⠏  Adding a Windows job   4 steps
```

The pane (72 columns):

```text
  TIMELINE   FILES 3   SOURCES 2   TODO 5/5   AGENTS 3
  ━━━━━━━━   ───────   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ● LIVE ▌  TURN 8   running · 4 steps                         2m 10s

  PINNED  TURN 7                                    10:14:02 → 10:16:46
  Width tests fixed; CI now reads Bun from mise.toml
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               10:14          10:17
                               ┬────┬────┬────┬───┬
  × Reproducing the failure    ━━╸                              2 of 14
  ✓ Comparing Bun versions       ━━                       1.4.1 · 1.4.4
  ◇ Audit tests                    ━━━━━━                         clean
  ◇ Audit CI setup                 ━━━━━╸                        no pin
  ◇ Audit dependencies             ━━━━━                         1 high
  ✓ Pinning Bun in ci.yml                ╺━━━                     +1 −1
  ✓ Running the width tests                    ━━━              14 pass
  ↗ Pushing the fix                              ╺━             a1f3c2e
















  l live    p previous    n next    s all             ghostframe v0.1.0
```

#### 12.10 · A fresh session, first turn

Board `S10Fresh` · the pane is useful from the first step · empty tabs say what will appear

- **SHOWS** The engine’s welcome row, turn 1 live. Pane useful from step one; empty space explains what will appear; tabs show 0 or — for empty.
- **DATA** session.start; each tab count from the data it lists.
- **RULES** ‘—’ means not applicable (no to-do list yet); ‘0’ means none so far.

The left (127 columns):

```text
             │  ✻ Claude Code v2.1.330 · Opus 5.5 · D:\Projects\cockpit-scratch

    09:00:12 ◆  TURN 1  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ what does this repo do?
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          2s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             ┊
          4s ⠏  Reading the README   1 step
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 0   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ● LIVE ▌  TURN 1                                     09:00:12 → now
  Reading the README
  █
  1 step                                                             4s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               09:00            now
                               ┬────┬────┬────┬───┬
▐ ● Reading the README         ━━━━━━━━━━                       running


  Steps, files, sources and agents appear here as Claude works.
  The pane follows the live turn. p shows earlier turns



















                                                      ghostframe v0.1.0
```

#### 12.11 · Rate limited mid-turn

Board `S11RateLimit` · a pause, not a failure · warn colour · when it resumes and what you can do now

- **SHOWS** ‘! WAITING · rate limited · resumes at 14:05 · or /model to switch’ on the spine with one plain detail line. Pane: NEEDS YOU, the wait as a warn bar, a drawer saying it is a pause.
- **DATA** The engine’s rate-limit error (v7 E.21); the resume time comes from it.
- **RULES** Warn, never red; no failure counted; the turn continues by itself.

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    14:01:30 ◆  TURN 16  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ run the full test suite on all three runners and summarise
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          4s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  Running the suite on Linux first; Windows and macOS after.
             │
             │
      3m 31s !  WAITING   rate limited · resumes at 14:05 · or /model to switch
             │  └ Opus usage limit reached for this 5-hour window. Your work is kept; Claude continue…
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 0   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ! NEEDS YOU ▌  TURN 16                               14:01:30 → now
  Paused by a rate limit until 14:05
  ▂▃▄▃▄▅▃
  6 steps    1 waiting                                           3m 31s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               14:01            now
                               ┬────┬────┬────┬───┬
  ✓ Running on Linux           ━━━━━━━━━━━━━━━━━╸              412 pass
▐ ! Rate limited                                ━━━         until 14:05
    ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
      Paused, not failed. Continues at 14:05.
      /model switch model now
    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀


















                                                      ghostframe v0.1.0
```

#### 12.12 · Claude asks a question

Board `S12Question` · the engine’s question card sits in the left region · the pane says what it is waiting for

- **SHOWS** The engine’s question card in the left region, options with descriptions; the spine’s last row ‘! NEEDS YOU · 1 question to answer’. Pane: NEEDS YOU with ‘Asking you’ selected.
- **DATA** The AskUserQuestion call; the card is the engine’s (v7 E.16).
- **ENGINE** Card drawn by Claude Code (AskUserQuestion), left region only; status line hidden (correction C).
- **RULES** Cockpit never duplicates the options; it only says what is pending.

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    14:20:11 ◆  TURN 17  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ set up a release workflow for ghostframe
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          6s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  Two ways to version releases fit this repo. I need you to pick one.
             │
         22s !  NEEDS YOU   1 question to answer
















  ╭────────────────────────────────────────────────────────────────────────────────────────────────╮
  │ How should releases be versioned?                                                              │
  │                                                                                                │
  │ ❯ 1. Release Please · versions from conventional commits, a release PR                         │
  │   2. Manual tags · you push v0.x.y, CI builds and publishes                                    │
  │   3. Something else                                                                            │
  │                                                                                                │
  │ enter choose · ↑↓ move · esc skip                                                              │
  ╰────────────────────────────────────────────────────────────────────────────────────────────────╯
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 0   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ! NEEDS YOU ▌  TURN 17                               14:20:11 → now
  Claude asked which release style to use
  ▁▂▃▃▂
  4 steps    1 question                                             22s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               14:20            now
                               ┬────┬────┬────┬───┬
  ✓ Reading the workflows      ━━━━━                            3 files
  ✓ Reading package.json            ━━━━━                        v0.0.0
▐ ! Asking you                           ━━━━━━━━━━          1 question
    ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
      Answer in the card on the left.
    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀


















                                                      ghostframe v0.1.0
```

#### 12.13 · Memory, a blocking hook, a context warning

Board `S13Notices` · notices sit on the spine as grey ● rows · a hook block is ⊘, not a failure

- **SHOWS** ● Memory saved (grey notice with its clock); ⊘ BLOCKED by a hook (PreToolUse, its reason naming guard-main.sh) with what Claude did instead, a line that draws live only when already known as the row draws (13.7); ! Context 82% notice; receipt counts ‘1 blocked’.
- **DATA** Memory saves (v7 E.26), hook output (v7 E.27), context warnings (v7 E.22).
- **RULES** ⊘ = a system said no (hook, classifier, sandbox, policy). It is warn, not red, and is never a failure. Notices are grey and one line.

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    16:20:40 ◆  TURN 23  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ format everything and commit
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
    16:20:44 ●  Memory saved · prefers squash merges
             │
         12s ⊘  BLOCKED   by a hook · PreToolUse · guard-main.sh · commits to main are not allowed
             │  └ Claude switched to a branch instead.
         15s ↗  committed   b72d0aa style: format · on chore/format
             │
             !  Context 82% · compaction will run automatically at 95%
             │
         18s ✓  DONE   ⣀⣤⣶⣤⣶⣀   5 steps · 38 files · 1 blocked · ↗ b72d0aa
```

The pane (72 columns):

```text
  TIMELINE   FILES 38   SOURCES 0   TODO —   AGENTS 0
  ━━━━━━━━   ────────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 23                               16:20:40 → 16:20:58
  Formatted and committed on a branch
  ▂▃▄▂▃▁
  5 steps    1 blocked    38 files                                  18s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               16:20:40    16:20:58
                               ┬────┬────┬────┬───┬
  ✓ Formatting                 ━━━━━━━━━━                      38 files
  ⊘ Committing to main                   ━━━╸                   blocked
  └ PreToolUse hook guard-main.sh · exit 2
  ✓ Creating chore/format                   ━━━━                 branch
  ↗ Committing                                 ╺━━━             b72d0aa



















                                                      ghostframe v0.1.0
```

#### 12.14 · A message queued while Claude works

Board `S14Queued` · a queued message is a grey ⋯ card with when it will send · the pane notes it

- **SHOWS** A message typed mid-turn that waits for the turn to end: grey ⋯ card, clock, then QUEUED at the card’s end, ‘Sends when this turn ends · ctrl+enter send now’. Pane notes ‘1 message queued’.
- **DATA** prompt.submit stored as queued (door queue, amendment 12). If the engine folds it into the turn, it becomes ↳ added (screen 02).
- **RULES** A queued message gets its turn number only when its turn starts.

The left (127 columns):

```text
    16:40:00 ◆  TURN 24  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ migrate the remaining hooks to the v7 API
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          5s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  Migrating the 6 remaining hooks one at a time, with the tests after each.
             │
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
    16:45:12 │    ⋯ when you’re done, also update the README                                  QUEUED
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │  Sends when this turn ends · ctrl+enter send now
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             ┊
      5m 31s ⠏  Hook 3 of 6 · quiet.tsx   18 steps
```

The pane (72 columns):

```text
  TIMELINE   FILES 2   SOURCES 0   TODO 2/6   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ● LIVE ▌  TURN 24                                    16:40:00 → now
  Hook 3 of 6 · quiet.tsx
  ▂▃▄▃▄▅▄▃▄▅█
  18 steps    2 hooks done                                       5m 31s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               16:40            now
                               ┬────┬────┬────┬───┬
  ✓ Hook 1 · ledger.tsx        ━━━━━━━━           ┊             41 pass
  ✓ Hook 2 · register.tsx             ╺━━━━━━╸    ┊             41 pass
▐ ● Hook 3 · quiet.tsx                       ━━━━━━             running

  ⋯ 1 message queued for the next turn



















                                                      ghostframe v0.1.0
```

#### 12.15 · The API is overloaded, retrying

Board `S15ApiRetry` · a retry is a warn row with a countdown and the attempt number · never red

- **SHOWS** ‘! WAITING · API overloaded · retrying in 8s · attempt 2 of 10’ with ‘Nothing is lost’. Pane: still LIVE, the wait as a warn bar against the now-line.
- **DATA** The engine’s retry error (v7 E.21); attempt and delay come from it.
- **RULES** A retry is not a failure. The countdown updates in place; the row does not move.

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    17:02:00 ◆  TURN 25  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ summarise the open issues by label
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          3s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │
      1m 02s !  WAITING   API overloaded · retrying in 8s · attempt 2 of 10
             │  └ Nothing is lost; the turn continues from the last step.
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 0   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ● LIVE ▌  TURN 25                                    17:02:00 → now
  Retrying after an overloaded API
  ▂▃▄▃  █
  3 steps    1 retrying                                          1m 02s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               17:02            now
                               ┬────┬────┬────┬───┬
  ✓ Listing open issues        ━━━━━━━━━━━━━      ┊           38 issues
▐ ! Waiting to retry                       ╺━━━━━━╸               in 8s






















                                                      ghostframe v0.1.0
```

### Answers and tools

What the answer and its steps look like for different kinds of work.

#### 12.16 · A turn with no prose, only tools

Board `S16OnlyTools` · when Claude writes nothing, the work node and the receipt still tell the story

- **SHOWS** No answer text: a ◇ worked node (trace + counts), an ↗ committed row, the receipt.
- **DATA** The footer claims the turn; the receipt anchors to the turn’s last call row (amendment 12) since no answer row exists.
- **RULES** Never leave a turn without its numbers. With no answer text, the turn gets one ◇ worked node even when the pane is docked; with any answer text it gets none.

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    14:31:00 ◆  TURN 18  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ bump all dev dependencies and commit
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
         48s ↗  committed   9f3e2b1 chore(deps): bump dev dependencies
         48s ◇  worked   ⣀⣤⣶⣿⣶⣤⣀   7 steps · 6 shell · 1 edit
             │
         48s ✓  DONE   ⣀⣤⣶⣿⣶⣤⣀   7 steps · 2 files · ↗ 9f3e2b1
```

The pane (72 columns):

```text
  TIMELINE   FILES 2   SOURCES 0   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 18                               14:31:00 → 14:31:48
  Dev dependencies bumped and committed
  ▂▃▄▄▃▂▃
  7 steps    2 files                                                48s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               14:31:00    14:31:48
                               ┬────┬────┬────┬───┬
  ✓ Listing outdated packages  ━━━━━                         9 outdated
  ✓ Updating 9 packages             ━━━━━━━━                      +9 −9
  ✓ Running the tests                      ━━━━━╸              412 pass
  ↗ Committing                                  ━━━             9f3e2b1




















                                                      ghostframe v0.1.0
```

#### 12.17 · A turn with only prose

Board `S17OnlyProse` · a short answer stays short: prompt, two lines, a receipt

- **SHOWS** Prompt, two lines, receipt ‘no steps’. Pane: DONE, ‘No steps in this turn’ with what will appear.
- **DATA** TurnDuration with no tool.call in the turn.
- **RULES** Short answers stay short; no empty sections, no fake detail.

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    14:40:02 ◆  TURN 18  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ what’s the difference between bun.lock and bun.lockb?
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  bun.lock is the text lockfile Bun writes by default since 1.2; bun.lockb is the older
             │  binary one. Commit the text one: it diffs and merges like any other file.
             │
          4s ✓  DONE   ⣀⣤⣀   no steps
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 0   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 18                               14:40:02 → 14:40:06
  Answered from knowledge, no steps
  ▁▁
  0 steps                                                            4s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               14:40:02    14:40:06
                               ┬────┬────┬────┬───┬

  No steps in this turn.
  The timeline fills when Claude reads, runs or edits.





















                                                      ghostframe v0.1.0
```

#### 12.18 · A long explanatory answer

Board `S18LongAnswer` · every markdown element: headings, numbered and nested lists, a quote, task items, a footnote

- **SHOWS** Every markdown element in one answer: bright lead, ## and ### headings with dim markers, a numbered list (cyan numerals), bullets with a nested bullet, a quote (▏ in cyan), task items [x] [ ], an inline footnote [1].
- **DATA** The answer block as Claude wrote it (v7 E.7); nothing is rewritten.
- **RULES** Reading column 86. Heading and list markers stay visible but dim; backticks and `**` are dropped. No boxes around prose.

The left (127 columns):

```text
    15:02:44 ◆  TURN 19  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ explain how the pane decides what to show when the window narrows
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          7s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  The pane never shrinks below 72 columns; it leaves instead, and the left takes over
             │  its job.
             │
             │  ## The rule
             │  1  At 144 columns or more the pane docks on its own.
             │  2  From 110 to 143 it docks only if you asked with /cockpit or /steps.
             │  3  Below 110 the engine seats it inline, and Cockpit closes it unless you asked.
             │
             │  ### While you drag the window
             │  ›  the pane holds its width until the size is stable for 150 ms
             │  ›  an unasked pane leaves at the first width below 144
             │       ›  so the conversation only ever widens, never squeezes
             │
             │  ▏ Rows already drawn are redrawn in the new mode, so a finished turn gains its
             │  ▏ work node when the pane leaves and loses it when the pane returns.
             │
             │  [x] docks at 200 · [x] asked open at 120 · [ ] tmux, untested
             │
             │  See amendment 10 and the drag test in the feasibility report [1].
             │
         31s ✓  DONE   ⣀⣤⣶⣤⣀   4 steps · 1 source
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 1   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 19                               15:02:44 → 15:03:15
  Explained how the pane follows the width
  ▁▂▃▂▁
  4 steps                                                           31s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               15:02:44    15:03:15
                               ┬────┬────┬────┬───┬
  ✓ Reading amendment 10       ━━━━━━━━                        62 lines
  ✓ Reading pane.tsx                   ━━━━━━━━               485 lines
  ✓ Reading the drag test                      ━━━━            96 lines





















                                                      ghostframe v0.1.0
```

#### 12.19 · Commit, pull request, merge

Board `S19Git` · everything that leaves your machine gets an ↗ row at once, on both halves

- **SHOWS** ↗ committed / pushed / opened PR #23 / merged, each the moment it happens; ✓ CI passed with its checks; receipt ‘↗ PR #23 merged’. Pane: the long CI wait as one bar.
- **DATA** tool.call for git and gh; each ↗ row as the call returns (v7 E.5).
- **RULES** ✓ CI passed is the one success that gets a row on the left, because you asked Claude to wait for it. ↗ for anything that leaves the machine, always drawn at once (v7 E.5). Commit hashes and PR numbers are bright.

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    15:20:05 ◆  TURN 20  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ commit this, open a PR and merge it when CI passes
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          3s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
         12s ↗  committed   a1f3c2e fix(ci): read Bun from mise.toml
         15s ↗  pushed   fix/ci-bun-pin · 1 commit · origin
         19s ↗  opened   PR #23 fix(ci): read Bun from mise.toml
      4m 02s ✓  CI passed   3 checks · 3m 41s
      4m 06s ↗  merged   PR #23 into main · squash · 7c1e2a9
             │
             │  Merged. main now has the fix as 7c1e2a9; the branch is deleted.
             │
      4m 08s ✓  DONE   ⣀⣤⣶⣀⣀⣀⣀⣀⣤⣶   9 steps · ↗ PR #23 merged
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 0   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 20                               15:20:05 → 15:24:13
  PR #23 merged into main
  ▂▃▃▁▁▁▁▁▂▃
  9 steps    1 PR                                                4m 08s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               15:20          15:24
                               ┬────┬────┬────┬───┬
  ↗ Committing                 ━                                a1f3c2e
  ↗ Pushing the branch         ╺╸                        fix/ci-bun-pin
  ↗ Opening PR #23              ━                                   #23
  ✓ Waiting for CI              ╺━━━━━━━━━━━━━━━━━╸              3 pass
  ↗ Merging PR #23                                ━             7c1e2a9



















                                                      ghostframe v0.1.0
```

#### 12.20 · Web research with eight sources

Board `S20Research` · footnotes in the answer match the numbers in Sources · a 404 is the page’s problem, not the turn’s

- **SHOWS** The answer cites [1][4], [3], [2]; footnote lines at the end. Pane on the Sources tab: 8 pages, 4 cited first with ¹–⁴, the rest ·, a 404 in red.
- **DATA** WebFetch and WebSearch calls of the turn; footnotes from the answer (v7 E.9).
- **RULES** The numbers in the answer and in Sources are the same numbers. Cited pages re-sort to answer order at turn end only.

The left (127 columns):

```text
    15:40:10 ◆  TURN 21  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ research why grapheme splitting differs between Bun versions, with sources
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          8s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  Bun 1.4.1 bundled ICU 74, which splits some combining sequences; 1.4.2 moved to ICU 76
             │  [1][4]. The Unicode rule for extended grapheme clusters keeps a base and its marks
             │  together [3], so 1.4.2 is the correct behaviour. setup-bun can pin the version from a
             │  file [2].
             │
             │  [1] bun.sh/blog/bun-v1.4.2   [2] github.com/oven-sh/setup-bun
             │  [3] unicode.org/reports/tr29   [4] github.com/unicode-org/icu/releases
             │
      1m 52s ✓  DONE   ⣀⣤⣴⣶⣿⣷⣶⣤⣀   14 steps · 8 sources, 4 cited
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 8   TODO —   AGENTS 0
  ────────   ───────   ━━━━━━━━━   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  8 pages read   4 cited                                       1 failed
  cited pages first, in answer order
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

  ¹ bun.sh   Bun v1.4.2                                             200
  ² github.com   oven-sh/setup-bun                                  200
  ³ unicode.org   UAX #29 · Grapheme clusters                       200
  ⁴ github.com   unicode-org/icu · release notes                    200
  · docs.github.com   Workflow syntax                               200
  · stackoverflow.com   ICU grapheme splitting                      200
  · docs.sigstore.dev   Cosign · keyless                            404
  · npmjs.com   string-width                                        200




















  enter copy url    u urls    1 timeline              ghostframe v0.1.0
```

#### 12.21 · Browser and MCP tools

Board `S21McpBrowser` · browser and mcp steps name the tool and the action · an issue created elsewhere is an ↗

- **SHOWS** Steps name the tool family and the action: ‘browser · screenshot’, ‘mcp · linear create issue’; an issue created in Linear is an ↗ with its key; a detail line names server, tool and arguments.
- **DATA** Tool names: mcp__<server>__<tool> gives ‘mcp · <server> <tool>’; browser tools give ‘browser · <action>’.
- **RULES** Kind words: browser, mcp. Results are short nouns (‘1 image’, ‘3 teams’, ‘GHO-142’).

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    16:02:00 ◆  TURN 22  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ check the deploy preview in the browser and file a Linear issue for anything
             │      broken
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          5s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  The preview loads, but the pane’s tab strip wraps at 1280px. Filed it as GHO-142.
             │
      1m 18s ✓  DONE   ⣀⣤⣶⣿⣶⣤⣶⣿⣤⣀   11 steps · 4 browser · 2 mcp · ↗ GHO-142
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 1   TODO —   AGENTS 0
  ━━━━━━━━   ───────   ─────────   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 22                               16:02:00 → 16:03:18
  Preview checked; one issue filed
  ▁▂▃▄▃▂▃▄▂▁
  11 steps    1 issue                                            1m 18s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               16:02          16:03
                               ┬────┬────┬────┬───┬
  ✓ browser · open preview     ━━━╸                                 200
  ✓ browser · resize to 1280      ━━                               done
  ✓ browser · screenshot           ╺━╸                          1 image
  ✓ browser · read the tab s…        ━━━╸                         wraps
  ✓ mcp · linear list teams             ━━━╸                    3 teams
  ↗ mcp · linear create issue              ━━━━━━━━             GHO-142
  └ linear · create_issue · team ghostframe · label ui

















                                                      ghostframe v0.1.0
```

#### 12.22 · Slash commands

Board `S22Slash` · commands get a / node in cyan · output is quiet, one line, and says what exists when a number is wrong

- **SHOWS** Each command as a cyan / node with its clock; /steps 7 all prints the step rows (kind, subject, result, own duration) with ‘… 16 more’; /copy code 1 → ✓ one line; /copy code 9 → × ‘there is no code block 9 · the last answer has 1’; /cockpit → ✓.
- **DATA** Cockpit’s own slash commands (v7 E.24).
- **RULES** Command output is one quiet line, except /steps n all. A wrong number always says what exists.

The left (127 columns):

```text
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · width tests fixed

    16:31:02 /  /steps 7 all
             │
             │  STEPS · TURN 7 · 23 steps
                test    bun test hooks/width                                      2 of 14 fail      3s
                shell   bun --version                                                    1.4.4     <1s
                agent   3 launched                                           2 done · 1 failed  1m 10s
                edit    .github/workflows/ci.yml                                         +1 −1     <1s
                edit    hooks/runtime.ts                                                   +12     <1s
                test    bun test hooks/width                                           14 pass      3s
                shell   git push                                                       a1f3c2e      2s
             │  … 16 more · /steps 7 all is in your scrollback
             │
    16:31:20 /  /copy code 1
             ✓  Copied code block 1 · 3 lines · yaml
             │
    16:31:34 /  /copy code 9
             ×  There is no code block 9 · the last answer has 1
             │
    16:31:50 /  /cockpit
             ✓  Pane docked at 72 columns
```

The pane (72 columns):

```text
  TIMELINE   FILES 3   SOURCES 2   TODO 5/5   AGENTS 3
  ━━━━━━━━   ───────   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 7                                10:14:02 → 10:16:46
  Width tests fixed; CI now reads Bun from mise.toml
  ▁▂▃▂▄▅▃▂▁▃▅▆▄▃▅▇█▆▇█▆▇▅▄▆▇▅▃▂▁▂▃▄▅▄▃▂▃▄▃▂▁▂▃▂▁
  23 steps    1 fixed    3 agents    3 files                     2m 44s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               10:14          10:17
                               ┬────┬────┬────┬───┬
  × Reproducing the failure    ━━╸                              2 of 14
  └ width("e\u0301") · expected 1, received 2
  ✓ Comparing Bun versions       ━━                       1.4.1 · 1.4.4
  ◇ Audit tests                    ━━━━━━                         clean
  ◇ Audit CI setup                 ━━━━━╸                        no pin
  ◇ Audit dependencies             ━━━━━                         1 high
  ✓ Pinning Bun in ci.yml                ╺━━━                     +1 −1
  ✓ Failing fast on old Bun                 ╺━━╸                    +12
  ✓ Running the width tests                    ━━━              14 pass
  ↗ Pushing the fix                              ╺━             a1f3c2e














                                                      ghostframe v0.1.0
```

### Pane tabs

Each pane tab, an agent in view, a full diff, every step.

#### 12.23 · The Files tab

Board `S23Files` · change bars per file · the diff opens in place · agent edits marked ◇

- **SHOWS** Summary card ‘3 files changed +14 −1 · against the start of the turn’; each file: folder dim, name bright, +/−, a 5-cell change bar; the selected file’s hunk opens in place; ◇ marks agent edits.
- **DATA** Diff = file at turn start (read before the first change) vs now; Git fallback for unseen changes (amendment 8).
- **RULES** Counts are against the turn’s start. A file an agent edited keeps ◇. Order is first-touched; no re-sort mid-turn.
- **KEYS** enter diff · c copy path · 1 timeline.

The left (127 columns):

```text
    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          6s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  CI was on Bun 1.4.1, whose ICU splits a skin-tone modifier into its own grapheme.
             │  The tests and the code were right; the runner was old.
             │
             │  ## What changed
             │  ›  .github/workflows/ci.yml installs Bun from mise.toml, the pin you use locally
             │  ›  hooks/runtime.ts fails fast when Bun is older than the pin
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    YAML   .github/workflows/ci.yml                                   +1 −1     c copy
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │     14  14    - uses: oven-sh/setup-bun@v2
             │     15      −   with: { bun-version: latest }
             │         15  +   with: { bun-version-file: mise.toml }
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    Runner                        Bun   Width tests
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    CI before                   1.4.1   × 2 of 14 fail
             │    CI after                    1.4.4   ✓ 14 pass
             │    Local                       1.4.4   ✓ 14 pass
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ▲ NOTE   The first CI run after this rebuilds the Bun cache, about a minute longer.
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  [1] bun.sh/blog/bun-v1.4.2     [2] github.com/oven-sh/setup-bun
             │
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · 2 sources · ↗ a1f3c2e
```

The pane (72 columns):

```text
  TIMELINE   FILES 3   SOURCES 2   TODO 5/5   AGENTS 3
  ────────   ━━━━━━━   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  3 files changed                                               +14  −1
  turn 7 · against the start of the turn
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

▐   .github/workflows/ci.yml                             +1   −1  ■■■■■
    ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
      @@ 14,3 @@                                            c copy
       14    - uses: oven-sh/setup-bun@v2
       15  -   with: { bun-version: latest }
       15  +   with: { bun-version-file: mise.toml }
    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
    hooks/runtime.ts                                    +12       ■■■■■
  ◇ tests/width.test.tsx                                 +1       ■■■■■

  ◇ changed by an agent

















  enter diff    c copy path    1 timeline             ghostframe v0.1.0
```

#### 12.24 · The Sources tab

Board `S24Sources` · cited pages carry their footnote number · a failed page is red, not a turn failure

- **SHOWS** ‘3 pages read · 2 cited · 1 failed’; cited pages first with their footnote number, uncited with ·; host in cyan, title, status; a 404 in red bold; URLs shown dim under each row (u toggles).
- **DATA** WebFetch and WebSearch calls of the turn, with their status.
- **RULES** A failed page is a source problem, not a turn failure (amendment 6). No browser API: enter copies the URL.
- **KEYS** enter copy url · u hide urls · c copy · 1 timeline.

The left (127 columns):

```text
    14:10:03 ◆  TURN 15  ─────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ what changed in bun 1.4.2 and does setup-bun support a version file?
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          5s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  Bun 1.4.2 fixed grapheme splitting for combining marks [1].
             │  setup-bun reads bun-version-file and accepts mise.toml since v2.1 [2].
             │  The sigstore page I tried is gone (404), so I left signing out.
             │
             │  [1] bun.sh/blog/bun-v1.4.2     [2] github.com/oven-sh/setup-bun
             │
         41s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   6 steps · 3 sources, 2 cited
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 3   TODO —   AGENTS 0
  ────────   ───────   ━━━━━━━━━   ──────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  3 pages read   2 cited                                       1 failed
  cited pages first, in answer order
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

▐ ¹ bun.sh   Bun v1.4.2                                             200
      https://bun.sh/blog/bun-v1.4.2
  ² github.com   oven-sh/setup-bun · README                         200
      https://github.com/oven-sh/setup-bun
  · docs.sigstore.dev   Cosign · keyless signing                    404
      https://docs.sigstore.dev/cosign/keyless






















  enter copy url    u hide urls    c copy    1 timeline
```

#### 12.25 · The Todo tab

Board `S25Todo` · Claude’s own to-do list, live · the current item is the amber one

- **SHOWS** ‘2 of 5 done’ with a progress bar; ✓ done items dim, ▸ the current item amber and bright, ○ open items.
- **DATA** TodoWrite tool calls (CLAUDE_CODE_ENABLE_TODO_TOOLS).
- **RULES** Order as Claude wrote it; never re-sort.

The left (127 columns):

```text
          6s ✓  DONE   ⣀⣤⣶⣤⣀   2 steps · which bun does CI install?

    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          6s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  CI is on Bun 1.4.1 and you are on 1.4.4. I’m auditing tests, CI and dependencies in
             │  parallel before changing anything.
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
    10:26:31 │    ↳ also check whether the lockfile pins bun anywhere                          added
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  The lockfile has no Bun pin either; mise.toml is the only one, so CI should read from
             │  it. I’ll point setup-bun at it and add a guard so the two can’t drift again.
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             ┊
     12m 40s ⠏  Auditing in parallel   ◇◇◇   46 steps
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 3   TODO 2/5   AGENTS 3
  ────────   ───────   ─────────   ━━━━━━━━   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  2 of 5 done                                                    turn 7
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

  ✓  Reproduce the width failure
  ✓  Compare Bun on CI and locally
  ▸  Find why CI runs Bun 1.4.1
  ○  Pin Bun in CI
  ○  Rerun the width tests on CI























  1 timeline    1–5 other tabs                        ghostframe v0.1.0
```

#### 12.26 · The Agents tab

Board `S26Agents` · one card per agent · its current step under its name · enter opens its conversation

- **SHOWS** ‘3 agents · 2 running · 1 failed · launched together at 10:25:20’; one row per agent: name, open failures ×n, steps, duration; under it the current or last step with its state.
- **DATA** agent.spawn, agent.report and AgentRow (correction M: description, status, tokenCount, cost, startTime).
- **RULES** An agent’s failed edit or command shows only here and on its gantt bar, never as a main-loop failure (amendment 1).
- **KEYS** enter opens the agent’s conversation ($.ui.view), tab moves.

The left (127 columns):

```text
          6s ✓  DONE   ⣀⣤⣶⣤⣀   2 steps · which bun does CI install?

    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          6s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  CI is on Bun 1.4.1 and you are on 1.4.4. I’m auditing tests, CI and dependencies in
             │  parallel before changing anything.
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
    10:26:31 │    ↳ also check whether the lockfile pins bun anywhere                          added
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  The lockfile has no Bun pin either; mise.toml is the only one, so CI should read from
             │  it. I’ll point setup-bun at it and add a guard so the two can’t drift again.
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             ┊
     12m 40s ⠏  Auditing in parallel   ◇◇◇   46 steps
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 3   TODO 2/5   AGENTS 3
  ────────   ───────   ─────────   ────────   ━━━━━━━━

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  3 agents   2 running                                         1 failed
  launched together at 10:25:20
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

▐ ◇ Audit tests                                        9 steps   1m 10s
      ▸ shell bun test hooks/width --rerun                      running

  ◇ Audit CI setup                                     4 steps      58s
      ▸ fetch docs.github.com/…/setup-bun                       running

  × Audit dependencies                             ×1  6 steps   1m 02s
      × shell npm audit --omit dev                              stopped




















  enter open conversation    tab move    1 timeline   ghostframe v0.1.0
```

#### 12.27 · An agent’s conversation open

Board `S27AgentView` · the left shows the agent · m returns to main from anywhere in the pane · Escape is never offered

- **SHOWS** The left becomes the agent’s conversation: ‘AGENT Audit tests’ header with a violet node, the brief as a › card ‘from main’, its steps on the spine. Prompt reads ‘Message Audit tests…’ with a violet tag. Pane: AGENT pill, the agent’s own timeline.
- **DATA** $.ui.view opens the agent’s conversation (amendment 13).
- **ENGINE** The view may be refused after a resume: then show the kept steps with ‘conversation not held’.
- **RULES** An agent’s steps never count in the main turn.
- **KEYS** m back to main from anywhere in the pane; enter on its row again also returns. Escape is never offered (it can stop the agent).

The left (127 columns):

```text
    10:25:20 ◇  AGENT Audit tests  ───────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
   from main │    › Check whether the width tests fail only because of the Bun version. Run them
             │      twice and report.
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  Running the width tests on the pinned Bun first.
             │
          6s ✓  shell   bun test hooks/width   14 pass
          5s ✓  shell   bun test hooks/width   14 pass
             │
             │  Both runs pass on 1.4.4. Rerunning on 1.4.1 to confirm the version is the cause.
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
             │
      1m 10s ⠏  Rerunning on Bun 1.4.1
```

The pane (72 columns):

```text
  TIMELINE   FILES 0   SOURCES 3   TODO 2/5   AGENTS 3
  ────────   ───────   ─────────   ────────   ━━━━━━━━

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ◇ AGENT ▌  Audit tests                             running · 1m 10s
  The conversation on the left is this agent’s.
  9 steps    0 files                                        from turn 7
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               10:25            now
                               ┬────┬────┬────┬───┬
  ✓ Running the width tests    ━━━╸                             14 pass
  ✓ Running them again            ━━━━                          14 pass
  ✓ Installing Bun 1.4.1             ╺━━━━━━━━                    1.4.1
▐ ● Rerunning on 1.4.1                        ━━━━━             running





















  m back to main    tab move    enter open step       ghostframe v0.1.0
```

#### 12.28 · A full diff in the pane

Board `S28DiffView` · enter on a file: every hunk, two line-number gutters, long lines wrap with ↩

- **SHOWS** enter on a file in Files: path, ‘+12 · 2 hunks’, the baseline line; each hunk with its @@ header in cyan, two gutters (old, new), tinted added/removed lines; a long line wraps under itself marked ↩.
- **DATA** The file at turn start against now (amendment 8).
- **RULES** Hunks in file order. A wrapped line always carries ↩; nothing is cut.
- **KEYS** b back · c copy · ↑↓ scroll · n next file.

The left (127 columns):

```text
    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          6s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  CI was on Bun 1.4.1, whose ICU splits a skin-tone modifier into its own grapheme.
             │  The tests and the code were right; the runner was old.
             │
             │  ## What changed
             │  ›  .github/workflows/ci.yml installs Bun from mise.toml, the pin you use locally
             │  ›  hooks/runtime.ts fails fast when Bun is older than the pin
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    YAML   .github/workflows/ci.yml                                   +1 −1     c copy
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │     14  14    - uses: oven-sh/setup-bun@v2
             │     15      −   with: { bun-version: latest }
             │         15  +   with: { bun-version-file: mise.toml }
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    Runner                        Bun   Width tests
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    CI before                   1.4.1   × 2 of 14 fail
             │    CI after                    1.4.4   ✓ 14 pass
             │    Local                       1.4.4   ✓ 14 pass
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ▲ NOTE   The first CI run after this rebuilds the Bun cache, about a minute longer.
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  [1] bun.sh/blog/bun-v1.4.2     [2] github.com/oven-sh/setup-bun
             │
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · 2 sources · ↗ a1f3c2e
```

The pane (72 columns):

```text
  TIMELINE   FILES 3   SOURCES 2   TODO 5/5   AGENTS 3
  ────────   ━━━━━━━   ─────────   ────────   ────────

  hooks/runtime.ts                                      +12  ·  2 hunks
  turn 7 · against the start of the turn

  @@ 1,4 @@
   1   1   import { which } from "bun";
       2 + import pin from "../mise.toml" with { type: "toml" };
   2   3

  @@ 18,3 @@
  18  19   export function runtime() {
      20 +   const want = pin.tools.bun, have = Bun.version;
      21 +   if (Bun.semver.order(have, want) < 0) {
      22 +     throw new Error(`ghostframe needs Bun ${want} or newer;
         ↩  this is ${have}. Run mise install.`);
      23 +   }
  19  24     return { version: Bun.version };
  20  25   }
















  b back    c copy    ↑↓ scroll    n next file        ghostframe v0.1.0
```

#### 12.29 · Every step, one opened

Board `S29AllSteps` · s shows every step without folding · enter opens a step’s output in place

- **SHOWS** s: ALL STEPS · TURN 7, no folding, one row per step (glyph, kind, subject, result, own duration); enter opens the selected step’s output in place: exit, the decisive lines, the totals.
- **DATA** Step outputs kept in history (amendment 8).
- **RULES** Output excerpts are kept within the history budget (amendment 8); a trimmed one says so.
- **KEYS** s fit · enter output · c copy · p n turns.

The left (127 columns):

```text
    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          6s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  CI was on Bun 1.4.1, whose ICU splits a skin-tone modifier into its own grapheme.
             │  The tests and the code were right; the runner was old.
             │
             │  ## What changed
             │  ›  .github/workflows/ci.yml installs Bun from mise.toml, the pin you use locally
             │  ›  hooks/runtime.ts fails fast when Bun is older than the pin
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    YAML   .github/workflows/ci.yml                                   +1 −1     c copy
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │     14  14    - uses: oven-sh/setup-bun@v2
             │     15      −   with: { bun-version: latest }
             │         15  +   with: { bun-version-file: mise.toml }
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    Runner                        Bun   Width tests
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    CI before                   1.4.1   × 2 of 14 fail
             │    CI after                    1.4.4   ✓ 14 pass
             │    Local                       1.4.4   ✓ 14 pass
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ▲ NOTE   The first CI run after this rebuilds the Bun cache, about a minute longer.
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  [1] bun.sh/blog/bun-v1.4.2     [2] github.com/oven-sh/setup-bun
             │
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · 2 sources · ↗ a1f3c2e
```

The pane (72 columns):

```text
  TIMELINE   FILES 3   SOURCES 2   TODO 5/5   AGENTS 3
  ━━━━━━━━   ───────   ─────────   ────────   ────────

  ALL STEPS · TURN 7                                23 steps · 1 failed

  ✓ read   tests/width.test.tsx                        96 lines     <1s
▐ × test   bun test hooks/width                         2 of 14      3s
    ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
      exit 1 · 3s                                           c copy

      bun test v1.4.4
      × width > combining marks
        expected: 1  received: 2
        at tests/width.test.tsx:41:27
      12 pass · 2 fail · 14 total
    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
  ✓ shell  bun --version                                  1.4.4     <1s
  ✓ read   .github/workflows/ci.yml                    48 lines     <1s
  ◇ agent  3 launched                              2 · 1 failed  1m 10s
  ✓ fetch  bun.sh/blog/bun-v1.4.2                           200      1s
  ✓ edit   .github/workflows/ci.yml                       +1 −1     <1s
  ✓ edit   hooks/runtime.ts                                 +12     <1s
  ✓ test   bun test hooks/width                         14 pass      3s
  ↗ shell  git push                                     a1f3c2e      2s
  … 13 more above · ↑ scroll











  s fit    enter output    c copy    p n turns        ghostframe v0.1.0
```

### Modes and widths

ctrl+o, no pane, the inline inspector, a very wide terminal.

#### 12.30 · ctrl+o, the full record

Board `S30CtrlO` · full width, no pane · every sentence and step in order, each with its own duration

- **SHOWS** Full width, no pane. Each working sentence on the spine with its clock; each step on its own row: kind, subject, result, its own duration; diffs in place. Same receipt.
- **DATA** ToolUse and ToolResult, raised only in this view (correction F).
- **ENGINE** The engine hides the pane in this view (correction D); detect it from ToolUse.isExpanded / no ToolGroup.
- **RULES** Thinking text is not available here; show only its duration.

The screen (200 columns):

```text
    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
    10:14:06 │  Reproducing the failure first.
                test    bun test hooks/width                                      2 of 14 fail      3s
    10:14:21 │  CI and local disagree on Bun. Auditing tests, CI and dependencies in parallel.
                shell   bun --version                                                    1.4.4     <1s
                agent   3 launched                                           2 done · 1 failed  1m 10s
    10:15:33 │  Pinning Bun in CI to the version in mise.toml.
                edit    .github/workflows/ci.yml                                         +1 −1     <1s
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    YAML   .github/workflows/ci.yml                                   +1 −1     c copy
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │     15      −   with: { bun-version: latest }
             │         15  +   with: { bun-version-file: mise.toml }
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
                edit    hooks/runtime.ts                                                   +12     <1s
                test    bun test hooks/width                                           14 pass      3s
                shell   git push                                                       a1f3c2e      2s
             │
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files
```

#### 12.31 · Narrow, 100 columns, no pane

Board `S31Narrow` · the spine carries the summary, the failure and the live step

- **SHOWS** The same spine without the pane: a finished turn’s work as one ◇ ‘worked’ node with a trace and counts; a failure as a × node with its detail; the live step at the bottom with its running command and current to-do as tree branches.
- **DATA** The same turn data as the pane, drawn on the left.
- **ENGINE** Below 144 columns no pane is docked unless asked; /cockpit docks down to 110 (amendment 5).
- **RULES** Below 144 columns an unasked pane leaves at once; returning wide, it opens once after 150 ms of stable width (amendment 10).

The screen (100 columns):

```text
    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
      2m 44s ◇  worked   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷   23 steps · 3 agents · 1 fixed
             │
             │  CI was on Bun 1.4.1, whose ICU splits a skin-tone modifier into its own
             │  grapheme. The tests and the code were right; the runner was old.
             │
             │  ›  .github/workflows/ci.yml installs Bun from mise.toml
             │  ›  hooks/runtime.ts fails fast when Bun is older than the pin
             │
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files


    10:31:07 ◆  TURN 8  ──────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ make the width tests run on Windows too
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             ×  Width tests on Windows   2 of 14 fail   1m 24s
             │  └ width("e\u0301") · expected 1, received 2
             │








             ┊
      1m 51s ⠏  Retrying with LANG set   9 steps
             ├  ▸ shell  bun test hooks/width   running
             └  ▸ todo   Writing up the options   3 of 4
```

#### 12.32 · /steps at 100 columns, the inline inspector

Board `S32Inspector` · below 110 columns /steps opens one section above the prompt · esc closes it

- **SHOWS** One card above the prompt: ‘STEPS · TURN 8 · 12 steps · 2 failed’, rows with glyph, kind, subject, result, duration; keys s all · c copy · p previous · n next · esc close.
- **DATA** The same steps as the Timeline tab.
- **ENGINE** Below 110 columns or outside fullscreen, an asked open is seated inline by the engine (amendment 9).
- **RULES** One card, never taller than the left can spare; it closes on esc or a typed prompt.
- **KEYS** s all · c copy · p previous · n next · esc close.

The screen (100 columns):

```text
    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
      2m 44s ◇  worked   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷   23 steps · 3 agents · 1 fixed
             │
             │  CI was on Bun 1.4.1, whose ICU splits a skin-tone modifier into its own
             │  grapheme. The tests and the code were right; the runner was old.
             │
             │  ›  .github/workflows/ci.yml installs Bun from mise.toml
             │  ›  hooks/runtime.ts fails fast when Bun is older than the pin
             │
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files


    10:31:07 ◆  TURN 8  ──────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ make the width tests run on Windows too
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             ×  Width tests on Windows   2 of 14 fail   1m 24s
             │  └ width("e\u0301") · expected 1, received 2
             │



  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
   STEPS · TURN 8                                                             12 steps · 2 failed

   ✓ shell   bun --version                                                           1.4.4    <1s
   × test    bun test hooks/width                                                  2 of 14     3s
   ✓ read    .github/workflows/ci.yml                                             48 lines    <1s
   ▸ shell   bun test hooks/width                                                 running     27s

   s all   c copy   p previous   n next   esc close
  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
```

#### 12.33 · Ultra-wide, 240 columns

Board `S33UltraWide` · the reading column stays 86 · the pane stays 72 · extra width is breathing room

- **SHOWS** The same screen at 240 columns: the reading column stays 86 and the pane stays 72; the extra width is empty space on the left’s right side.
- **DATA** columns from each open (correction K).
- **ENGINE** The engine caps the pane at 45% of the terminal, divider included: 72 needs 163 columns or more; at 144–162 it is 63–71 (correction B). The left is C − P − 1 (correction A).
- **RULES** Never stretch prose past 86 columns. The pane may be wider only if Cockpit asks for it; at this width it does not.

The left (127 columns):

```text
    10:14:02 ◆  TURN 7  ──────────────────────────────────────────────────────────────────────────────
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ❯ the width tests fail on CI but pass locally, find out why and fix it
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
          6s ∴  thought   ⣀⣠⣤⣴⣶⣾⣿⣷⣦⣤⣶⣿⣷⣤⣀   ctrl+o expand
             │
             │  CI was on Bun 1.4.1, whose ICU splits a skin-tone modifier into its own grapheme.
             │  The tests and the code were right; the runner was old.
             │
             │  ## What changed
             │  ›  .github/workflows/ci.yml installs Bun from mise.toml, the pin you use locally
             │  ›  hooks/runtime.ts fails fast when Bun is older than the pin
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    YAML   .github/workflows/ci.yml                                   +1 −1     c copy
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │     14  14    - uses: oven-sh/setup-bun@v2
             │     15      −   with: { bun-version: latest }
             │         15  +   with: { bun-version-file: mise.toml }
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    Runner                        Bun   Width tests
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    CI before                   1.4.1   × 2 of 14 fail
             │    CI after                    1.4.4   ✓ 14 pass
             │    Local                       1.4.4   ✓ 14 pass
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
             │    ▲ NOTE   The first CI run after this rebuilds the Bun cache, about a minute longer.
             │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
             │
             │  [1] bun.sh/blog/bun-v1.4.2     [2] github.com/oven-sh/setup-bun
             │
      2m 44s ✓  DONE   ⣀⣤⣴⣶⣿⣶⣤⣴⣿⣷⣤⣀   23 steps · 1 fixed · 3 files · 2 sources · ↗ a1f3c2e
```

The pane (72 columns):

```text
  TIMELINE   FILES 3   SOURCES 2   TODO 5/5   AGENTS 3
  ━━━━━━━━   ───────   ─────────   ────────   ────────

 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  ▐ ✓ DONE ▌  TURN 7                                10:14:02 → 10:16:46
  Width tests fixed; CI now reads Bun from mise.toml
  ▁▂▃▂▄▅▃▂▁▃▅▆▄▃▅▇█▆▇█▆▇▅▄▆▇▅▃▂▁▂▃▄▅▄▃▂▃▄▃▂▁▂▃▂▁
  23 steps    1 fixed    3 agents    3 files                     2m 44s
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

                               10:14          10:17
                               ┬────┬────┬────┬───┬
  × Reproducing the failure    ━━╸                              2 of 14
  └ width("e\u0301") · expected 1, received 2
  ✓ Comparing Bun versions       ━━                       1.4.1 · 1.4.4
  ◇ Audit tests                    ━━━━━━                         clean
  ◇ Audit CI setup                 ━━━━━╸                        no pin
  ◇ Audit dependencies             ━━━━━                         1 high
  ✓ Pinning Bun in ci.yml                ╺━━━                     +1 −1
  ✓ Failing fast on old Bun                 ╺━━╸                    +12
  ✓ Running the width tests                    ━━━              14 pass
  ↗ Pushing the fix                              ╺━             a1f3c2e














                                                      ghostframe v0.1.0
```

## 13. Real-session polish (Phase 12)

Rules found in real sessions after Phase 11. Each applies docked, in fallback and in ctrl+o alike.

### 13.1 What counts as a failure

A step is a **failure** when all of these hold:

- its kind is `test`, `shell`, `edit`, `write` or `agent`; v7's `notebook` kind counts as `edit`. A `fetch` or `search` never is (amendment 6), nor a `read`;
- the tool reported an error (`isError`), or a command exited non-zero;
- it was not blocked (13.7), denied (13.8) or interrupted;
- it is not a negative answer. `grep`, `rg`, `git diff --exit-code` or `--quiet`, `diff`, `cmp`, `test` and `[` exiting 1 mean "no" or "differs"; exit 2 and up are those tools' own errors. The engine hands an errored shell call back as one text with no stderr apart, so the exit code decides; when an outcome does carry `stderr`, a non-empty one makes it a failure. The step is `✓`, with the result `differs` for `diff`, `cmp` and `git diff`, otherwise `no match`.

**The failure key.** Each failure has a key: _program_, _subcommand_, _target_.

- _program_: the first word of the command after stripping the `cd` prefix (13.4) and leading `VAR=value` assignments: `bun`, `git`, `npm`, `pytest`. For `edit` and `write` it is the kind itself. A command joined with `;`, `&&`, `||` or `|` keys on its first command; a `;` or `|` inside quotes, brackets or braces joins nothing.
- In PowerShell, a leading `$name = ` is stripped like `VAR=value` (`$t = Get-Content -Raw a.ts` keys on `Get-Content`), and an assignment that runs no program is skipped like one (`$env:LANG = "C"; bun test` keys on `bun`). The call operator runs the program after it (`& "C:\tools\lint.exe"` keys on `lint`). A statement with no program (an expression such as `[IO.File]::ReadAllText(…)`, a script block, `foreach`, `for`, `while`, `if`) keys on `pwsh` with no target. Bash's own loops and conditionals (`for`, `while`, `until`, `if`, `case`, a `(` or `{` group) key on `bash`.
- _subcommand_: for tools with subcommands (`bun`, `npm`, `pnpm`, `yarn`, `git`, `gh`, `cargo`, `go`, `docker`, `kubectl`), the first argument that is not a flag: `test`, `audit`, `push`. Otherwise empty.
- _target_: the first argument that is a path or a test filter, project-relative (13.2); for `edit` and `write`, the file. Otherwise empty. A redirection (`>`, `>>`, `2>`, `*>`, `2>&1`) and the file it writes to are not arguments, and the value of a folder option (`git -C`, `--cwd`, `--prefix`, `--git-dir`, `--work-tree`) is neither a subcommand nor a target.

| Command                                             | Key                             |
| --------------------------------------------------- | ------------------------------- |
| `cd D:\Projects\ghostframe && bun test hooks/width` | `bun · test · hooks/width`      |
| `bun test hooks/width --rerun`                      | `bun · test · hooks/width`      |
| `npm audit --omit dev`                              | `npm · audit ·`                 |
| `LANG=C.UTF-8 bun test`                             | `bun · test ·`                  |
| edit of `tests/width.test.tsx`                      | `edit · · tests/width.test.tsx` |
| `$t = Get-Content -Raw a.ts; $t.Replace('a', 'b')`  | `Get-Content · · a.ts`          |
| `[IO.File]::ReadAllText("a.ts")`                    | `pwsh · ·`                      |
| `bun run --cwd tools check *> $env:TEMP\g.txt`      | `bun · run ·`                   |

**Fixed.** A failure is fixed when a later step in the same turn succeeds with:

- the same key (a `write` and an `edit` of the same file share it: both leave the file changed); or
- a broader key: the same program and subcommand, and a target that is empty or contains the failed target. `bun test` passing fixes `bun test hooks/width`. `bun test hooks` passing fixes `bun test hooks/width/grapheme.test.tsx`.

An agent's failure is fixed only by the same agent (amendment 13).

**Counting.** Counts are by key, not by attempt. Running the same failing command five times is one failure. The receipt's `n still failing` and `n fixed`, the head card's stats and the failure card's count all count keys.

**Showing.**

- The left draws at most 3 failure rows per turn. Docked, the failure card on the answer lists the keys still failing; with more than 3, its third row reads `+ n more · /steps n`. In fallback a failure row draws as the step settles, once per key, for the turn's first 3 keys to fail; with more, a `+ n more · /steps n` row on the spine above the receipt counts the rest, since a drawn row never changes.
- The pane keeps every `×` group and step.
- A failure row draws when the step settles and never changes (amendment 9). A later fix shows as its own row in the pane and as `1 fixed` in the receipt.

### 13.2 Paths

One formatter for every path Cockpit shows:

1. Normalise separators to `/`.
2. Inside the project root: project-relative, with no leading `./`.
3. Under the home folder and outside the project: `~/` plus the rest. A path given as `~/…` keeps it.
4. Anything else: absolute, as given, with forward slashes.
5. Then cut from the middle to fit (13.5).

| Input (project `D:\Projects\ghostframe`, home `C:\Users\Tashfiq`) | Shows                                    |
| ----------------------------------------------------------------- | ---------------------------------------- |
| `D:\Projects\ghostframe\hooks\runtime.ts`                         | `hooks/runtime.ts`                       |
| `./hooks/runtime.ts`                                              | `hooks/runtime.ts`                       |
| `C:\Users\Tashfiq\.claude\settings.json`                          | `~/.claude/settings.json`                |
| `~/.claude/settings.json`                                         | `~/.claude/settings.json`                |
| `D:\Projects\cockpit-test-settings.json`                          | `D:/Projects/cockpit-test-settings.json` |

The `~` bug from the real sessions: a `~` path must never be resolved against the project, and a project path must never get a `~`. Test both directions, and paths in worktrees (`D:\Projects\ghostframe-<name>`), which are not inside `D:\Projects\ghostframe`.

### 13.3 Notices off the left

Cockpit's own informational notices (plugin loaded, settings read, a seat changed, a probe result) go to the debug log only: `$.ui.log(text, { to: 'debug' })`. On the left Cockpit draws only:

- the output of a command the person typed (one quiet row, 7.15);
- the `/tui` switch notice of amendment 10, once;
- the notices of 7.10 that come from the engine (memory saved, context).

### 13.4 The `cd` prefix

Claude often runs `cd <dir> && <command>`. Steps show the command only.

- Strip leading `cd <dir> && `, `cd <dir>; `, `cd /d <dir> && `, `pushd <dir> && ` and `Set-Location <dir>; `, repeatedly.
- When `<dir>` is not the project root, the step's drawer says `in <dir>` (formatted by 13.2).
- The failure key is taken after stripping (13.1).

`cd D:\Projects\ghostframe && bun test hooks/width` shows `shell  bun test hooks/width`.

### 13.5 Cutting from the middle

A subject that does not fit is cut from the middle with `…`, never from the end:

- A path keeps its first segment and its file name: `hooks/…/width.test.tsx`.
- A URL keeps the host and the last segment: `docs.github.com/…/setup-bun`.
- A command keeps the program, the subcommand and the last argument: `bun test … hooks/width`.
- A title keeps its start: `browser · read the tab s…` (the one case cut at the end, since its start says what it is).

### 13.6 Short result words

Results follow 5.7: at most 14 cells, a noun phrase, never a sentence or an echo of the command. A command whose output is one line of at most 14 cells shows that line (`bun --version` → `1.4.4`). Any other output with no rule here gives the exit as the result (`exit 0` reads `done`, other codes `exit n`). Common outputs:

| Output                                       | Result         |
| -------------------------------------------- | -------------- |
| `bun test`: `14 pass, 0 fail`                | `14 pass`      |
| `bun test`: `12 pass, 2 fail`                | `2 of 14`      |
| `git push`                                   | the short hash |
| `gh pr create`                               | `#23`          |
| `npm audit`: `1 high severity vulnerability` | `1 high`       |
| `npm outdated`: 9 rows                       | `9 outdated`   |
| a formatter: `Formatted 38 files`            | `38 files`     |
| `bun --version`                              | `1.4.4`        |
| `git status`, clean                          | `clean`        |
| an edit of a file not read first             | `not read`     |
| an edit of a file changed since it was read  | `file changed` |
| any other error longer than 14 cells         | `failed`       |
| `ls`: 14 entries                             | `14 entries`   |

### 13.7 `⊘ BLOCKED`

A step is **blocked** when a system refused it, not the tool and not the person:

- a `PreToolUse` hook exited 2 or returned a block decision;
- the auto-mode classifier refused it;
- the sandbox, a settings rule or a policy (the organization's ceiling) denied it.

Blocked steps get `⊘` (warn) in the pane, the result `blocked`, and a detail line naming what refused it: `by a hook · <event> · <reason>`, `by a rule · <rule>`, or `by the classifier`. The hook's script and the classifier's text reach the plugin in no event, so neither is named unless the hook's reason says it. On the left they draw one `⊘  BLOCKED` row. Its `└` line saying what Claude did instead draws only when that is already known as the row draws; live it never is, since rows never change, so screen 13's `└ Claude switched to a branch instead.` shows only on the canvas. They count as `n blocked` in the receipt and the head card, never as failures. The step log gains a `blocked` state for this (amendment 9 noted it had none).

### 13.8 `DENIED`

When the person refuses a permission, the step is **denied**: a row on the left `▍  DENIED   shell rm -rf dist` (`▍` and `DENIED` in err, then the step's kind and command), the result `denied` in the pane. The plugin gets no reason with a denial, so the row names none. A denial is the person's decision, not a failure, and is counted as neither. (Not drawn on the canvas; the row follows v7 E.5.)

### 13.9 One clock

The receipt's label, the pane head's duration and range, the live line's elapsed time and `/steps` all read the turn's time from one source: the step log's start and end of the engine turn. For a typed turn that is the prompt to the end. A report turn an agent started has its own receipt with its own time, so one receipt never shows two durations.

## 14. Build decisions (Phase 12)

- **One palette for Cockpit; the transcript's own stays for Cockpit off.** `hooks/shared/look/palette.ts` holds section 2 and is the only palette any Cockpit-on row draws from; no module of `cockpit/` or `transcript/v8/` imports another. `hooks/shared/tokens.ts` is not a Cockpit palette: it is main's transcript palette, kept unchanged because with Cockpit off every row must draw exactly as on main. `tools/scripts/boundaries.ts` refuses a hex anywhere else, and a status glyph literal in v8's folders outside `shared/look/glyphs.ts`.
- **Section 2 gained the colours the spec already drew with.** 7.3, 7.12 and 8.12 named three hexes section 2 did not list (the trace's low end `#2E3A39`, the wordmark's `#3A4846` and `#56706B`), and the trace's gradient from that low end to `machine` made five more at run time. They are now section 2's `wordmark` and `wordmarkVersion` tokens and its seven trace steps, fixed values rather than a computed blend, so every hex Cockpit draws is listed there.
- **Kind words `ask`, `plan`, `skill` joined 5.6.** `AskUserQuestion`, the plan tools and `Skill` keep v7's words (each within 6 cells): 5.6's list had no word for them, and inventing one would be worse than keeping the known one.
- **One short line is its own result** (13.6). 13.6 listed only `bun --version` → `1.4.4`; it now states the rule that example follows: a one-line output of at most 14 cells shows that line.
- **The home folder.** No engine API gives the home folder; the path formatter takes it when a caller knows it and otherwise recognises `X:/Users/<name>`, `/Users/<name>` and `/home/<name>` (the v7 rule). The project root is checked first, so a project under the home folder never gets a `~`.
- **Negative answers read the exit code** (13.1). 13.1 asked for exit 1 "with nothing on stderr", but the engine hands an errored shell call back as one text, without stderr apart from stdout. So the exit code decides, and a non-empty `stderr` counts only when an outcome carries one. `git diff --quiet` joined `--exit-code`, and `test` and `[` read `no match`, since 13.1 offers only `no match` and `differs`.
- **Blocked against denied** (13.7 now lists the settings rule and the organization's ceiling). A `tool.check` verdict of `deny` on a main-loop call (a `PreToolUse` hook, a settings rule, the organization's ceiling) marks the call blocked, its detail `by a hook · <event> · <reason>` or `by a rule · <rule>`. A refusal in the engine's own person-denial words (the `DENIED` pattern v7 already used) is a denial; any other `deny` (the auto-mode classifier, the sandbox) is blocked. Not verified live: the classifier's exact refusal text.
- **The hook's script name** (7.10, 13.7). The verdict names the hook event (`PreToolUse`) and the reason, never the script, so screen 13's `guard-main.sh` shows only when the hook's reason says it.
- **What Claude did instead** (7.10, 13.7). 13.7 drew the `└` line under `⊘ BLOCKED` whenever Claude did something else. It needs what Claude did next, which is not known when the row first draws, and rows never change, so it now draws only when already known; live, screen 13's `└ Claude switched to a branch instead.` does not draw.
- **One clock is the engine turn's** (13.9). 13.9 said "the turn's start and end"; it is the engine turn's (`segmentStart` to its end). An agent's report turn splits a typed turn into two receipts, each with its own time, so the rule now reads "one receipt never shows two durations".
- **Failure kinds** (13.1). v7's `notebook` kind is an edit for 13.1, so a failed notebook edit is a failure; a failed `read` is not.
- **The left's renderers live by who draws them.** Rows Cockpit owns (receipt, worked node, live line, event rows, slash rows, the failure card) are in `hooks/cockpit/v8/`; rows the transcript's sites draw (turn header, message cards, thought row, the answer's markdown, code, table, note and plan cards) are in `hooks/transcript/v8/`, since the transcript may read Cockpit but Cockpit may not read the transcript. Both build every row with `shared/look/spine.ts`, so the label, spine and text column line up.
- **Cards may run into their right pad** (6.1). 6.1 kept a 2-cell inner pad on every card row; screen 01's note ends on the card's last cell, so a row with nothing held at its right end now may use the right pad.
- **Source line breaks are row breaks** (7.4). Screen 01 breaks after the lead sentence at 86 cells while screen 31 runs the same words on at 78, so a paragraph's own line breaks are kept as row breaks, and only then do words wrap.
- **No blank row under a heading** (7.4). 7.4 asked for one above and below; every screen draws a heading straight onto its list (screens 01, 18), so a blank row now draws only where the answer has a blank line.
- **Nested bullets indent 5 cells** (7.4). 7.4 said 3; screen 18's nested `›` sits 5 cells right of its parent's, under the parent's text, and the screen wins.
- **Inline markers** (7.4, screen 18). 7.4 kept every markdown marker visible; now only heading and list markers stay, dim, and backticks and `**` are dropped, since every screen shows paths and code with no backticks.
- **Table columns** (7.6). 7.6 sized every column to its content; screen 01's first column is a third of the card wide, so the first column now takes a third of the card or its content, whichever is wider.
- **Diff cards come from diff fences and step patches.** A fenced block with the `diff` word (its info naming the path) or one that is a unified diff draws as the diff card; ctrl+o draws the same card from the step's kept patch. The canvas's two gutters sit at 3 and 4 cells after the inner pad, which is what screen 01 measures.
- **The note card.** A paragraph that starts `Note:` (or `**Note:**`) is the note card. 7.7 gives no source for it.
- **Footnotes** (7.4). 7.4 said two per row; the second now sits at the 31st cell, as screens 01 and 23 draw it. Screen 20 puts them 3 cells apart; it is not a screen test here.
- **The braille trace.** A trace's cells are levels 0 to 6, the cell rising or falling by the level before it (`⣠⣴⣾` up, `⣦⣷` down), coloured by section 2's trace steps. Live, steps are bucketed over the turn's time; the screen tests feed each screen's levels, since the canvas's traces are drawn by hand. The thought row's trace is the same fixed shape on every screen: only the duration is known (7.3 now says so).
- **Receipt counts** (7.12). 7.12's list put `blocked` before `files`; screen 13 puts it after, so the list now follows the screens, and gained `n sources, m cited`, `n browser` and `n mcp`.
- **The worked node's counts** (7.13). 7.13 said they were the receipt's; screens 16 and 31 draw others (`23 steps · 3 agents · 1 fixed`, `7 steps · 6 shell · 1 edit`), so the node now counts steps, agents and fixes, or names its two largest step kinds.
- **The failure card's rows** (7.8). The rows' path, line and values come from the test output kept in the step's detail. 7.8 always ended the card with `→ Next:`; it now draws only when Claude's answer gives the next action, since nothing in the engine says it apart from the prose.
- **`c copy` on the left** (7.5, 9.5). 7.5 and 9.5 bound `c` on a code card. A left row can't hold a hotkey without taking the key from the prompt, so the head strip is now a Button: a click copies the block, and `/copy code n` does the same by key (amendment 11).
- **Docked failures** (7.8, 7.10). 13.1 draws failures on the left as the failure card when docked and as failure rows in fallback, so 7.10's `× Batch 6 tests` event row, also on screen 08, now draws in fallback only (not a screen test here).
- **Canvas rows past the text column were corrected** (6.1, section 12). Screens 02, 03, 06, 11, 17, 18, 20, 21, 25, 26 and 27 drew rows longer than the 86-cell text column: answer paragraphs, a prompt card, an agent's brief and a WAITING detail line. Section 12 now shows them as the renderers draw them: paragraphs and cards wrap at 86 cells, and the one-line detail is cut with `…`. Screen 03's test compares every row.
- **The pane's geometry, as measured.** Pane cards run from the second cell to the last but one, content from the third; the drawer from the fifth, content from the seventh, its right-hand facts ending 4 cells before the drawer's edge (screens 03, 04). A selected row is `▐` in accent at the first cell and `surface` across the width.
- **The now-line shows only on a LIVE turn** (8.3). 8.3 said "while the turn is live"; screen 04 (NEEDS YOU) draws none, screens 02, 08, 14 and 15 (LIVE) do, so 8.3 now says `LIVE` and how a bar hides it.
- **The wordmark's column was corrected** (8.12, screens 02, 03). Every pane ends `ghostframe v…` on the last cell but one; screens 02 and 03 drew it one cell further left beside `? keys`. Their hint rows now sit on the same grid as every other screen.
- **The wordmark's version** (8.12). Read once at session start from `.claude-plugin/plugin.json` under `$.plugin.root` with `$.fs.read`, as the engine documents. 8.12 said `dev` before a release; it is now `dev` when the manifest has none or cannot be read. The manifest says `0.2.0`, so live the pane reads `ghostframe v0.2.0`; the screen tests feed the canvas's `0.1.0`.
- **Group titles** (8.3). 8.3 asked for a short title written from the working sentence. The canvas's titles are shorter rewrites (`Reproducing the failure first.` drawn as `Reproducing the failure`), but Cockpit does not rewrite Claude's words, so a title is now the first sentence without its stop, cut at the end to 25 cells.
- **Bars on the screens.** The screen tests read each bar off the screen's track cells as a span on a 40-second turn (one second per half cell), since the canvas gives no step times.
- **The full diff's counts.** Screen 28's head says `+12` over a patch of five added rows: the head carries the file's own counts over the turn, the ones its Files row shows, not the hunks' sum.
- **The full diff's hunk headers name the old lines** (`@@ 18,3 @@`, screen 28); the hunk opened under a Files row names the new ones (`@@ 14,3 @@`, screen 23), which for a hunk that moves no line are the same.
- **Screen 24 has no wordmark** (8.12). Every other pane draws one, and the renderer draws it on every view as 8.12 says; screen 24's last row is keys alone, so its test draws its hint row as the canvas does, through the same key renderer.
- **An agent in view draws no now-line** (8.3, screen 27): its timeline is the agent's, not the live turn's.
- **The change bar** (8.5): 8.5 said "in proportion" without saying to what; it is the turn's largest change.
- **`? keys` was removed** (8.12, 9.5, screens 02 and 03). The engine takes a hotkey only from `a` to `z` and `0` to `9`; a `?` hotkey throws inside the pane's render and the engine draws its own pane instead. Every other key in 9.5 works as specified.
- **The hint row is drawn as text.** The keys themselves are hotkey Buttons with nothing of their own to draw, bound only while the pane holds the keyboard (amendment 7), so the hint row keeps the canvas's exact cells.
- **The pane comes back to the Timeline tab when it loses focus.** The tab, the open drawer and the URL toggle are view state; losing focus resets the view (amendment 7), and the tab with it, so an unfocused pane always shows the live turn's timeline.
- **`m` is bound only while an agent is in view.** It answers with `$.ui.view`, which the engine allows only while an agent's conversation is shown; bound everywhere, it called the engine on every press.
- **The docked worked node sits below the `↗` rows** (7.13, screen 16). 7.13 and screen 16 put it above them; both now show it below. The `↗` rows draw as their calls return (7.10), before the turn ends, and rows never move, so the node now sits directly above the receipt and the receipt tree reads node, then receipt.
- **Fallback's `+ n more` sits above the receipt.** A fallback failure row draws as its step settles and never changes, so its third row cannot count failures that have not happened yet. The first 3 keys draw their rows, a repeat of a key draws none, and the receipt, drawn once the turn ends, has `+ n more · /steps n` above it (13.1). The count is per receipt while the rows are per typed turn; they differ only when an agent's report splits a typed turn.
- **PowerShell's failure keys** (13.1). The spec named only `VAR=value`. This session's own turn (455 steps, 80 errors, most of them exploratory PowerShell) drew 34 rows on v7 and keyed 52 failures on v8 before these rules: `$t = …` keyed on `$t`, `[IO.File]::…` on whatever came first, and each redirected gate run on its output file. With them it keys 19, 15 fixed, 4 still failing (tests/plugin/flood.test.tsx).
- **Redirections and folder options are not targets** (13.1): `bun run --cwd tools check *> $env:TEMP\g.txt` failing and `bun run --cwd tools check > "$TEMP/g.txt"` passing are the same step, so the second must fix the first.
- **A write fixes a failed edit of the same file** (13.1): Claude often follows a refused edit with a write of the whole file, and both leave it changed.
- **Short results for the edit tools' guards** (13.6): `not read` and `file changed`; any other error longer than 14 cells reads `failed`, as 13.6 says a result is never a sentence.
- **ctrl+o uses the narrow text column under 110 columns** (6.1, section 10) and draws Cockpit's turn header and message card for a prompt, not the engine's row, so the full record reads like the quiet left.
- **No output frame in ctrl+o** (section 10). A step line carries its result word and, for an edit, its diff card (7.5); a command's output is in the step's detail in the pane, not repeated on the left.
- **The selected file is the one under the focus ring** (8.5). The pane has no selection of its own; the engine raises `ui.focus` with the row's key each time the ring moves, so the Files tab draws the first hunk under the file the ring is on, and Enter still opens the full diff.
- **The interrupted line draws when the next turn starts** (8.3, screen 06). Esc sends no event a row could draw from, and an interrupted turn raises no TurnDuration; but when the next prompt starts a turn, the step log knows the one before ended aborted or never ended, and keeps its number, steps, files and start for the pane. Its summary says `n files changed`, not the canvas's `renamed`: the step log knows a file changed, not how.
- **`/steps n all` prints at most 20 rows** (7.15). 7.15 set no limit; it now stops at 20, then `… n more`, so one command never floods the transcript; the pane's every-step view shows the rest.
- **The inline inspector's keys** are its own card's key row (8.13); the hint row is not drawn under it, and only the keys it lists are bound.
- **The pinned head's state pill** (8.2). 8.2 showed the top line as `● LIVE` only; it is the live turn's state (`LIVE`, `DONE` or `FAILED`), on its own row above `PINNED`, so a pinned past turn never hides what the session is doing now.
- **`Waiting on n agents`** (7.12, 8.2) is the head card's summary while background agents run after the turn's answer, matching the left's `WAITING` receipt, so the head and the left say the same. 7.12 and 5.5 now describe that receipt.
- **The prompt's rows and the turn's stamp are found apart.** The prompt site draws the header and card from the message alone; which turn number it carries comes from the ledger's stamp, so a row drawn again keeps its number (the turn rule, amendment 10).
- **A step line is width-aware.** It fits the text column it is drawn in (86 cells, or 78 narrow), cutting the subject first and the result word never.
- **The `/copy` phrasing** follows 7.15: `Copied code block 1 · 2 lines · ts`, `There is no code block 3 · the last answer has 2`, `Not copied · <reason>`.
- **`/tui` names worked nodes** (`worked nodes from here`) where v7 said capsules.
- **Engine notices are drawn as `●` rows** (7.10) on the left while Cockpit is on; Cockpit's own diagnostics go to the debug log, never the transcript.
- **What the engine does not give.** The classifier's text for a blocked step is not in any event the plugin receives, so a blocked step names what refused it (`by the classifier`, `by a hook · <event> · <reason>`). A denial carries no reason the plugin can rely on, so `DENIED` names the command alone (13.8); the quoted reason 13.8 once showed was removed.
