import { expect, test } from 'claude-code/testing'

import { vw } from '../hooks/shared/text'

const respond = (content: unknown[], uuid: string) =>
  ({
    message: { type: 'assistant', role: 'assistant', content },
    door: 'response',
    origin: { kind: 'model' },
    uuid
  }) as never

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

// ─── 4. One [ SOURCES ] frame lists every source; its count is the footer's ──

const MANY = [
  'The newest is v1.4.4 [v1.4.4](https://bun.com/blog/release-notes/bun-v1.4.4).',
  '',
  'Sources:',
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `- [Source ${n}](https://example.dev/s/${n})`)
].join('\n')

test('a source cited only in the first paragraph is in the frame; no footnote lines; frame count = footer count', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'q' }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: 'p'
  } as never)
  await $.turn.start({ text: 'q', turnId: 't1' })
  // A web search first: the turn draws a frame (§0.2).
  await $.session.append(respond([{ type: 'tool_use', id: 'w1', name: 'WebSearch', input: { query: 'bun' } }], 'w'))
  await $.session.append(respond([{ type: 'text', text: MANY }], 'r'))
  // A narrow sources hit so the turn is a run (the tally shows from level 3).
  await $.turn.complete({ answer: MANY, durationMs: 4321, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 120, rows: 60 },
    props: { text: MANY, isFirstOfReply: true }
  })
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  // One source has a marker; the list's other nine are listed, unnumbered.
  expect(all).toContain('1 cited · 9 listed')
  expect(all.some(t => t.startsWith('┄┄┄┄ '))).toBe(false)
  // ¹ is listed in the frame: its row's number and its label.
  expect(all.some(t => /^ ?1  $/.test(t))).toBe(true)
  expect(all).toContain('bun.com · bun-v1.4.4')
  await ui.unmount()

  const close = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'TurnDuration',
    viewport: { columns: 120, rows: 40 },
    props: { word: 'Baked', durationMs: 4321 }
  })
  expect(await close.find({ type: 'Text', text: /10 sources/ })).toBeDefined()
  await close.unmount()
})
