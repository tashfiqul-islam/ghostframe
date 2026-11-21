import { expect, test } from 'claude-code/testing'

import { addAgent, endAgent } from '../../hooks/cockpit/agents/roster'
import { paneRows } from '../../hooks/cockpit/fit'
import { endTurn, newLog, newTurn, settleStep, startStep } from '../../hooks/cockpit/steps/log'
import type { Outcome } from '../../hooks/cockpit/steps/log'
import type { RosterAgent, StepLog, TurnWork } from '../../types'
import { W, T0 } from '../support/cockpit'

const ok = (result: unknown): Outcome => ({ result, text: '' })
function step(log: StepLog, id: string, tool: string, input: Record<string, unknown>, outcome: Outcome, at: number, ms = 1_000): StepLog {
  return settleStep(startStep(log, { id, tool, input, at: T0 + at }), { id, tool, input, outcome, at: T0 + at + ms })
}
const turnOne = () => newTurn(newLog(null, null), 't1', T0)
const NO_WORK: TurnWork = { todo: [], isRevised: false, files: [], sources: [], cited: [] }

const crew = (n: number): RosterAgent[] =>
  Array.from({ length: n }, (_, i) => i).reduce<RosterAgent[]>(
    (r, i) => addAgent(r, { id: `a${i}`, call: `c${i}`, parent: null, name: `Agent ${i}`, isBackground: true, at: T0 }),
    []
  )
const withAgents = (log: StepLog, roster: readonly RosterAgent[], rows: number) =>
  paneRows(log, T0 + 5_000, W, rows, false, { roster, work: NO_WORK }).map(row => row.map(p => p.t).join(''))
const twelveSteps = () => {
  let log = turnOne()

  for (let i = 0; i < 12; i++) log = step(log, `s${i}`, 'Read', { file_path: `f${i}.ts` }, ok({ file: { numLines: i } }), i * 1_000)

  return endTurn(log, 12_000)
}

test('[ AGENTS ] sits below [ STEPS ], one blank row between every section (amendment 2)', () => {
  const rows = withAgents(twelveSteps(), crew(3), 40)
  const at = (re: RegExp) => rows.findIndex(r => re.test(r))
  const agents = at(/\[ AGENTS \]/)

  expect(rows[at(/\[ STEPS \]/) - 1]).toBe(' '.repeat(W))
  expect(rows[agents - 1]).toBe(' '.repeat(W))
  expect(rows[agents - 2]).toMatch(/f11\.ts/)
  expect(rows.slice(agents + 1)).toHaveLength(3)
  expect(rows.length).toBeLessThanOrEqual(40)
  for (const row of rows) expect(row.length).toBe(W)
})

test('a short pane: [ AGENTS ] is measured first and gives way, to the agents not done, then to its label', () => {
  let roster = crew(7)

  for (const id of ['a0', 'a1', 'a2', 'a3', 'a4']) roster = endAgent(roster, { id, status: 'completed', text: 'ok', at: T0 })

  // 22 rows: head 2, blank, steps want 3 rows (under 24) plus label and the earlier row; agents keep all 7.
  expect(withAgents(twelveSteps(), roster, 22).filter(r => /^[◇✕] /.test(r))).toHaveLength(7)
  // 13 rows: the 5 done agents go, the 2 running stay.
  const thirteen = withAgents(twelveSteps(), roster, 13)
  expect(thirteen.filter(r => /^[◇✕] /.test(r)).map(r => r.slice(2, 9))).toEqual(['Agent 5', 'Agent 6'])
  expect(thirteen.length).toBeLessThanOrEqual(13)
  // 10 rows: the label alone, still counting; [ STEPS ] keeps its three rows.
  const ten = withAgents(twelveSteps(), roster, 10)
  expect(ten.at(-1)).toMatch(/^┄ \[ AGENTS \] ┄+ 2 running · 5 done$/)
  expect(ten.filter(r => /\.ts/.test(r)).length).toBeGreaterThanOrEqual(3)
  expect(ten.length).toBeLessThanOrEqual(10)
})

test('idle: [ AGENTS ] shows the last turn`s agents frozen; with none it folds away', () => {
  let roster = crew(2)
  roster = endAgent(roster, { id: 'a0', status: 'completed', text: '2 findings', at: T0 + 3_000 })
  roster = endAgent(roster, { id: 'a1', status: 'failed', text: 'context limit', at: T0 + 4_000 })
  const later = (now: number) => paneRows(twelveSteps(), now, W, 40, false, { roster, work: NO_WORK }).map(row => row.map(p => p.t).join(''))

  expect(later(T0 + 60_000)).toEqual(later(T0 + 600_000))
  expect(later(T0 + 60_000).filter(r => /^[◇✕] /.test(r))).toEqual([expect.stringMatching(/ {6}3s$/), expect.stringMatching(/ {6}4s$/)])
  expect(withAgents(twelveSteps(), [], 40).some(r => /AGENTS/.test(r))).toBe(false)
})

// ─── Every section: fold order, blank rows, idle ─────────────────────

