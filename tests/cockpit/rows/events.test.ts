import { expect, test } from 'claude-code/testing'

import { blockedRow, capFailures, deniedRow, detailRow, failureRow, insteadRows, moreParts } from '../../../hooks/cockpit/rows/events'
import type { LogStep } from '../../../types'
import { GLYPH } from '../../../hooks/shared/look/glyphs'
import { TOKEN } from '../../../hooks/shared/look/palette'
import { NO_LABEL, SPINE, rowText, spineRow } from '../../../hooks/shared/look/spine'

test('13.7: the ⊘ BLOCKED row and its └ line, as screen 13 draws them', () => {
  const row = blockedRow(12_000, 'by a hook · PreToolUse · guard-main.sh · commits to main are not allowed', 86)

  expect(rowText(row)).toBe('         12s ⊘  BLOCKED   by a hook · PreToolUse · guard-main.sh · commits to main are not allowed')
  expect(rowText(detailRow('Claude switched to a branch instead.', 86))).toBe('             │  └ Claude switched to a branch instead.')
  expect(row.find(p => p.t === GLYPH.blocked)?.color).toBe(TOKEN.warn)
  expect(row.find(p => p.t === 'BLOCKED')).toMatchObject({ color: TOKEN.warn, bold: true })
})

test('13.8: the ▍ DENIED row names the command, err not warn', () => {
  const row = deniedRow(41_000, 'shell', 'rm -rf dist', 86)

  expect(rowText(row)).toBe('         41s ▍  DENIED   shell rm -rf dist')
  expect(row.find(p => p.t === GLYPH.denied)?.color).toBe(TOKEN.err)
})

test('13.1: a failure node, as screen 31 draws it; at most 3 rows, the third `+ n more · /steps n`', () => {
  expect(rowText(failureRow('Width tests on Windows', '2 of 14 fail', 84_000, 78))).toBe('             ×  Width tests on Windows   2 of 14 fail   1m 24s')
  expect(capFailures([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: 0 })
  expect(capFailures([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2], more: 3 })
  expect(rowText(spineRow(NO_LABEL, SPINE, moreParts(3, 8)))).toBe('             │  + 3 more · /steps 8')
})

test('13.7: what Claude did instead of a refused step is a `└` line at the next step`s site; nothing after a step that ran', () => {
  const step = (id: string, subject: string, state?: 'blocked' | 'denied'): LogStep => ({
    id,
    kind: 'shell',
    subject,
    key: `shell · · ${subject}`,
    result: state ?? '',
    mark: '',
    isRunning: false,
    clock: 1_000,
    ...(state === undefined ? {} : { state })
  })
  const steps = [step('a', 'git push', 'blocked'), step('b', 'git status'), step('c', 'git log')]

  expect(insteadRows(steps, ['b'], 86).map(rowText)).toEqual(['             │  └ instead  shell git status'])
  expect(insteadRows(steps, ['c'], 86)).toEqual([])
  expect(insteadRows(steps, ['a'], 86)).toEqual([])
})
