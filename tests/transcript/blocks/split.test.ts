import { expect, test } from 'claude-code/testing'

import { splitBlocks } from '../../../hooks/transcript/blocks/split'
import type { Block } from '../../../hooks/transcript/blocks/split'
import { foldOutput } from '../../../hooks/transcript/activity/row'
import { FINISHED } from '../../support/finished'
import { LINEAR_MS, ms, RUN } from '../../support/linear'

const REPORT = `Prose cells in tables now wrap instead of being cut, and Phase 3 (the activity timeline and the diff card) is built. Validate passes (warnings only), tsc exits 0 even with unused-variable checks on, and all 32 tests pass. None of it has been checked on screen yet.

## Table change

| Item | Status |
|---|---|
| Prose cells wrap inside their column, up to 4 lines | done |
| Numbers never wrap; paths clip in the middle (\`src/compone…onSearch.tsx\`) | done |

Stopping here.`

const DIRECT = `The opening paragraph runs long enough to wrap
across more than one source line, and it sits
directly on top of the table with no blank line.
| Step | Result |
|---|---|
| read | 212 lines |
| edit | +18 −4 |
And a closing line right under it, no blank either.`

/** Every word a block list draws, in order (markdown syntax stripped). */
const wordsOf = (blocks: Block[]) =>
  blocks
    .flatMap(b => {
      switch (b.kind) {
        case 'para':
          return [b.runs.map(r => r.t).join('')]
        case 'heading':
          return [b.text]
        case 'table':
          return [b.table.header.join(' '), ...b.table.rows.map(r => r.map(c => (c.empty ? '' : c.runs.map(x => x.t).join(''))).join(' '))]
        case 'sources':
          return b.items.map(i => i.title)
        case 'figure':
          return [b.title, ...b.rows]
        case 'list':
          return [...(b.title !== undefined ? [b.title] : []), ...b.items.map(i => i.text)]
        default:
          return [b.text]
      }
    })
    .join(' ')
    .replace(/`/g, '')
    .replace(/[|#*]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !/^-+$/.test(w))

const sourceWords = (text: string) =>
  text
    .replace(/`/g, '')
    .replace(/[|#*]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !/^-+$/.test(w))

test('a multi-line paragraph directly above a table: nothing dropped, nothing repeated', async () => {
  const blocks = splitBlocks(DIRECT)
  expect(blocks.map(b => b.kind)).toEqual(['para', 'table', 'para'])
  expect(wordsOf(blocks)).toEqual(sourceWords(DIRECT))
})

test('every streamed prefix keeps every word exactly once, in order', async () => {
  for (const text of [REPORT, DIRECT]) {
    for (let cut = 1; cut <= text.length; cut++) {
      const prefix = text.slice(0, cut)
      // The words drawn are the typed words in order, none repeated. The tail may hold some
      // back while it streams (a table header until its separator is whole, a line that may
      // become a `Sources:` label, a link until it closes), never anything above it; and
      // the whole text draws every word.
      const got = wordsOf(splitBlocks(prefix, true))
      const typed = sourceWords(prefix)
      const lastBlock = sourceWords(prefix.split(/\n\s*\n/).pop() ?? '').length
      const want = cut === text.length ? typed : typed.slice(0, got.length)
      const held = typed.length - got.length

      if (JSON.stringify(got) !== JSON.stringify(want) || held < 0 || held > lastBlock) {
        throw new Error(
          `prefix ${cut}: ${JSON.stringify(prefix.slice(-60))}\nkinds ${JSON.stringify(splitBlocks(prefix, true).map(b => b.kind))}\ngot  ${JSON.stringify(got.slice(-12))}\nwant ${JSON.stringify(want.slice(-12))}`
        )
      }
    }
  }
})
test('linear: trailing-space trim in blocks and shell output', () => {
  expect(ms(() => splitBlocks(`a${RUN}b`))).toBeLessThan(LINEAR_MS)
  expect(ms(() => foldOutput(`a${RUN}b`))).toBeLessThan(LINEAR_MS)
})

test('fences: a longer fence holds a shorter one, and ~~~ never closes ```', () => {
  // Prose inside the fence stays code: one engine block, never a paragraph of ours.
  const outer = '````markdown\n```js\n\nplain words\n\n```\n````'
  expect(splitBlocks(outer)).toEqual([{ kind: 'markdown', text: outer }])
  const mixed = '```\n~~~\n\nplain words\n\n```'
  expect(splitBlocks(mixed)).toEqual([{ kind: 'markdown', text: mixed }])
  // A fence line with text after it never closes.
  const info = '```\n``` x\n\nplain words\n\n```'
  expect(splitBlocks(info)).toEqual([{ kind: 'markdown', text: info }])
  // A backtick run with a backtick in its info string is inline code, not a fence: the
  // paragraph after it stays ours.
  expect(splitBlocks('``` a ` b\n\nplain words').at(-1)?.kind).toBe('para')
  // A table right under a closed fence still splits out.
  expect(splitBlocks('````\n```\n````\n| a | b |\n|---|---|\n| x | 1 |').map(b => b.kind)).toEqual(['markdown', 'table'])
})

test('web links become footnotes; lists are ours; other links, fences and odd lists go to the engine', async () => {
  expect(splitBlocks('see [docs](https://x.dev)')[0]?.kind).toBe('cited')
  expect(splitBlocks('see [docs](./docs/a.md)')[0]?.kind).toBe('markdown')
  expect(splitBlocks('see <https://x.dev>')[0]?.kind).toBe('cited')
  expect(splitBlocks('- one\n- two')[0]?.kind).toBe('list')
  expect(splitBlocks('- one\n  ```ts\n  x\n  ```')[0]?.kind).toBe('markdown')
  expect(splitBlocks('- one <b>two</b>')[0]?.kind).toBe('markdown')
  expect(splitBlocks('- a | b')[0]?.kind).toBe('list') // a pipe inside text is just text
  expect(splitBlocks('```ts\nconst a = 1\n\nconst b = 2\n```')).toEqual([{ kind: 'markdown', text: '```ts\nconst a = 1\n\nconst b = 2\n```' }])
  expect(splitBlocks('## Title')[0]).toEqual({ kind: 'heading', text: 'Title' })
})

for (const said of FINISHED) {
  test(`B2, B3. Cockpit off: the finished reply ${JSON.stringify(said)} keeps every word`, () => {
    expect(wordsOf(splitBlocks(said))).toEqual(sourceWords(said))
  })
}
