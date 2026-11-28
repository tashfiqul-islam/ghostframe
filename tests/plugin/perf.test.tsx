import { expect, test } from 'claude-code/testing'

import { ON, PANE } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { Engine, On } from '../support/engine'
import { fallbackEngine, MIXED, site } from '../support/fallback'
import { aTurn } from '../support/history'
import { respond } from '../support/respond'
import { holdTimers } from '../support/clock'

// What a transcript row costs to draw again in a long session, Cockpit on and the pane docked at 280 columns (a left
// region of 207). The engine draws a row again when the person scrolls (the rows at the viewport's edges) and when the
// prompt grows or shrinks as they type. Each `$.state` read is a round trip to the engine: measured live in Claude Code
// 2.1.332, 2.5 to 3 ms each on an idle machine, whatever the value's size (a one-boolean read took as long as the
// 600-entry flow), and far more while the worker is busy. So a row's cost is its reads, and the budgets count them:
// deterministic on every runner, unlike a clock.
const LONG = { ...ON, timeoutMs: 300_000 }
const COLS = 207
const TURNS = 30

// The reads one draw may make, by row. The flow, the streaming flag, the turn and the running turn are read together,
// so an answer row's 7 reads (the receipts, the kept narration rows when resumed, and the opener's thought after them)
// are at most 4 round trips one after another, about 12 ms at 3 ms each: under a 60 fps frame (16.7 ms). A narration
// row, which draws nothing docked, makes the first 4 and, resumed, the kept narration rows: 2 round trips. Before
// this budget an answer row made 8 reads one after another (10 resumed), and every resumed row read every kept turn.
const ANSWER_READS = 7
const NARRATION_READS = 5
// A prompt row drawn before asks only the prompts' stamps: its number and colour are known from its first draw. Before
// this budget it also read the step log, every step of it, and drew again at each step of the running turn.
const PROMPT_READS = 1
// Values a row never reads: each holds every kept turn's steps, outputs and diffs, megabytes in a long session.
const HEAVY = new Set(['history', 'details'])

const answer = (n: number) => `Turn ${n} is done. CI reads Bun from mise.toml now.

- The Windows job sets \`LANG=C.UTF-8\`.
- The pin moved to \`bun-version-file\`.

| Runner | Bun | Width tests |
| --- | --- | --- |
| CI before | 1.4.1 | 2 of 14 fail |
| CI after | 1.4.4 | 14 pass |`

const prompt = (n: number) => `run every kind of step and explain it, turn ${n}`

/** The state reads seen: how many, their keys, and the round trips they took (a run of reads in flight together is one). */
type Reads = { n: number; keys: string[]; open: number; trips: number }

async function longSession($: Engine, on: On): Promise<{ reads: Reads }> {
  const clock = { now: new Date(2026, 10, 21, 10, 0, 0).getTime() }
  const reads: Reads = { n: 0, keys: [], open: 0, trips: 0 }
  fallbackEngine(on, clock, true)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  holdTimers(on)
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repository' } }) as never)
  on('state.get', async (_, e, next) => {
    reads.n++
    reads.keys.push(e.key)
    if (reads.open++ === 0) reads.trips++
    try {
      return await next(e)
    } finally {
      reads.open--
    }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await (await $.ui.mount(PANE)).unmount()

  for (let n = 1; n <= TURNS; n++) {
    await $.prompt.submit({ text: prompt(n), wait: false, origin: { kind: 'composer' } })
    await $.session.append({
      message: { type: 'user', role: 'user', content: [{ type: 'text', text: prompt(n) }] },
      door: 'prompt',
      origin: { kind: 'composer' },
      uuid: `p${n}`
    } as never)
    await $.turn.start({ text: prompt(n), turnId: `turn${n}` })
    for (const c of MIXED(n)) {
      await $.session.append(respond([text(`Next, ${c.tool} for turn ${n}.`), use(c.id, c.tool, c.input)], `m${n}-${c.id}`))
      await $.tool.call({ tool: c.tool, ...c.input, tool_use_id: c.id } as never)
    }
    await $.session.append(respond([text(answer(n))], `m${n}-answer`))
    clock.now += 1_000
    await $.turn.complete({ answer: answer(n), durationMs: 17_000, isAborted: false, turnId: `turn${n}`, reason: 'answer' })
  }

  return { reads }
}

/** The reads one draw again of a mounted row makes, the most over every row of its kind, and the heavy values read. */
async function readsPerDraw($: Engine, reads: Reads, sites: readonly unknown[]): Promise<{ most: number; heavy: string[] }> {
  let most = 0
  const heavy = new Set<string>()

  for (const s of sites) {
    const row = await $.ui.mount(s as never)
    const before = reads.n
    reads.keys.length = 0
    await row.redraw()
    most = Math.max(most, reads.n - before)
    for (const k of reads.keys) if (HEAVY.has(k)) heavy.add(k)
    await row.unmount()
  }

  return { most, heavy: [...heavy] }
}

/** Each kind's most reads at or under its budget, and no heavy value read; a kind over shows its own count. */
function withinBudget(got: Record<string, { most: number; heavy: string[] }>, budget: Record<string, number>): void {
  expect(got).toEqual(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, { most: Math.min(v.most, budget[k] ?? 0), heavy: [] }])))
}

