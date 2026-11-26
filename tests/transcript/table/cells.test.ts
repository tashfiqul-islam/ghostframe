import { expect, test } from 'claude-code/testing'

import { splitBlocks } from '../../../hooks/transcript/blocks/split'
import { cellLines, headerAlign } from '../../../hooks/transcript/table/cells'
import { layoutTable } from '../../../hooks/transcript/table/layout'
import { parseTable } from '../../../hooks/transcript/table/parse'
import { textAt } from '../../support/text'
import { OFF } from '../../support/cockpit'

test('tables: a short number starting a prose cell stays with the next word', async () => {
  // Two prose columns competing, the case seen on screen: without the glue, Fixes
  // shrinks to its longest word (`regressions,`, 12) and `2` sits alone on its line.
  const t = splitBlocks(
    [
      '| Version | Fixes | Highlights |',
      '|---|---|---|',
      '| v1.4.2 | 2 regressions, plus crashes and hangs | Elysia and AsyncLocalStorage regressions, a hang in the websocket client, CMYK JPEG decoding, a JIT crash and a GC crash on musl |'
    ].join('\n')
  )[0]
  if (t?.kind !== 'table') throw new Error('no table')
  const cell = t.table.rows[0]?.[1]
  if (cell === undefined) throw new Error('no cell')
  for (const room of [46, 44, 43, 42]) {
    const width = layoutTable(t.table, room).widths[1] ?? 0
    const first = cellLines(cell, width, 'prose')[0]
      ?.map(r => r.t)
      .join('')
    expect(first?.startsWith('2 regressions,')).toBe(true)
  }
})
const RELEASES = [
  '| Version | Released | Released by | Issues fixed | Contributors |',
  '|---|---|---|---|---|',
  '| v1.4.4 | Oct 22, 2026 | Jarred-Sumner | 271 | 39 |',
  '| v1.4.3 | Oct 10, 2026 | Jarred-Sumner | 166 | 8 |',
  '| v1.4.2 | Sep 5, 2026 | dylan-conway | not stated | 3 |'
].join('\n')

test('a header right-aligns over a column whose non-empty cells are mostly numbers', OFF, async ($, on) => {
  const t = parseTable(RELEASES.split('\n'))
  if (t === undefined) throw new Error('no table')

  expect(headerAlign(t, 3)).toBe('right') // 2 of 3 numbers
  expect(headerAlign(t, 4)).toBe('right') // all numbers
  expect(headerAlign(t, 0)).toBe('left') // v1.4.4 is a version, not a number
  expect(headerAlign(t, 2)).toBe('left')

  // Exactly half is not "more than half".
  const half = parseTable(['| a | b |', '|---|---|', '| x | 1 |', '| y | n/a |'])
  if (half === undefined) throw new Error('no table')
  expect(headerAlign(half, 1)).toBe('left')

  // On screen: the header ends on the same column as the numbers under it.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 140, rows: 40 },
    props: { text: RELEASES, isFirstOfReply: false }
  } as never)
  const lines = textAt(await ui.drawn(), 140)
  await ui.unmount()
  const head = lines.find(l => l.includes('Contributors')) ?? ''
  const row = lines.find(l => l.includes('v1.4.4')) ?? ''

  expect(head.indexOf('Issues fixed') + 'Issues fixed'.length).toBe(row.indexOf('271') + 3)
  expect(head.indexOf('Contributors') + 'Contributors'.length).toBe(row.indexOf('39') + 2)
})
