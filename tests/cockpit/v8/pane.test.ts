import { expect, test } from 'claude-code/testing'

import { foldGroups, groupsOf, paneResult, titleOf } from '../../../hooks/cockpit/v8/groups'
import type { TimedStep } from '../../../hooks/cockpit/v8/groups'
import { columns, tabRows, timelineRows, track } from '../../../hooks/cockpit/v8/pane'
import type { Group } from '../../../hooks/cockpit/v8/pane'
import { TOKEN } from '../../../hooks/shared/look/palette'
import type { LogStep } from '../../../types'
import { shown } from '../../support/screens'

const step = (id: string, kind: string, result: string, extra: Partial<LogStep> = {}): LogStep => ({
  id,
  kind,
  subject: id,
  key: `${kind} · · ${id}`,
  result,
  mark: '',
  isRunning: false,
  clock: 0,
  ...extra
})
const timed = (s: LogStep, start: number, end: number | undefined): TimedStep => ({ step: s, start, end })
const text = (parts: readonly { t: string }[]) => parts.map(p => p.t).join('')

test('8.1: `—` when there is no to-do list, `0` when there is nothing yet', () => {
  expect(shown(tabRows('files', { files: 0, sources: 0, todo: undefined, agents: 0 }))[0]).toBe('  TIMELINE   FILES 0   SOURCES 0   TODO —   AGENTS 0')
})

test('6.2: below 72 columns the result shrinks first, to 14, then the track, to 12', () => {
  expect(columns(72)).toEqual({ title: 25, track: 20, result: 20 })
  expect(columns(66)).toEqual({ title: 25, track: 20, result: 14 })
  expect(columns(63)).toEqual({ title: 25, track: 17, result: 14 })
})

test('8.3: bars on half cells; the now-line in the empty cells while live', () => {
  expect(text(track({ from: 0, to: 5_000, color: TOKEN.barDone }, 40_000, 20))).toBe('━━╸                 ')
  expect(text(track({ from: 9_000, to: 13_000, color: TOKEN.barDone }, 40_000, 20))).toBe('    ╺━╸             ')
  expect(text(track(undefined, 40_000, 20, 19))).toBe('                   ┊')
  expect(text(track({ from: 38_000, to: 40_000, color: TOKEN.accent }, 40_000, 20, 19))).toBe('                   ━')
})

test('8.3: groups from working sentences, their outcome, bar and decisive result', () => {
  const red = step('t1', 'test', '2 of 14 fail', { mark: '✕', key: 'bun · test · hooks/width' })
  const steps = [
    timed(step('r1', 'read', '96 lines'), 0, 1_000),
    timed(red, 1_000, 4_000),
    timed(step('e1', 'edit', '+1 −1'), 5_000, 6_000),
    timed(step('p1', 'shell', 'a1f3c2e', { mark: '↗' }), 7_000, 8_000),
    timed(step('t2', 'test', 'running', { isRunning: true }), 9_000, undefined)
  ]
  const groups = groupsOf(
    steps,
    [
      { text: 'Reproducing the failure.', at: 0 },
      { text: 'Pinning Bun in ci.yml. Then the guard.', at: 2 },
      { text: 'Pushing the fix.', at: 3 },
      { text: 'Running the width tests', at: 4 }
    ],
    12_000,
    new Map([['t1', 'width("e\\u0301") · expected 1, received 2']])
  )

  expect(groups.map(g => [g.glyph, g.title, g.result, g.tone])).toEqual([
    ['failed', 'Reproducing the failure', '2 of 14', 'err'],
    ['ok', 'Pinning Bun in ci.yml', '+1 −1', 'dim'],
    ['shipped', 'Pushing the fix', 'a1f3c2e', 'dim'],
    ['live', 'Running the width tests', 'running', 'accent']
  ])
  expect(groups[0]).toMatchObject({ bar: { from: 0, to: 4_000, color: TOKEN.err }, detail: 'width("e\\u0301") · expected 1, received 2' })
  expect(groups[3]?.bar).toEqual({ from: 9_000, to: 12_000, color: TOKEN.accent })
  expect(titleOf('Hook 3 of 6 · quiet.tsx')).toBe('Hook 3 of 6 · quiet.tsx')
  expect(paneResult('2 of 14 fail')).toBe('2 of 14')
})