const URL = (i: number) => `https://docs.example${i}.com/page`
function fullWork(): TurnWork {
  return {
    todo: ['one', 'two', 'three', 'four', 'five', 'six', 'seven'].map((text, i) => ({
      id: `${i}`,
      text,
      state: i < 3 ? 'completed' : i === 3 ? 'in_progress' : 'pending'
    })),
    isRevised: false,
    files: Array.from({ length: 30 }, (_, i) => ({ path: `hooks/file-${i}.ts`, tag: i === 0 ? 'new' : '', adds: i + 1, dels: i % 2 })),
    sources: Array.from({ length: 8 }, (_, i) => ({ url: URL(i), title: `Page ${i}`, status: i === 7 ? '404' : '200' })),
    cited: [{ url: URL(1), title: 'Page 1' }]
  }
}
function fullRoster(): RosterAgent[] {
  let roster = crew(3)
  roster = endAgent(roster, { id: 'a0', status: 'completed', text: 'ok', at: T0 })
  roster = endAgent(roster, { id: 'a1', status: 'completed', text: 'ok', at: T0 })

  return roster
}
const full = (rows: number) =>
  paneRows(twelveSteps(), T0 + 5_000, W, rows, false, { roster: fullRoster(), work: fullWork() }).map(row => row.map(p => p.t).join(''))

/** Each lower section's rows (its label and what follows, up to the next blank row), by its title; absent ones left out. */
function sections(rows: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}

  rows.forEach((r, i) => {
    const title = /^┄ \[ (\w+)/.exec(r)?.[1]

    if (title === undefined || title === 'NOW' || title === 'LAST' || title === 'STEPS') return

    let n = 1

    while (rows[i + n] !== undefined && (rows[i + n] ?? '').trim().length > 0) n++

    out[title] = n
  })

  return out
}

test('a short pane: the lower sections fold to their labels in E.37`s order, and [ STEPS ] keeps its rows', () => {
  // [ AGENTS ] 4 rows, [ TODO ] 4, [ FILES ] 5, [ SOURCES ] 4, at full.
  const ladder = [
    { AGENTS: 4, TODO: 4, FILES: 5, SOURCES: 4 },
    { AGENTS: 4, TODO: 4, FILES: 5, SOURCES: 1 },
    { AGENTS: 4, TODO: 4, FILES: 1, SOURCES: 1 },
    { AGENTS: 4, TODO: 2, FILES: 1, SOURCES: 1 },
    { AGENTS: 2, TODO: 2, FILES: 1, SOURCES: 1 },
    { AGENTS: 1, TODO: 2, FILES: 1, SOURCES: 1 },
    { AGENTS: 1, TODO: 1, FILES: 1, SOURCES: 1 },
    { AGENTS: 1, TODO: 1, FILES: 1 },
    { AGENTS: 1, TODO: 1 },
    { AGENTS: 1 },
    {}
  ]
  const seen: Record<string, number>[] = []

  for (let rows = 39; rows >= 6; rows--) {
    const drawn = full(rows)
    const now = sections(drawn)

    expect(drawn.length).toBeLessThanOrEqual(rows)
    if (JSON.stringify(seen.at(-1)) !== JSON.stringify(now)) seen.push(now)
  }

  // Every fold the pane makes is the next rung of the ladder, in order.
  let at = 0

  for (const state of seen) {
    const next = ladder.findIndex((l, i) => i >= at && JSON.stringify(l) === JSON.stringify(state))

    expect(next).toBeGreaterThanOrEqual(at)
    at = next
  }

  expect(seen[0]).toEqual(ladder[0])
  expect(seen.at(-1)).toEqual({})
})

test('exactly one blank row between every section, at every height, and the sections in E.37`s order', () => {
  for (let rows = 39; rows >= 8; rows--) {
    const drawn = full(rows)
    const labels = drawn.flatMap((r, i) => (r.startsWith('┄ [ ') ? [i] : []))

    for (const i of labels.slice(1)) {
      expect(drawn[i - 1]?.trim()).toBe('')
      expect(drawn[i - 2]?.trim()).not.toBe('')
    }

    const order = labels.map(i => /^┄ \[ (\w+)/.exec(drawn[i] ?? '')?.[1])
    const want = ['LAST', 'STEPS', 'AGENTS', 'TODO', 'FILES', 'SOURCES'].filter(t => order.includes(t))
    expect(order).toEqual(want)
  }
})

test('idle: every section shows the last turn as it ended; a section with nothing for that turn folds away', () => {
  const allDone = endAgent(fullRoster(), { id: 'a2', status: 'completed', text: 'ok', at: T0 + 2_000 })
  const later = (now: number) => paneRows(twelveSteps(), now, W, 39, false, { roster: allDone, work: fullWork() }).map(r => r.map(p => p.t).join(''))
  expect(later(T0 + 60_000)).toEqual(later(T0 + 900_000))
  expect(Object.keys(sections(later(T0)))).toEqual(['AGENTS', 'TODO', 'FILES', 'SOURCES'])

  const none = paneRows(twelveSteps(), T0, W, 39, false, { roster: [], work: { ...fullWork(), files: [], sources: [], cited: [] } }).map(r =>
    r.map(p => p.t).join('')
  )
  expect(Object.keys(sections(none))).toEqual(['TODO'])
})
