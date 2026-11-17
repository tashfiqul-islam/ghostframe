import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { splitBlocks } from '../hooks/blocks'
import { textAt } from './text'

// The reply seen on screen: a turn with no tools, one prose line, a table whose last cell
// holds text plus `([post](https://…))`, then a Sources list. The table fell back to the
// engine: `parseInline` refuses any cell holding `[`, `]` or `https://` that isn't wholly a
// link, so `parseTable` gave up and the block went `wide`. The Sources list (four items)
// then drew its own footnote line, with no markers anywhere.

export const REPLY = `Contributor counts come from the GitHub releases page I read earlier in this conversation.

| Version | Released | Contributors | Headline |
|---|---|---:|---|
| v1.4.4 | Oct 22, 2026 | 39 | \`bun fmt\`, a formatter that works like Prettier, and faster \`bun check\` ([post](https://bun.com/blog/bun-v1.4.4)) |
| v1.4.3 | Oct 10, 2026 | 8 | \`bun check\`, a type checker, and less CPU use when idle ([post](https://bun.com/blog/bun-v1.4.3)) |
| v1.4.2 | Sep 5, 2026 | 3 | fixes only: Elysia, AsyncLocalStorage, \`@discordjs/ws\` ([post](https://bun.com/blog/bun-v1.4.2)) |

Sources:
- [post](https://bun.com/blog/bun-v1.4.4)
- [post](https://bun.com/blog/bun-v1.4.3)
- [post](https://bun.com/blog/bun-v1.4.2)
- [Releases · oven-sh/bun · GitHub](https://github.com/oven-sh/bun/releases)`

const TABLE_ONLY = REPLY.split('\n\nSources:')[0] ?? ''

const respond = (text: string, uuid: string) =>
  ({
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text }] },
    door: 'response',
    origin: { kind: 'model' },
    uuid
  }) as never

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

/** A no-tool turn holding `text`, settled, drawn at `columns`: its rows as text. */
async function draw($: Engine, on: On, text: string, columns = 140) {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.turn.start({ text: 'make a table', turnId: 't1' })
  await $.session.append(respond(text, 'a1'))
  await $.turn.complete({ answer: text, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', usage: { output_tokens: 10 } } as never)
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns, rows: 400 },
    props: { text, isFirstOfReply: true }
  } as never)
  const rows = textAt(await ui.drawn(), columns).map(l => l.trimEnd())
  await ui.unmount()

  return rows
}

const isNote = (l: string) => /^\s*┄┄┄┄ [¹²³⁴⁵⁶⁷⁸⁹]/.test(l)

// ─── 1. The cause ────────────────────────────────────────────────────────────

test('repro: the on-screen reply parses as a table now; before, the link-in-text cell sent it wide', () => {
  expect(splitBlocks(REPLY).map(b => b.kind)).toEqual(['para', 'table', 'sources'])
  // The cause, isolated: the same table with the links removed always parsed.
  const plain = TABLE_ONLY.replace(/ \(\[post\]\([^)]*\)\)/g, '')
  expect(splitBlocks(plain).map(b => b.kind)).toEqual(['para', 'table'])
})

// ─── 2 & 5. Links in cells, header alignment ─────────────────────────────────

