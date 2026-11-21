import { expect, test } from 'claude-code/testing'

import { vw } from '../../../../hooks/shared/text'
import { splitBlocks } from '../../../../hooks/transcript/blocks/split'
import { textAt } from '../../../support/text'
import { REPLY, TABLE_ONLY } from '../../../support/releases'
import { respondText } from '../../../support/respond'
import type { Engine, On } from '../../../support/engine'

/** Every line the reply's own blocks drew (one Text per block, lines joined by \n). */
async function lines(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; text: string }[]> }) {
  return (await ui.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'wrap').flatMap(t => t.text.split('\n'))
}

// ─── 2. Chips before punctuation keep table columns aligned ─────────────────

const CHIPS = [
  '| Version | Highlights | Post |',
  '|---|---|---|',
  '| v1.4.3 | `bun check`, faster | bun.com/blog/bun-v1.4.3 |',
  '| v1.4.4 | uses `bun fmt`; then `bun check` | bun.com/blog/bun-v1.4.4 |',
  '| v1.4.2 | (see `Bun.Image`) | bun.com/blog/bun-v1.4.2 |',
  '| v1.4.1 | ends `bun install`, | bun.com/blog/bun-v1.4.1 |',
  // A row with no tight chip and one with two: a measure that disagrees with the
  // drawing shifts these by different amounts, so the Post columns would part.
  '| v1.4.0 | no chips in this cell | bun.com/blog/bun-v1.4.0 |',
  '| v1.3.9 | `a`, `b`; and `c` | bun.com/blog/bun-v1.3.9 |'
].join('\n')

for (const columns of [120, 70]) {
  test(`at ${columns} columns, a chip before , ; ) mid-cell or at the end never shifts later columns`, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    const ui = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: { columns, rows: 40 },
      props: { text: CHIPS, isFirstOfReply: false }
    })
    const drawn = (await lines(ui)).filter(l => l.trim().length > 0)
    const rule = drawn.find(l => /^─+$/.test(l))
    if (rule === undefined) throw new Error('no table drawn')
    // No row past the rule, and each Post cell starts in the same column.
    const body = drawn.filter(l => l !== rule)
    for (const l of body) expect(vw(l)).toBeLessThanOrEqual(vw(rule))
    const posts = body.filter(l => l.includes('bun.com')).map(l => l.indexOf('bun.com'))
    expect(posts.length).toBe(6)
    expect(new Set(posts).size).toBe(1)
    // Tight where punctuation follows, padded before a space.
    expect(drawn.join('\n')).toContain(' bun check,')
    expect(drawn.join('\n')).toContain(' bun fmt;')
    expect(drawn.join('\n')).toContain(' Bun.Image)')
    await ui.unmount()
  })
}

// ─── 3. Narrow tables keep a blank line between rows that wrap ──────────────

const WRAPPY = [
  '| Version | Highlights |',
  '|---|---|',
  '| v1.4.4 | bun fmt formats like Prettier and reads your existing Prettier config |',
  '| v1.4.3 | bun check is a type checker built into Bun that reports what tsc reports |',
  '| v1.4.2 | fixes two regressions and a hang |'
].join('\n')

test('at 60 columns, rows that wrap keep a blank line between them, streaming and settled', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const VIEW = { columns: 60, rows: 40 }
  const blanksBetweenRows = (ls: string[]) => {
    const start = ls.findIndex(l => /^─+$/.test(l))
    return ls.slice(start + 1).filter(l => l.trim().length === 0).length
  }

  // Streaming: the table is frozen, yet rows that wrap are kept apart.
  await $.turn.start({ text: 'x', turnId: 't1' })
  const live = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: WRAPPY, isFirstOfReply: false }
  })
  expect(blanksBetweenRows(await lines(live))).toBeGreaterThanOrEqual(2)

  // Settled: a blank line between every two rows once any row wraps.
  await $.turn.complete({ answer: WRAPPY, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await live.redraw({ text: WRAPPY, isFirstOfReply: false })
  expect(blanksBetweenRows(await lines(live))).toBe(2)
  await live.unmount()
})

test('a narrow table streamed row by row: no drawn row moves, blank lines only land below them', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'x', turnId: 't1' })
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 60, rows: 40 },
    props: { text: WRAPPY.slice(0, 60), isFirstOfReply: false }
  })
  let prev: string[] = []

  for (let cut = 70; ; cut = Math.min(WRAPPY.length, cut + 11)) {
    await ui.redraw({ text: WRAPPY.slice(0, cut), isFirstOfReply: false })
    const cur = await lines(ui)
    // Once a row is complete the columns are frozen: every line above the row being
    // written (the last row start in the previous draw) holds still.
    const starts = prev.flatMap((l, i) => (/^v1\.4\.\d/.test(l) ? [i] : []))
    if (starts.length >= 2) {
      const settled = prev.slice(0, starts[starts.length - 1])
      expect(cur.slice(0, settled.length)).toEqual(settled)
    }
    prev = cur
    if (cut === WRAPPY.length) break
  }
  await ui.unmount()
})

/** A no-tool turn holding `text`, settled, drawn at `columns`: its rows as text. */
async function draw($: Engine, on: On, text: string, columns = 140) {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.turn.start({ text: 'make a table', turnId: 't1' })
  await $.session.append(respondText(text, 'a1'))
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

test('a marker cut off with its cell (line limit, narrow) gets no footnote entry', async ($, on) => {
  const rows = await draw($, on, TABLE_ONLY, 60)
  const note = rows.find(isNote) ?? ''
  const table = rows.filter(l => !isNote(l)).join('\n')
  const entries = note.match(/[¹²³⁴⁵⁶⁷⁸⁹]+/g) ?? []

  // At 60 columns the long headlines hit the 4-line limit: whatever entries remain each
  // have their marker drawn in the table, and a dropped marker has no entry.
  expect(entries.length).toBeGreaterThan(0)
  for (const m of entries) expect(`${m} drawn: ${table.includes(m)}`).toBe(`${m} drawn: true`)
  for (const m of ['¹', '²', '³']) if (!table.includes(m)) expect(note).not.toContain(m)
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
  const marks = notes.join(' ').match(/[¹²³⁴⁵⁶⁷⁸⁹]/g) ?? []
  expect(marks.length).toBeGreaterThan(0)
  for (const m of marks) expect(body).toContain(m)
  // The opening line's note sits right under it, before the table.
  const lead = rows.findIndex(l => l.includes('GitHub releases page¹'))
  expect(rows[lead + 1]).toBe(notes[0])
})

test('the on-screen turn as sent: every numbered note has its marker; the listed-only source has none', async ($, on) => {
  const rows = await draw($, on, REPLY)
  const notes = rows.filter(l => /^\s*┄┄┄┄ /.test(l))
  const body = rows.filter(l => !/^\s*┄┄┄┄ /.test(l)).join('\n')

  const marks = notes.join(' ').match(/[¹²³⁴⁵⁶⁷⁸⁹]/g) ?? []
  expect(marks.length).toBeGreaterThan(0)
  for (const m of marks) expect(body).toContain(m)
  expect(notes.find(l => l.includes('Releases'))).toMatch(/┄┄┄┄ · /)
})