test('8.3: folding from the top, never the live group or an open failure; the fold counts its steps', () => {
  const g = (id: string, glyph: Group['glyph']): Group => ({ id, glyph, title: id, bar: { from: 0, to: 1_000, color: TOKEN.barDone }, result: '', tone: 'dim' })
  const groups = [g('a', 'ok'), g('b', 'failed'), g('c', 'ok'), g('d', 'ok'), g('e', 'live')]
  const folded = foldGroups(
    groups,
    4,
    new Map([
      ['a', 100],
      ['c', 114]
    ])
  )

  expect(folded.map(x => [x.glyph, x.title, x.result])).toEqual([
    ['folded', 'Earlier work', '214 steps'],
    ['failed', 'b', ''],
    ['ok', 'd', ''],
    ['live', 'e', '']
  ])
  expect(shown(timelineRows(folded.slice(0, 1), 40_000, 72, true))[0]).toBe('  ┊ Earlier work               ╸                  ┊           214 steps')
})

test('8.3: a title drops the answer`s inline markers, as 7.4 does (live check, step 7)', () => {
  expect(titleOf('Repo tiny: `src/width.ts` and one **test** file. Launching three audits.')).toBe('Repo tiny: src/width.ts and one test file')
})

test('5. with a working sentence, the passing rerun of a failure is its own ✓ row, not inside the next group (live, step 1)', () => {
  const step = (id: string, kind: string, subject: string, result: string, mark: '✕' | '✓' | '' | '±', at: number) => ({
    step: { id, kind, subject, key: kind === 'test' ? 'bun · test ·' : `${kind} · · src/width.ts`, result, mark, isRunning: false, clock: at },
    start: at,
    end: at + 500
  })
  const steps = [
    step('t1', 'test', 'bun test', '2 of 3 fail', '✕', 0),
    step('w1', 'write', 'src/width.ts', '+2 −2', '', 1_000),
    step('t2', 'test', 'bun test', '3 pass', '✓', 2_000),
    step('c1', 'shell', 'git commit -m "fix"', 'e59cf61', '±', 3_000)
  ]
  const groups = groupsOf(steps, [{ text: 'Bun built-in matches all three. Fixing.', at: 1 }], 4_000)

  expect(groups.map(g => [g.glyph, g.result])).toEqual([
    ['failed', '2 of 3'],
    ['ok', '+2 −2'],
    ['ok', '3 pass'],
    ['shipped', 'e59cf61']
  ])
  // The rerun's row names its own step, not the sentence that holds it (live, round 6: `✓ Bun's built-in stringWid…`).
  expect(groups[2]?.title).toBe('test bun test')
})

test('round 6, 4. a launch row reads `3 agents launched`; an agent`s time is live while it runs, ok or err once it ends', () => {
  const at = (id: string, start: number, extra: Partial<LogStep> = {}) => ({
    step: step(id, 'agent', '', { subject: '3 launched', ...extra }),
    start,
    end: undefined
  })
  const [launch] = groupsOf([at('l1', 0, { isRunning: true, calls: ['a', 'b', 'c'] })], [], 8_000)
  expect(launch?.title).toBe('3 agents launched')
  const [one] = groupsOf([at('l2', 0, { isRunning: true, subject: '1 launched', calls: ['a'] })], [], 8_000)
  expect(one?.title).toBe('1 agent launched')

  const group: Group = {
    glyph: 'live',
    title: '3 agents launched',
    result: 'running',
    tone: 'accent',
    agents: [
      { name: 'Audit src', isFailed: false, isRunning: true, result: '2s' },
      { name: 'Audit tests', isFailed: false, isRunning: false, result: '3s' },
      { name: 'Audit package.json', isFailed: true, isRunning: false, result: '4s' }
    ]
  }
  const parts = timelineRows([group], 8_000, 72, true).flat()
  const colorOf = (t: string) => parts.find(p => p.t === t)?.color

  expect([colorOf('2s'), colorOf('3s'), colorOf('4s')]).toEqual([TOKEN.accent, TOKEN.ok, TOKEN.err])
})