test('the on-screen reply (no web tools): our table, (post¹) markers, footnote lines, no frame', async ($, on) => {
  const rows = await draw($, on, REPLY)
  const body = rows.join('\n')

  // Our table, not the engine's box: no heavy borders, no raw link, no engine node.
  expect(body).not.toMatch(/[┌┐└┘│├┤]|\]\(https|\(post \(/)
  expect(rows.some(l => l.trim() === 'engine')).toBe(false)
  expect(rows.some(l => /v1\.4\.4\s+Oct 22, 2026\s+39\s/.test(l))).toBe(true) // the date on one row

  // `([post](url))` → `(post¹)`, numbered in reply order.
  expect(body).toContain('(post¹)')
  expect(body).toContain('(post²)')
  expect(body).toContain('(post³)')

  // No web tools in the turn: footnote lines, never a frame (§0.2). The table's line lists
  // its three markers; the Sources list adds one dim line for the source it names with no
  // marker (GitHub releases), `·` for a number, so no ⁴ is promised.
  expect(rows.some(l => l.includes('[ SOURCES ]'))).toBe(false)
  const notes = rows.filter(isNote)
  expect(notes).toHaveLength(1)
  expect(notes[0]).toContain('¹ bun.com · bun-v1.4.4')
  expect(notes[0]).toContain('³ bun.com · bun-v1.4.2')
  const listed = rows.find(l => /^\s*┄┄┄┄ · /.test(l)) ?? ''
  expect(listed).toContain('Releases · oven-sh/bun · GitHub')
  expect(listed).not.toMatch(/[¹²³⁴]/)

  // 5. "Contributors" right-aligns over its numbers.
  const head = rows.find(l => l.includes('Contributors')) ?? ''
  const v144 = rows.find(l => l.includes('v1.4.4')) ?? ''
  expect(head.indexOf('Contributors') + 'Contributors'.length).toBe(v144.indexOf(' 39 ') + 3)
})

test('without a Sources list: the footnote line sits directly under the table', async ($, on) => {
  const rows = await draw($, on, TABLE_ONLY)
  const last = rows.findIndex(l => /^\s*v1\.4\.2\s/.test(l))
  const note = rows.findIndex(isNote)

  // The v1.4.2 row may wrap its headline: the note follows the table's last line.
  expect(note).toBeGreaterThan(last)
  expect(rows.slice(last + 1, note).every(l => l.trim().length > 0 && !l.includes('┄'))).toBe(true)
  expect(rows[note]).toContain('¹ bun.com · bun-v1.4.4')
  expect(rows[note]).toContain('² bun.com · bun-v1.4.3')
  expect(rows[note]).toContain('³ bun.com · bun-v1.4.2')
})

test('cells: only a link → its URL label; a link in prose → text + marker; "(post (url))" → "(post¹)"', async ($, on) => {
  const md = [
    'Where each one lives:',
    '',
    '| Page | Note |',
    '|---|---|',
    '| [post](https://bun.com/blog/bun-v1.4.4) | see the [release notes](https://bun.com/blog/bun-v1.4.3) for details |',
    '| https://github.com/oven-sh/bun/issues/9123 | the fix landed (post (https://bun.com/blog/bun-v1.4.2)) last week |',
    '| x | again the [release notes](https://bun.com/blog/bun-v1.4.3) |'
  ].join('\n')
  const rows = await draw($, on, md)
  const body = rows.join('\n')

  expect(body).toContain('bun.com · bun-v1.4.4') // the whole-cell link: its label, no marker
  expect(body).toContain('bun#9123')
  expect(body).toContain('release notes¹')
  expect(body).toContain('(post²)')
  // The same URL keeps its number.
  expect(rows.find(l => l.includes('again the'))).toContain('release notes¹')
  const note = rows.find(isNote) ?? ''
  expect(note).toContain('¹ bun.com · bun-v1.4.3')
  expect(note).toContain('² bun.com · bun-v1.4.2')
  expect(note).not.toContain('bun-v1.4.4')
})

test('table markers continue the reply’s numbering: a paragraph above takes ¹', async ($, on) => {
  const md = [
    'Bun ships often ([blog](https://bun.com/blog)).',
    '',
    '| v | note |',
    '|---|---|',
    '| 1.4.4 | see [post](https://bun.com/blog/bun-v1.4.4) |'
  ].join('\n')
  const rows = await draw($, on, md)

  expect(rows.join('\n')).toContain('blog¹')
  expect(rows.join('\n')).toContain('post²')
  expect(rows.filter(isNote).join(' ')).toContain('² bun.com · bun-v1.4.4')
})

// ─── 3. No footnote line without its marker ──────────────────────────────────

test('a Sources list whose every source has a marker draws nothing of its own', async ($, on) => {
  const md = `${TABLE_ONLY}\n\nSources:\n- [post](https://bun.com/blog/bun-v1.4.4)\n- [post](https://bun.com/blog/bun-v1.4.3)`
  const rows = await draw($, on, md)

  // One footnote line, the table's, and no frame.
  expect(rows.filter(isNote)).toHaveLength(1)
  expect(rows.some(l => l.includes('[ SOURCES ]'))).toBe(false)
})

test('a block left to the engine never leaves a footnote line behind', async ($, on) => {
  const md = [
    '| a | b |',
    '|---|---|',
    '| see [post](https://bun.com/blog/bun-v1.4.4)<br>and more | 1 |',
    '',
    'A paragraph with a link ~~struck~~ [here](https://x.dev/a) we cannot lay out.'
  ].join('\n')
  expect(splitBlocks(md).map(b => b.kind)).toEqual(['wide', 'markdown'])
  const rows = await draw($, on, md)

  expect(rows.some(l => l.includes('┄┄┄┄'))).toBe(false)
  expect(rows.some(l => /[¹²³]/.test(l))).toBe(false)
})

// ─── 4. Every remaining fallback, one test each ──────────────────────────────

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
  if (piped?.kind === 'table') expect(piped.table.rows[0]?.[0]?.runs.map(r => r.t).join('')).toBe('a | b')
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

test('a marker cut off with its cell (line limit, narrow) gets no footnote entry', async ($, on) => {
  const rows = await draw($, on, TABLE_ONLY, 60)
  const note = rows.find(isNote) ?? ''
  const table = rows.filter(l => !isNote(l)).join('\n')
  const entries = note.match(/[¹²³⁴⁵⁶⁷⁸⁹]+/g) ?? []

  // At 60 columns the long headlines hit the 4-line limit: whatever entries remain each
  // have their marker drawn in the table, and a dropped marker has no entry.
  for (const m of entries) expect(`${m} drawn: ${table.includes(m)}`).toBe(`${m} drawn: true`)
  for (const m of ['¹', '²', '³']) if (!table.includes(m)) expect(note).not.toContain(m)
})

// ─── The same turn, seen again: frame markers and the footer ─────────────────

/** Two no-tool turns of this shape, the same prompt run twice at about 5s each. */
async function twoRuns($: Engine, on: On, text: string) {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  for (const [turnId, ms, tokens] of [
    ['t1', 5200, 240],
    ['t2', 5300, 260]
  ] as const) {
    await $.turn.start({ text: 'make a table', turnId })
    await $.session.append(respond(text, `a-${turnId}`))
    await $.turn.complete({ answer: text, durationMs: ms, isAborted: false, turnId, reason: 'answer', usage: { output_tokens: tokens } } as never)
  }
}
const footer = async ($: Engine, ms: number) => {
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'TurnDuration',
    viewport: { columns: 140, rows: 40 },
    props: { word: 'Baked', durationMs: ms }
  } as never)
  const text = textAt(await ui.drawn(), 140).join('\n')
  await ui.unmount()

  return text
}

