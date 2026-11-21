import { expect, test } from 'claude-code/testing'

import { partsWidth } from '../../../hooks/shared/parts'
import { footnoteLines } from '../../../hooks/transcript/research/footnotes'

test('footnotes: every marker a block uses is listed, on more lines rather than fewer markers', async () => {
  const cites = [1, 2, 3, 4].map(n => ({ n, url: `https://example.dev/a/long/path/number/${n}`, title: `t${n}` }))
  for (const width of [96, 48, 30]) {
    const lines = footnoteLines(cites, width)
    const text = lines.map(l => l.map(p => p.t).join(''))
    for (const l of lines) expect(partsWidth(l)).toBeLessThanOrEqual(width)
    for (const m of ['¹', '²', '³', '⁴']) expect(text.join('\n')).toContain(m)
    expect(text.join('\n')).not.toContain('https://')
  }
  expect(footnoteLines(cites, 96)).toHaveLength(1)
  expect(footnoteLines(cites, 30).length).toBeGreaterThan(1)
})
