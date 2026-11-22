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
