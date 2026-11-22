# Phase 11: agents' work and openable rows, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enter on an `[ AGENTS ]` row opens that agent's conversation and its steps; a source row copies its URL, `u` shows
every URL; a subagent's own steps, files and pages reach the pane, history and the receipt.

**Architecture:** Each roster entry carries its own step log (`RosterAgent.log`), built by the main loop's pure step
functions on the agent's clock; history keeps it with the turn's roster. Agent calls go through the same `tool.call`
observer as the main loop's, minus the main step log: snapshot, detail, work (files, sources, marked `isAgent`), the
agent's log. The pane reads `e.props.view.agentId` (engine) or a pane-local agent view (when the engine refuses).

**Tech Stack:** TypeScript hooks module for Claude Code 2.1.330, `claude-code/testing`, Bun.

**Spec:** `docs/design/cockpit-v7.md` E.13, E.40, E.42 to E.45, F.34, F.41; `docs/design/cockpit-v7-amendments.md` 1, 6 to 10;
the probes of phase 11 (feasibility report). Decisions land as amendment 13.

## Global constraints

- Step counts stay the main loop's (amendment 9). Agents' steps never enter `stepLog.steps`.
- Every optional field keeps its atom's shape tag (`roster-2`, `work-1`, `stepLog-4`, `history-1`): a new tag empties the state.
- Store budget 4 MiB (amendment 8): agents' details trim with their turn's; agents' logs are summary rows (subjects cut at 200).
- A click on a row only opens or says something (amendment 8).
- Boundaries: cockpit files import only cockpit/, shared/, types/.

## Rulings

