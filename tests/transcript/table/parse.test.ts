import { expect, test } from 'claude-code/testing'

import { splitBlocks } from '../../../hooks/transcript/blocks/split'
import { REPLY, TABLE_ONLY } from '../../support/releases'

// The reply seen on screen: a turn with no tools, one prose line, a table whose last cell
// holds text plus `([post](https://…))`, then a Sources list. The table fell back to the
// engine: `parseInline` refuses any cell holding `[`, `]` or `https://` that isn't wholly a
// link, so `parseTable` gave up and the block went `wide`. The Sources list (four items)
// then drew its own footnote line, with no markers anywhere.

// ─── The cause ────────────────────────────────────────────────────────────

test('repro: the on-screen reply parses as a table now; before, the link-in-text cell sent it wide', () => {
  expect(splitBlocks(REPLY).map(b => b.kind)).toEqual(['para', 'table', 'sources'])
  // The cause, isolated: the same table with the links removed always parsed.
  const plain = TABLE_ONLY.replace(/ \(\[post\]\([^)]*\)\)/g, '')
  expect(splitBlocks(plain).map(b => b.kind)).toEqual(['para', 'table'])
})

// ─── Every remaining fallback, one test each ──────────────────────────────

const kindOf = (lines: string[]) => splitBlocks(lines.join('\n'))[0]?.kind
const HEAD = ['| a | b |', '|---|---|']

test('fallback: a separator with a different column count from the header', () => {
  expect(kindOf(['| a | b |', '|---|---|---|', '| 1 | 2 |'])).toBe('wide')
})

test('fallback: a row with more cells than the header (fewer is fine)', () => {
  expect(kindOf([...HEAD, '| 1 | 2 | 3 |'])).toBe('wide')
  expect(kindOf([...HEAD, '| 1 |'])).toBe('table')
})

test('fallback: a header cell with a link, HTML or strikethrough', () => {
  expect(kindOf(['| [a](https://x.dev) | b |', '|---|---|', '| 1 | 2 |'])).toBe('wide')
  expect(kindOf(['| a<br>z | b |', '|---|---|', '| 1 | 2 |'])).toBe('wide')
  expect(kindOf(['| ~~a~~ | b |', '|---|---|', '| 1 | 2 |'])).toBe('wide')
  expect(kindOf(['| **a** | `b` |', '|---|---|', '| 1 | 2 |'])).toBe('table')
})

test('fallback: inline HTML in a cell', () => {
  expect(kindOf([...HEAD, '| one<br>two | 2 |'])).toBe('wide')
})

test('fallback: strikethrough in a cell', () => {
  expect(kindOf([...HEAD, '| ~~old~~ new | 2 |'])).toBe('wide')
})

test('fallback: a backslash escape other than \\|; an escaped pipe parses', () => {
  expect(kindOf([...HEAD, '| a\\*b | 2 |'])).toBe('wide')
  const piped = splitBlocks([...HEAD, '| a \\| b | 2 |'].join('\n'))[0]
  expect(piped?.kind).toBe('table')
  if (piped?.kind !== 'table') throw new Error('not a table')
  expect(piped.table.rows[0]?.[0]?.runs.map(r => r.t).join('')).toBe('a | b')
})

test('fallback: $$ math in a cell', () => {
  expect(kindOf([...HEAD, '| $$x^2$$ | 2 |'])).toBe('wide')
})

test('fallback: an image in a cell', () => {
  expect(kindOf([...HEAD, '| ![logo](https://x.dev/a.png) | 2 |'])).toBe('wide')
})

test('fallback: a reference-style link in a cell', () => {
  expect(kindOf([...HEAD, '| see [docs][1] | 2 |'])).toBe('wide')
})

test('fallback: a link to anything but http(s)', () => {
  expect(kindOf([...HEAD, '| see [readme](./README.md) | 2 |'])).toBe('wide')
  expect(kindOf([...HEAD, '| [mail](mailto:a@b.dev) | 2 |'])).toBe('wide')
})

test('fallback: a bare www. host in a cell', () => {
  expect(kindOf([...HEAD, '| see www.example.com | 2 |'])).toBe('wide')
})

test('fallback: a stray * _ or backtick in a cell', () => {
  expect(kindOf([...HEAD, '| a * b | 2 |'])).toBe('wide')
  expect(kindOf([...HEAD, '| `open | 2 |'])).toBe('wide')
})

test('not a fallback: links, bare URLs, nested parentheses, code, bold all parse', () => {
  for (const cell of [
    '[post](https://bun.com/blog/bun-v1.4.4)',
    'https://bun.com/blog',
    '<https://bun.com/blog>',
    'text ([post](https://bun.com/blog/bun-v1.4.4))',
    'see [wiki](https://en.wikipedia.org/wiki/Bun_(software)) too',
    'see https://bun.com/blog for more',
    '**bold** and `code` and _italic_'
  ]) {
    expect(`${cell} → ${kindOf([...HEAD, `| ${cell} | 2 |`])}`).toBe(`${cell} → table`)
  }
})
