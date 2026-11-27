import { expect, test } from 'claude-code/testing'

import { assemblePane } from '../../../hooks/cockpit/rows/assemble'
import type { PaneInput } from '../../../hooks/cockpit/rows/assemble'
import { newLog } from '../../../hooks/cockpit/steps/log'
import { aTurn } from '../../support/history'

const text = (i: PaneInput) => assemblePane(i).lines.map(l => l.parts.map(p => p.t).join(''))

const input = (over: Partial<PaneInput>): PaneInput => ({
  width: 72,
  rows: 40,
  now: 0,
  isFocused: false,
  isCovered: false,
  log: newLog(null, null),
  roster: [],
  work: { todo: [], isRevised: false, files: [], sources: [], cited: [] },
  details: [],
  flow: [],
  pinned: undefined,
  view: { kind: 'fit' },
  tab: 'timeline',
  isUrlsShown: true,
  viewed: undefined,
  version: 'dev',
  ...over
})

test('8.2: a turn whose start is not known shows `—` for its range, never the clock`s zero (06:00:00 at UTC+6)', () => {
  // A turn number with no start: a log carried on after the module that started it was reloaded, idle, nothing ended.
  const rows = text(input({ log: { ...newLog('e3', null), turnNo: 3 } }))
  const head = rows.find(r => /TURN 3/.test(r)) ?? ''

  expect(head).toMatch(/TURN 3 +— *$/)
  expect(rows.some(r => /\d\d:\d\d:\d\d/.test(r))).toBe(false)
})

test('8.2: a kept turn with no start, shown pinned, is `—` too', () => {
  const pinned = { ...aTurn(2, 0), startedAt: null }
  const rows = text(input({ log: { ...newLog('e3', null), turnNo: 3 }, pinned }))

  expect(rows.find(r => /PINNED/.test(r) || /TURN 2/.test(r))).toMatch(/— *$/)
})