| #   | Ruling                                                                                                                          | Why                                               | Evidence                                  | Cost if wrong                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| R1  | Agent's steps live on `RosterAgent.log` (+ `logDropped`)                                                                        | goes to history with the roster; no main-log leak | roster already kept per turn and restored | a second store path later                             |
| R2  | An agent step's clock is the agent's own (ms since its start)                                                                   | an agent is its own timeline; the label names it  | `startedAt` on every entry                | a person compares agent and main clocks               |
| R3  | Enter on the agent in view returns to main; Esc at the prompt is not offered (live, it stopped the agent's running shell first) | E.40 "Enter again, or Escape at the prompt"       | live check, phase 11                      | a person who presses Esc stops the agent's shell      |
| R4  | A refused view still lists the agent's kept steps in the pane, with why                                                         | after a resume the engine holds no agent          | probe 1: `no agent under that id`         | a person expects the transcript to switch             |
| R5  | No URL opens from a key: Enter and `c` copy it, Enter says `url copied · no key opens a browser`                                | no API; OSC 8 only on click                       | probe 3                                   | none                                                  |
| R6  | `u` draws each URL as plain text wrapped under its row, not as a `Link`                                                         | the engine's Link fallback prints the URL twice   | hooks/transcript/draw/parts.tsx note      | no click on the URL row                               |
| R7  | `◇` in dim at column 0 marks a file or page an agent touched; set once, never removed                                           | quiet, the roster's glyph                         | E.40                                      | none                                                  |
| R8  | Receipts count agents' files and pages in the first receipt written after they settle                                           | background agents settle between engine turns     | probe 2 timeline                          | a count lands one receipt later than a person guesses |
| R9  | A roster row shows `✕n` (err) for the agent's open edit/command failures; fetch and search are not counted                      | amendment 1 and 6                                 | —                                         | none                                                  |
| R10 | `SubagentHandback` draws no step (UNLISTED)                                                                                     | it is the agent's report, not work                | probe 2                                   | none                                                  |

## Review focus

1. An agent call with no roster entry (a workflow agent, a reload): no step, no crash; files and pages still count.
2. A nested agent's launch settles in its parent's log when the child reports.
3. The same file edited by the main loop and an agent: one FILES row, one diff from the turn's first snapshot.
4. An agent view whose agent left the roster (new typed turn): the pane falls back to the fitted layout.
5. A very long URL in `u`: wrapped rows, no row wider than the pane.

---

### Task 1: an agent's own step log (B1)

**Files:** Modify `types/index.d.ts` (RosterAgent `log?: LogStep[]`, `logDropped?: number`), `hooks/cockpit/agents/roster.ts`,
`hooks/cockpit/steps/kinds.ts` (UNLISTED + `SubagentHandback`), `hooks/cockpit/log.ts`, `hooks/transcript/ledger/calls.ts`.
Test: `tests/cockpit/agents/roster.test.ts`, `tests/cockpit/feature.test.tsx`.

**Produces:** `agentStepEnd(roster, id, end: StepEnd, cwd): RosterAgent[]`; `agentStep` also appends a running row;
`agentLaunchEnd(roster, parent, call, isFailed, at)`; `logAgentStepEnd($, id, e, outcome, cwd)`.

- [ ] Test: `agentStep` then `agentStepEnd` gives `log` `[{ kind: 'edit', subject: 'a.ts', result: '+2 −1', isRunning: false, clock: 3000 }]` for an agent started 3 s before; `SubagentHandback` adds no row; past 500 rows the oldest drop into `logDropped`.
- [ ] Test (feature): an agent's Write settles with `mark: '✕'` on its own log; the main `[ STEPS ]` has only the launch row.
- [ ] Implement with `startStep`/`settleStep`/`endLaunched` over a log built from the agent (`newLog(null, startedAt)`).
- [ ] calls.ts: agent branch awaits `next(e)`, then `logAgentStepEnd` in `finally`; `logAgentEnd` settles a nested launch in the parent's log.
- [ ] Run `bun run --cwd tools test`; commit `feat(hooks): cockpit agents keep their own steps`.

### Task 2: agents' files and pages (B2, B4 for fetches)

**Files:** `types/index.d.ts` (`FileChange.isAgent?`, `SourcePage.isAgent?`), `hooks/cockpit/sections/files.ts`,
`hooks/cockpit/sections/sources.ts`, `hooks/cockpit/work.ts`, `hooks/cockpit/log.ts`. Test: `tests/cockpit/sections/*.test.ts`, `tests/cockpit/work.test.tsx`.

**Produces:** `noteFiles(..., isAgent = false)`, `noteSources(..., isAgent = false)`, `noteWork($, tool, input, outcome, cwd, isAgent = false)`.

- [ ] Test: an agent Edit and a main Edit of one file: one row, adds summed, `isAgent: true`; row draws `◇ ` at column 0.
- [ ] Test: an agent WebFetch 404: page status `404` err, `◇` mark, no `still failing` row, main log unchanged.
- [ ] Test: the agent's Edit snapshots the file before it runs (the diff view shows the turn-start content against now).
- [ ] Implement; `logAgentStep` calls `snapshotBefore`, `noteStart`; `logAgentStepEnd` calls `noteEnd`, `noteWork(..., true)`.
- [ ] Commit `feat(hooks): cockpit FILES and SOURCES hold agents' work`.

### Task 3: counts (B3)

**Files:** `types/index.d.ts` (`StepLog.agentWork?: { files: string[]; pages: string[] }`), `hooks/cockpit/steps/log.ts`, `hooks/cockpit/log.ts`. Test: `tests/cockpit/steps/log.test.ts`, `tests/plugin/fallback.test.tsx`.

- [ ] Test: `receiptOf` with main edits `a.ts` and `agentWork.files` `['a.ts','b.ts']`, `pages` `['example.com']` → `files: 2`, `sources: 1`, `steps` the main count.
- [ ] Test: the same turn's receipt reads the same counts docked and at 100 columns.
- [ ] Implement `noteAgentWork(log, kind, subject)`; `logTurnEnd` clears `agentWork` after the receipt; `newTurn` carries it.
- [ ] Commit `feat(hooks): cockpit receipts count agents' files and pages`.

### Task 4: a failed agent step in `[ AGENTS ]` (B4)

**Files:** `hooks/cockpit/agents/rows.ts`. Test: `tests/cockpit/agents/rows.test.ts`.

- [ ] Test: an agent whose log holds an open `edit` failure draws `✕1` in err before its count; a failed fetch draws none.
- [ ] Implement with `isOpen` over `a.log`. Commit `feat(hooks): cockpit roster marks an agent's open failures`.

### Task 5: Enter on an agent opens its conversation (A1)

**Files:** `hooks/cockpit/agents/rows.ts` (`agentLines` with ids `agent:<id>`), `hooks/cockpit/fit.ts` (`agent` option), `hooks/cockpit/keys/view.ts`
(View `{ kind: 'agent'; id; note }`, `openRow` for `agent:`, `noteViewed`), `hooks/cockpit/keys/draw.tsx` (onPress returns the promise; keys for `agent`),
`hooks/cockpit/pane.tsx`. Test: `tests/cockpit/keys/view.test.tsx`.

- [ ] Test: pressing `agent:ag-x` calls `$.ui.view({ agentId: 'ag-x' })`; with `view: { agentId: 'ag-x' }` the pane's label is `┄ [ STEPS · AGENT Edit note ] ┄…` with the agent's rows and a note `  agent's steps · enter on its row or esc at the prompt: main`; pressing it again calls `$.ui.view({})`.
- [ ] Test: a refused view (`{ deny: 'no agent under that id' }`) shows the same label with `  conversation not held · b: back`; `b` returns to the fitted layout.
- [ ] Implement; commit `feat(hooks): cockpit opens an agent's conversation`.

### Task 6: sources open, copy, `u` (A2)

**Files:** `hooks/cockpit/sections/sources.ts` (`sourceLines`, ids `source:<url>`, URL rows when whole), `hooks/cockpit/fit.ts`, `hooks/cockpit/keys/view.ts`. Test: `tests/cockpit/sections/sources.test.ts`, `tests/cockpit/keys/view.test.tsx`.

- [ ] Test: `u` lists each page then its URL wrapped at `width - 4` from column 4, dim; no row past `width`.
- [ ] Test: Enter on `source:<url>` copies the URL and says `url copied · no key opens a browser`; `c` on the ring copies it; nothing is submitted.
- [ ] Implement; commit `feat(hooks): cockpit sources copy their URL and u shows them`.

### Task 7: history and resume (B5)

**Files:** `hooks/cockpit/history/record.ts`. Test: `tests/cockpit/history/record.test.ts`, `tests/cockpit/resume.test.tsx`.

- [ ] Test: `recordOf` keeps details of roster log steps; cuts roster log subjects at 200; `trimmed` empties their excerpts.
- [ ] Test: after a restart, the roster's log, files' and pages' `isAgent` come back; Enter on the agent shows its kept steps.
- [ ] Implement; commit `feat(hooks): cockpit keeps agents' steps in history`.

### Task 8: amendment 13, feasibility notes, gate, live check, PR

- [ ] Amendment 13 (rulings above, probe evidence); feasibility: phase 11 probes; E.40 row updated.
- [ ] `bun run --cwd tools check` passes; live ConPTY check at 200 and 100 columns and after `--continue`; PR; fast-forward `D:\Projects\ghostframe`.
