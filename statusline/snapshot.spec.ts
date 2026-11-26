// The plain text of both rows at the widths the design is judged at, in both sample states. A change to any column,
// gutter, label or note shows here as a snapshot diff.
import { expect, test } from 'bun:test'

import { widthOf } from './io.ts'
import { render } from './render.ts'
import { NORMAL, PRESSURE } from './samples.ts'

for (const cols of [260, 200, 160, 140, 120, 100, 80]) {
  for (const [state, f] of [
    ['normal', NORMAL],
    ['pressure', PRESSURE]
  ] as const) {
    test(`${state} at ${cols} columns`, () => {
      const rows = render(f, widthOf({ COLUMNS: String(cols) }), { icons: false, slab: false }).map(r => r.map(s => s.t).join(''))

      expect(rows.join('\n')).toMatchSnapshot()
    })
  }
}
