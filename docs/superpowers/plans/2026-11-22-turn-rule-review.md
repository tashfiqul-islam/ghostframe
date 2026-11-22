# Turn rule review fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three review points on PR #21: prompts typed mid-turn, the agent roster after a resume, and store trimming of the prompts' stamps with history.

**Architecture:** A stamp's number is written only when its turn starts; a rule drawn earlier predicts it from the step log at draw time. A prompt typed over a running turn keeps that turn's id (`over`); delivered into it, it is a steer row (E.20); started as its own turn, it is numbered then. The agent check reads every kept turn's roster, from the store before the session starts. The history budget counts each session's `prompts:<id>` with its `history:<id>` and evicts both together.

**Tech Stack:** TypeScript, Bun, the `claude-code` plugin engine and its `claude-code/testing` harness.

**Spec:** `docs/design/cockpit-v7.md` E.1, E.20, E.40, E.45; `docs/design/cockpit-v7-amendments.md` amendments 8, 9 and 12.

## Global Constraints

- The gate is `bun run --cwd tools check`, including the debug-row check.
- Cockpit off draws exactly as before.
- No number appears twice or is skipped; a number is claimed only when a turn starts.
- Turn numbers come from stored values (`turnNo`), never from array positions.
- The store's budget is `STORE_MAX` (4 MiB) less the margin.

## Review Focus

- A prompt typed mid-turn whose turn then ends with no tool boundary: it must start its own turn with the next number, live evidence `door=queue`, then `door=prompt` and `turn.start` after `turn.complete`.
- A prompt folded into the running turn: `door=delivery` (an attachment row, its uuid the row the engine draws); no rule, no number, and the next typed turn is not skipped.
- An agent report turn starting while a mid-turn prompt waits: it must not take that prompt's stamp.
- A resumed session whose agents ran in an early turn only: their notice and message rows stay hidden, drawn before `session.start`.
- A store whose other session's history is evicted: its `prompts:` key goes too; an orphan `prompts:` key (Cockpit off) is evictable.

---

### Task 1: Mid-turn prompts

**Files:**

- Modify: `types/index.d.ts` (PromptStamp: `over?: string`, `steerMs?: number`)
- Modify: `hooks/transcript/ledger/turns.ts`, `hooks/transcript/ledger/session.ts`, `hooks/transcript/ledger/state.ts`, `hooks/transcript/sites/prompt.tsx`
- Test: `tests/transcript/ledger/stamps.test.ts`, `tests/transcript/sites/prompt.rule.test.tsx`, `tests/plugin/turn-numbers.test.tsx`

**Interfaces:**

- Produces: `stampText(text: string): string` (trimmed, cut at 200) and `isSameText(a: string, b: string): boolean` in `state.ts`; `isPendingStart(s: PromptStamp): boolean` in `turns.ts`.

- [ ] Tests: folded (`door=delivery`) prompt draws `you` row with no rule and `steer · 4s` on the time edge; the next typed turn is `TURN 2`; an agent report turn while a prompt waits takes no number. Queued own turn: `door=queue`, `turn.complete`, `door=prompt`, `turn.start` → `TURN 2`, the next → `TURN 3`. Stored stamps hold `turnNo` only after `turn.start`.
- [ ] Run, see them fail.
- [ ] Implement: submit stores no number; mid-turn submit sets `over` and leaves `unclaimedSubmit` alone; `door=delivery` notes row and `steerMs`; `turn.start` takes `unclaimedSubmit`, else the stamp `over` a turn with a row, no `steerMs` and the same text; the rule predicts `log.turnNo` when the log started from the stamp, `log.turnNo + 1` when pending.
- [ ] Run, see them pass. Commit.

### Task 2: Roster after a resume

**Files:**

- Modify: `types/index.d.ts` (RosterAgent `called?: string[]`), `hooks/cockpit/agents/roster.ts`, `hooks/cockpit/feature.ts`, `hooks/cockpit/history/store.ts`, `hooks/cockpit/left.tsx`, `hooks/cockpit/fallback/draw.tsx`, `hooks/transcript/sites/prompt.tsx`
- Test: `tests/plugin/turn-numbers.test.tsx` (docked and fallback)

**Interfaces:**

- Produces: `storedRecordList($): Promise<TurnRecord[]>` (store.ts, read once); `keptAgents($): Promise<RosterAgent[]>` (left.tsx).

- [ ] Tests: resumed store with an agent in turn 1 only, rows drawn before `session.start` and after: the `task-notification` row and the `peer` row (from `Explore`) draw nothing docked; in fallback the notice draws nothing for a done agent. Engine `agent.list` empty.
- [ ] Run, see them fail. Implement. Run, pass. Commit.

### Task 3: Store trimming

**Files:**

- Modify: `hooks/cockpit/history/record.ts` (Kept `extra`, `companion`), `hooks/cockpit/history/store.ts`, `hooks/cockpit/log.ts` (`seedTurnNo`), `hooks/transcript/ledger/state.ts`
- Test: `tests/cockpit/history/record.test.ts`, `tests/cockpit/history/store.test.tsx`, `tests/plugin/turn-numbers.test.tsx`

- [ ] Tests: planBudget counts `extra`; deleting another session deletes its `prompts:` key; an orphan `prompts:` key is evicted as a session with no turns; a store so full only the latest turn is kept: rules 1..3, `[ LAST ] turn 3`, `/steps 3 all` shows turn 3, `/steps 1` says no step log for turn 1; after a resume with no history but stamps up to 3, the next turn is `TURN 4`.
- [ ] Run, see them fail. Implement. Run, pass. Commit.

### Task 4: Amendment 12, gate, live check, PR

- [ ] Record findings in amendment 12. Gate. Live check in ConPTY at 200 and 100. Push to `turn-rule`; update PR #21 body. Fast-forward `D:\Projects\ghostframe` last.
