import { expect, test } from 'claude-code/testing'

import { diffRows, diffTop } from '../../../hooks/transcript/activity/diff'
import { changeParts } from '../../../hooks/shared/calls/results'

test('diff card: numbered rows, top edge exactly the width', async () => {
  const patch = [{ oldStart: 10, oldLines: 2, newStart: 10, newLines: 3, lines: [' a', '-b', '+c', '+d'] }]
  const d = diffRows({ filePath: 'src/toast/queue.ts', structuredPatch: patch })
  expect(d?.rows.map(r => `${r.kind}:${r.no}`)).toEqual(['ctx:10', 'del:11', 'add:11', 'add:12'])

  for (const width of [96, 60, 40]) {
    for (const parts of [changeParts(18, 4), changeParts(3, 0), changeParts(0, 0)]) {
      expect(diffTop(width, 'src/' + 'very/'.repeat(30) + 'long.ts', parts, '22 lines').total).toBe(width)
    }
  }

  expect(diffRows({ filePath: 'n.ts', structuredPatch: [], content: 'one\ntwo\n' })?.adds).toBe(2)
})
