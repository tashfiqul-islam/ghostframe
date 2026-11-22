import { expect, test } from 'claude-code/testing'

import { blockedRow, capFailures, deniedRow, detailRow, failureRow, moreParts } from '../../../hooks/cockpit/v8/events'
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

test('13.8: the ▍ DENIED row, the person`s reason in quotes, err not warn', () => {
  const row = deniedRow(41_000, 'shell', 'rm -rf dist', 'keep the build output', 86)

  expect(rowText(row)).toBe('         41s ▍  DENIED   shell rm -rf dist · "keep the build output"')
  expect(row.find(p => p.t === GLYPH.denied)?.color).toBe(TOKEN.err)
  expect(rowText(deniedRow(41_000, 'shell', 'rm -rf dist', '', 86))).toBe('         41s ▍  DENIED   shell rm -rf dist')
})

test('13.1: a failure node, as screen 31 draws it; at most 3 rows, the third `+ n more · /steps n`', () => {
  expect(rowText(failureRow('Width tests on Windows', '2 of 14 fail', 84_000, 78))).toBe('             ×  Width tests on Windows   2 of 14 fail   1m 24s')
  expect(capFailures([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: 0 })
  expect(capFailures([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2], more: 3 })
  expect(rowText(spineRow(NO_LABEL, SPINE, moreParts(3, 8)))).toBe('             │  + 3 more · /steps 8')
})
