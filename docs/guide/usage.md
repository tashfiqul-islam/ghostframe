# Usage

Cockpit splits the screen: the conversation on the left, the work on the right. The status line sits under the
prompt. The [spec](../design/cockpit.md) has every rule; this page is the short version.

## The left

The left holds the conversation only.

- A **turn header** opens each turn: its clock, `◆`, `TURN n`. After a compact, a resume or a rewind it says so:
  `TURN 7 · AFTER REWIND`.
- **Your message** is a card under it.
- **Claude's answer** draws as it arrives, block by block.
- **Event rows** mark what matters as it happens: `↗ committed a1f3c2e …` for anything that leaves the machine, `×`
  rows for failures, `⊘ BLOCKED` when a hook or rule refuses a step, `DENIED` when you do.
- The **live line** at the bottom says what is running.
- A **receipt** ends the turn: how long it took, `DONE` or `FAILED`, and its counts (steps, fixed failures, files,
  agents, the commit).

A failure row never changes after it draws. A later fix shows as its own step, and as `1 fixed` in the receipt.

## The pane

The pane docks to the right. Its five tabs:

| Tab      | Shows                                                                                    |
| -------- | ---------------------------------------------------------------------------------------- |
| Timeline | The turn's head card, then every step on a time track, grouped, with each step's result. |
| Files    | The files the turn changed, with `+`/`−` counts. `enter` opens a file's diff.            |
| Sources  | The pages the turn read: cited pages first with their footnote number, then the rest.    |
| Todo     | Claude's to-do list for the turn.                                                        |
| Agents   | The agents the turn started, each with its own steps.                                    |

The pane follows the live turn. Press `p` and `n` to look at earlier turns, `l` to come back. See [Keys](keys.md).

## Fallback

The pane docks on its own from 144 columns in fullscreen. From 110 to 143 it docks once you ask with `/cockpit` or
`/steps`. Narrower than that, or outside fullscreen, Cockpit uses **fallback** on the left: a worked node for each
stretch of work with its counts, a row for each failure, and the live step. `/steps n` then opens one card above
the prompt.

## The full record

`ctrl+o` is Claude Code's own view of the turn. The engine hides the pane while it is open; Cockpit draws each step
with its result and, for an edit, its diff.

## Commands

| Command        | Does                                                                  |
| -------------- | --------------------------------------------------------------------- |
| `/cockpit`     | Opens or closes the pane.                                             |
| `/steps n`     | Pins turn n into the pane. `/steps` alone goes back to the live turn. |
| `/steps n all` | Prints turn n's steps on the left, at most 20 rows.                   |
| `/copy`        | Copies a code block of the last answer: `/copy code 1`.               |

A pin is released by a typed prompt, `/steps` alone, `l`, or pinning the live turn.

## The status line

Two rows, from left to right:

- **the ghost**, whose eyes show the highest of your context, 5-hour and weekly use: green under 60%, amber from
  60%, red from 85%;
- **the model** and its effort;
- **the repository** and branch;
- **your changes**, or the pull request that needs you;
- **context**, the **5-hour** and **weekly** budgets, each with its meter, pace and reset time.

Below 90 columns it draws one plain line. The [status line spec](../design/statusline.md) has the details.