test('footer: a no-tool turn keeps its tokens and sources count when another turn took about as long', async ($, on) => {
  await twoRuns($, on, REPLY)

  // The row the engine draws as t2 ends: t2's numbers (5.3s and 5.2s are within 250ms).
  const t2 = await footer($, 5300)
  expect(t2).toContain('5s · 260 tokens · 4 sources')
  // The earlier row, redrawn: its own turn, not t2's.
  const t1 = await footer($, 5200)
  expect(t1).toContain('5s · 240 tokens · 4 sources')
})

test('with a link in the opening line too: numbering follows reading order, every entry has its marker', async ($, on) => {
  const withLead = REPLY.replace(
    'the GitHub releases page I read earlier',
    'the [GitHub releases page](https://github.com/oven-sh/bun/releases) I read earlier'
  )
  const rows = await draw($, on, withLead)
  const notes = rows.filter(isNote)
  const body = rows.filter(l => !isNote(l)).join('\n')

  // Reading order: the opening line's link is ¹, then the table's three posts.
  expect(body).toContain('GitHub releases page¹')
  expect(body).toContain('(post²)')
  expect(body).toContain('(post³)')
  expect(body).toContain('(post⁴)')
  // Every source has a marker, four in all: footnote lines (one under the line, one under
  // the table), no frame; the Sources list adds nothing of its own.
  expect(rows.some(l => l.includes('[ SOURCES ]'))).toBe(false)
  expect(notes).toHaveLength(2)
  expect(notes[0]).toContain('¹ github.com · releases')
  for (const m of notes.join(' ').match(/[¹²³⁴⁵⁶⁷⁸⁹]/g) ?? []) expect(body).toContain(m)
  // The opening line's note sits right under it, before the table.
  const lead = rows.findIndex(l => l.includes('GitHub releases page¹'))
  expect(rows[lead + 1]).toBe(notes[0])
})

test('the on-screen turn as sent: every numbered note has its marker; the listed-only source has none', async ($, on) => {
  const rows = await draw($, on, REPLY)
  const notes = rows.filter(l => /^\s*┄┄┄┄ /.test(l))
  const body = rows.filter(l => !/^\s*┄┄┄┄ /.test(l)).join('\n')

  for (const m of notes.join(' ').match(/[¹²³⁴⁵⁶⁷⁸⁹]/g) ?? []) expect(body).toContain(m)
  expect(notes.find(l => l.includes('Releases'))).toMatch(/┄┄┄┄ · /)
})
