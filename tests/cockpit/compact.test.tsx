import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import type { Engine, On } from '../support/engine'
import { aTurn } from '../support/history'
import { liveEngine, liveTurn, MANUAL } from '../support/live'
import { holdTimers } from '../support/clock'

// A compaction takes the rows before its summary out of the conversation: `$.session.messages({ after })` finds none
// of them, as it finds none after a rewind. The pane must tell the two apart, and keep the session it has drawn.
const LONG = { ...ON, timeoutMs: 120_000 }

/** Every row turns 1 to `to` stored: the prompts, Claude's blocks and its calls, as `liveTurn` appends them. */
function rowsUpTo(to: number): string[] {
  return Object.entries(MANUAL.turns)
    .filter(([n]) => Number(n) <= to)
    .flatMap(([n, t]) => [t.row, ...t.events.map((_, i) => `t${n}-b${i}`), ...t.events.map((_, i) => `t${n}-c${i}`)])
}

/** The docked pane's rows. */
async function paneRows($: Engine): Promise<string[]> {
  const pane = await $.ui.mount(PANE)
  const texts = (await pane.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await pane.unmount()

  return texts
}

/** Waits past the pane's rewind check (every 1.5 s, wall clock), drawing the pane each time so the check runs. */
async function pastRewindChecks($: Engine, checks: number): Promise<void> {
  for (let k = 0; k < checks; k++) {
    const until = Date.now() + 1_600

    while (Date.now() < until) await Promise.resolve()
    await paneRows($)
  }
}

/** The engine's store, held in a map the test can read. */
function storeIn(on: On, store: Map<string, unknown>): void {
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
}

async function compactedSession($: Engine, on: On, store = new Map<string, unknown>()): Promise<{ clock: { now: number }; gone: Set<string> }> {
  const gone = new Set<string>()
  storeIn(on, store)
  on('session.id', () => ({ value: 'compacted' }))
  const clock = { now: T0 }
  liveEngine(on, clock, true, MANUAL, gone)
  const summary = { role: 'user', text: 'This session is being continued from a previous conversation.', toolUses: [] }
  on('session.compact', () => ({ messages: [summary] as never }))
  on('ui.log', () => ({ value: undefined }))
  holdTimers(on)
  await $.session.start({ cwd: String.raw`D:\Projects\cockpit-live`, surface: 'terminal', isInteractive: true } as never)
  await (await $.ui.mount(PANE)).unmount()
  for (let n = 1; n <= 6; n++) await liveTurn($, clock, n, 200, MANUAL)

  // Compacted while idle: the summary replaces every row before it.
  for (const row of rowsUpTo(6)) gone.add(row)
  await $.session.compact({ trigger: 'auto', messages: [summary] } as never)

  return { clock, gone }
}

test('compacted while idle: the pane keeps the last turn, its number, its time and its counts', LONG, async ($, on) => {
  await compactedSession($, on)
  const before = await paneRows($)
  await pastRewindChecks($, 3)
  const after = await paneRows($)

  expect(after.find(r => /TURN \d/.test(r))).toBe(before.find(r => /TURN \d/.test(r)))
  expect(after.find(r => /TIMELINE/.test(r))).toBe(before.find(r => /TIMELINE/.test(r)))
  expect(after.some(r => /\b0\d:00:00 → /.test(r) && !before.some(b => b === r))).toBe(false)
})

test('compacted while idle: the next typed turn takes the next number, AFTER COMPACT', LONG, async ($, on) => {
  const { clock } = await compactedSession($, on)
  const before = (await paneRows($)).find(r => /TURN \d/.test(r))
  const shown = Number(/TURN (\d+)/.exec(before ?? '')?.[1])
  await pastRewindChecks($, 3)

  clock.now = T0 + 9_000_000
  await $.prompt.submit({ text: 'say hello', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'say hello', turnId: 'tnew' })

  expect(await paneRows($)).toContainEqual(expect.stringMatching(new RegExp(String.raw`^ {2}▐ ● LIVE ▌ {2}TURN ${shown + 1} `)))
})

test('compacted: the store`s copy of every kept turn says so, for a resume', LONG, async ($, on) => {
  const store = new Map<string, unknown>()
  await compactedSession($, on, store)
  const kept = [...store].filter(([k]) => k.startsWith('history:')).map(([, v]) => v) as { turns: { receipts: { isCompacted?: true }[] }[] }[]
  const receipts = kept.flatMap(k => k.turns.flatMap(t => t.receipts))

  expect(receipts.length).toBeGreaterThan(0)
  expect(receipts.every(r => r.isCompacted === true)).toBe(true)
})

test('/resume after a compaction: the kept turns stay, though none of their rows are in the conversation', LONG, async ($, on) => {
  const store = new Map<string, unknown>()
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
    durationMs: 61_000,
    isCompacted: true as const
  })
  store.set('history:resumed', { savedAt: T0, turns: [1, 2, 3].map(n => ({ ...aTurn(n, T0 + n * 100_000), receipts: [receipt(n)] })) })
  on('clock.now', () => ({ value: T0 + 999_000 }))
  holdTimers(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.log', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'resumed' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // Every row before the summary is gone: a read after any of them is denied.
  on('session.messages', (_, e) => ({ value: e.after === undefined ? [] : { deny: 'gone' } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  storeIn(on, store)
  on('agent.list', () => ({ value: [] as never }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await pastRewindChecks($, 2)

  expect(await paneRows($)).toContainEqual(expect.stringMatching(/^ {2}▐ ✓ DONE ▌ {2}TURN 3 /))
})
