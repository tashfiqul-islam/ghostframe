import { expect, test } from 'claude-code/testing'

import { dockCap, paneColumns, terminalColumns } from '../../hooks/cockpit/seat'

// Cockpit asks for the widest of 72, 56 or 40 body columns that leaves the transcript 100 cells.
// The dock's chrome is one divider column (correction A), and the engine's 45% cap includes it (correction B).
const WIDTHS: readonly (readonly [columns: number, pane: number, transcript: number])[] = [
  [110, 40, 69],
  [120, 40, 79],
  [144, 40, 103],
  [150, 40, 109],
  [163, 56, 106],
  [200, 72, 127],
  [240, 72, 167]
]

for (const [columns, pane, transcript] of WIDTHS) {
  test(`width rule at ${columns} columns: a ${pane}-column pane, a ${transcript}-column transcript`, () => {
    expect(paneColumns(columns)).toBe(pane)
    expect(pane).toBeLessThanOrEqual(dockCap(columns))
    expect(columns - pane - 1).toBe(transcript)
  })
}

test('the cap is 45% of the terminal less the divider, as probed', () => {
  // Bodies the engine granted to an open asking for more: 66 at 150, 63 at 144, 53 at 120, 72 from 163, 89 at 200.
  expect([150, 144, 120, 162, 163, 200].map(dockCap)).toEqual([66, 63, 53, 71, 72, 89])
})

test('the terminal width from the pane: the transcript, the body and the divider when docked; the viewport inline', () => {
  // Probe values: docked at 200 (viewport 127, body 72) and at 120 (66 and 53); inline at 109 (body 105).
  expect(terminalColumns('dock', 127, 72)).toBe(200)
  expect(terminalColumns('dock', 66, 53)).toBe(120)
  expect(terminalColumns('inline', 109, 105)).toBe(109)
})