test('a long session, docked at 280 columns: drawing a transcript row again stays within its reads', LONG, async ($, on) => {
  const { reads } = await longSession($, on)
  const turns = Array.from({ length: TURNS }, (_, i) => i + 1)

  const answers = turns.map(n => site('AssistantMessage', `m${n}-answer`, COLS, { text: answer(n), isFirstOfReply: true }))
  const narration = turns.flatMap(n =>
    MIXED(n).map(c => site('AssistantMessage', `m${n}-${c.id}`, COLS, { text: `Next, ${c.tool} for turn ${n}.`, isFirstOfReply: true }))
  )
  const prompts = turns.map(n => site('UserMessage', `p${n}`, COLS, { text: prompt(n), origin: { kind: 'composer' }, isExpanded: false }))

  withinBudget(
    {
      answer: await readsPerDraw($, reads, answers),
      narration: await readsPerDraw($, reads, narration),
      prompt: await readsPerDraw($, reads, prompts)
    },
    { answer: ANSWER_READS, narration: NARRATION_READS, prompt: PROMPT_READS }
  )
})

/**
 * Each row drawn twice, unchanged: what the second draw did, beside the first, for every row that differs (none, when
 * the second is the cache's).
 */
async function drawnAgain($: Engine, reads: Reads, sites: readonly unknown[]): Promise<{ row: string; trips: number; same: boolean }[]> {
  const off: { row: string; trips: number; same: boolean }[] = []

  for (const s of sites) {
    reads.keys.length = 0
    const row = await $.ui.mount(s as never)
    const first = { keys: reads.keys.toSorted(), tree: JSON.stringify(await row.drawn()) }
    reads.keys.length = 0
    reads.trips = 0
    await row.redraw()
    const same = JSON.stringify(reads.keys.toSorted()) === JSON.stringify(first.keys) && JSON.stringify(await row.drawn()) === first.tree

    if (reads.trips !== 1 || !same) off.push({ row: (s as { requestId: string }).requestId, trips: reads.trips, same })
    await row.unmount()
  }

  return off
}

test('a reply row drawn again unchanged is one round trip: every read its first draw made, at once, and the same tree', LONG, async ($, on) => {
  const { reads } = await longSession($, on)
  const turns = Array.from({ length: TURNS }, (_, i) => i + 1)
  const answers = turns.map(n => site('AssistantMessage', `m${n}-answer`, COLS, { text: answer(n), isFirstOfReply: true }))
  const narration = turns.flatMap(n =>
    MIXED(n).map(c => site('AssistantMessage', `m${n}-${c.id}`, COLS, { text: `Next, ${c.tool} for turn ${n}.`, isFirstOfReply: true }))
  )

  expect(await drawnAgain($, reads, [...answers, ...narration])).toEqual([])
})

test('a resumed session: its rows draw again within the same reads, never reading every kept turn', LONG, async ($, on) => {
  const clock = { now: new Date(2026, 10, 21, 10, 0, 0).getTime() }
  const reads: Reads = { n: 0, keys: [], open: 0, trips: 0 }
  const receipt = (n: number) => ({
    turn: `e${n}`,
    turnNo: n,
    answer: `row-answer-${n}`,
    state: 'done' as const,
    agents: 0,
    steps: 20,
    failures: 0,
    fixed: 0,
    files: 3,
    commit: '',
    open: [],
    durationMs: 61_000
  })
  const turns = Array.from({ length: TURNS }, (_, i) => i + 1)
  const store = new Map<string, unknown>([
    [
      'history:resumed',
      { savedAt: clock.now, turns: turns.map(n => ({ ...aTurn(n, clock.now + n * 100_000), receipts: [receipt(n)], narration: [`row-said-${n}`] })) }
    ]
  ])
  fallbackEngine(on, clock, true)
  on('session.id', () => ({ value: 'resumed' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  on('state.get', (_, e, next) => {
    reads.n++
    reads.keys.push(e.key)

    return next(e)
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await (await $.ui.mount(PANE)).unmount()

  withinBudget(
    {
      answer: await readsPerDraw(
        $,
        reads,
        turns.map(n => site('AssistantMessage', `row-answer-${n}`, COLS, { text: `The answer of turn ${n}.`, isFirstOfReply: true }))
      ),
      narration: await readsPerDraw(
        $,
        reads,
        turns.map(n => site('AssistantMessage', `row-said-${n}`, COLS, { text: `Next, the shell for turn ${n}.`, isFirstOfReply: true }))
      )
    },
    { answer: ANSWER_READS, narration: NARRATION_READS }
  )
})
