import { expect, test } from 'claude-code/testing'

import { vw } from '../hooks/shared/text'
import { splitBlocks } from '../hooks/blocks'
import { parseInline, runWidth, toWords, wrapPlain, wrapWords } from '../hooks/prose'

const REPLY = [
  'A branch is a pointer to a commit. A worktree is a second checked-out folder, so you can have two branches open side by side without stashing.',
  '',
  '`git worktree add ../hotfix main` gives you a second folder on `main`.',
  '',
  "Use worktrees when you'd otherwise juggle stashes; branches for everything else."
].join('\n')

test('the 02:10 reply is three plain paragraphs, chips intact', async () => {
  const blocks = splitBlocks(REPLY)
  expect(blocks.map(b => b.kind)).toEqual(['para', 'para', 'para'])

  const second = blocks[1]
  expect(second?.kind === 'para' && second.runs[0]).toEqual({ t: 'git worktree add ../hotfix main', s: 'code' })
})

test('wrapped prose never passes the measure', async () => {
  for (const b of splitBlocks(REPLY)) {
    if (b.kind !== 'para') continue

    for (const width of [96, 60, 40]) {
      for (const line of wrapWords(toWords(b.runs), width)) {
        const w = line.reduce((n, word) => n + word.reduce((m, r) => m + runWidth(r), 0), 0) + line.length - 1
        expect(w <= width).toBe(true)
      }
    }
  }
})

test('the chip stays glued to its punctuation', async () => {
  const words = toWords(parseInline('folder on `main`.') ?? [])
  expect(words[words.length - 1]).toEqual([
    { t: 'main', s: 'code' },
    { t: '.', s: 'plain' }
  ])
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

test('your message keeps line breaks and indentation, wraps by cells', async () => {
  const rows = wrapPlain('first line\n  indented item that is fairly long here', 20)
  expect(rows[0]).toBe('first line')
  expect(rows[1]?.startsWith('  indented')).toBe(true)

  for (const r of rows) expect(vw(r) <= 20).toBe(true)
})

test('a one-word last line is avoided when narrowing allows it', async () => {
  const words = toWords([{ t: 'aaaa bbbb cccc dddd e', s: 'plain' }])
  const lines = wrapWords(words, 19)
  expect(lines[lines.length - 1]?.length ?? 0).toBeGreaterThan(1)
})
