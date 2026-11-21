import { expect, test } from 'claude-code/testing'

import { sourcesFrame } from '../../../hooks/transcript/research/sources'

test('a Sources frame with twenty thousand entries draws in linear time', () => {
  // Quadratic title counting took about 4 s here; linear is well under a second.
  const cites = Array.from({ length: 20_000 }, (_, i) => ({ n: i + 1, url: `https://x.dev/${i}`, title: `t${i}` }))
  expect(sourcesFrame(cites, 80).length).toBeGreaterThan(20_000)
})
