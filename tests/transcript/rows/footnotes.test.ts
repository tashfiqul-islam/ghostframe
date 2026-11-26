import { expect, test } from 'claude-code/testing'

import { claudeFootnotes } from '../../../hooks/transcript/rows/markdown'

// 7.4's footnote lines come only from the `[n]` references Claude wrote: a bare URL or a link in the answer is the
// answer's own text, never a footnote Cockpit numbers for it (the live check's step 6 drew three it made up).
test('12. footnotes are Claude`s own `[n]` references; bare URLs and links number nothing; markdown is stripped', () => {
  const turn5 =
    '- **https://bun.sh/docs/cli/test:** fetched fine.\n- **https://example.com/missing-page:** returned HTTP 404.\n\nSee [the runner](https://bun.sh/docs/cli/test).'

  expect(claudeFootnotes(turn5)).toEqual({ body: turn5, notes: [] })
  expect(claudeFootnotes('Bun runs it [1], as [2] says.\n\n[1]: https://bun.sh/docs/cli/test\n[2] **https://example.com/a**')).toEqual({
    body: 'Bun runs it [1], as [2] says.',
    notes: [
      { n: 1, url: 'https://bun.sh/docs/cli/test' },
      { n: 2, url: 'https://example.com/a' }
    ]
  })
})

test('12. Claude`s other footnote forms: `[^1]:`, a title after the URL, `[n] Title — url`', () => {
  expect(claudeFootnotes('See [1] and [2] and [3].\n\n[^1]: https://a.dev/x\n[2]: https://b.dev/y "Bee"\n[3] Bun docs — https://bun.sh/docs').notes).toEqual([
    { n: 1, url: 'https://a.dev/x' },
    { n: 2, url: 'https://b.dev/y' },
    { n: 3, url: 'https://bun.sh/docs' }
  ])
})
