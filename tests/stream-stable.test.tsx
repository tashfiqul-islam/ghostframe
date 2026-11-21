import { expect, test } from 'claude-code/testing'

import { splitBlocks } from '../hooks/transcript/blocks/split'
import { streamLayout } from '../hooks/transcript/table/layout'

const VIEW = { columns: 160, rows: 65 }

const para = (n: number) =>
  `Paragraph ${n} explains the change in plain words, with a \`code chip\` and **a bold verdict** inside it. ` +
  'It runs long enough to wrap over several lines of the measure, so its layout is a real test of the wrapper. '.repeat(2)

const STATUS = [
  '**Done.** Short.',
  '**Done, with a fallback.** The header and label now draw on their own row, above the engine line.',
  'Not possible: no render site carries it, so the engine keeps drawing it the way it always has done.',
  '`asked` holds the id until the call returns; the row says `needs you` only while nothing came back yet.'
]
const ROWS = Array.from({ length: 22 }, (_, i) => `| r${String(i + 1).padStart(2, '0')} | area ${i % 3} | ${STATUS[i % STATUS.length]} |`)

const REPLY = [
  para(1),
  para(2),
  para(3),
  '## The states',
  ['| Id | Area | Status |', '|---|---|---|', ...ROWS].join('\n'),
  para(4),
  para(5),
  para(6),
  para(7),
  para(8)
].join('\n\n')

type Found = { props: Record<string, unknown>; text: string }
type Ui = { findAll: (q: { type: string }) => Promise<Found[]> }

/** Our drawn blocks in order, each as its lines (one Text per block). */
async function blocksOf(ui: Ui): Promise<string[][]> {
  return (await ui.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'wrap').map(t => t.text.split('\n'))
}

/** A streamed table's lines above its last row (the one that may still be growing). */
function aboveLastRow(lines: string[]): string[] {
  const starts = lines.flatMap((l, i) => (/^r\d\d\b/.test(l) ? [i] : []))
  const last = starts[starts.length - 1]

  return last === undefined ? lines.slice(0, 2) : lines.slice(0, last)
}

// Streams every prefix of a long reply: seconds of draws, past the default 5 s on a CI runner.
test('a reply taller than the window streams with every line above its last block unchanged', { timeoutMs: 30_000 }, async ($, on) => {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.start({ text: 'report', turnId: 't1' })

  const props = (text: string) => ({ text, isFirstOfReply: true })
  const live = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: props(REPLY.slice(0, 30)) })
  let prev = await blocksOf(live)
  let prevText = REPLY.slice(0, 30)
  let renders = 0

  for (let cut = 75; ; cut = Math.min(REPLY.length, cut + 45)) {
    const text = REPLY.slice(0, cut)
    await live.redraw(props(text))
    const cur = await blocksOf(live)
    renders++

    // Every block that was already followed by another block: byte-identical.
    for (let i = 0; i < prev.length - 1; i++) expect(cur[i]).toEqual(prev[i])

    // While the table is the block being written, once its columns are frozen (its first row
    // complete), its header, rule and every finished row hold still.
    const was = splitBlocks(prevText).at(-1)
    const isTable = splitBlocks(text).at(-1)?.kind === 'table'
    const wasFrozen = was?.kind === 'table' && (was.partial ? was.table.rows.length - 1 : was.table.rows.length) >= 1

    if (wasFrozen && isTable) {
      const before = aboveLastRow(prev[prev.length - 1] ?? [])
      expect((cur[cur.length - 1] ?? []).slice(0, before.length)).toEqual(before)
    }

    prev = cur
    prevText = text

    if (cut === REPLY.length) break
  }

  expect(renders).toBeGreaterThan(40)

  // Taller than a 65-row window: lines plus one blank between blocks.
  const streamed = await blocksOf(live)
  expect(streamed.reduce((n, b) => n + b.length, 0) + streamed.length - 1).toBeGreaterThan(65)

  // The turn completes. The reply is taller than the window, so nothing re-flows: the next
  // render, and every one after it, is byte-identical to the last streamed one.
  await $.turn.complete({ answer: REPLY, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
  await live.redraw(props(REPLY))
  expect(await blocksOf(live)).toEqual(streamed)
  await live.redraw(props(REPLY))
  expect(await blocksOf(live)).toEqual(streamed)

  // The engine mounting the same message again (a new request) keeps the frozen layout:
  // row for row what streamed. (`streamLayout`'s own test shows a free layout differs.)
  const fresh = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: props(REPLY) })
  expect(await blocksOf(fresh)).toEqual(streamed)
  await fresh.unmount()
  await live.unmount()
})

test('a table keeps its streamed layout when the turn completes, even when the reply fits the window', async ($, on) => {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  const SHORT = 'A short reply.\n\n| Id | Status |\n|---|---|\n| r01 | ok |\n| r02 | a much longer status than the first row had, so a re-flow widens it |'
  const props = (text: string) => ({ text, isFirstOfReply: true })
  const mount = (text: string) => $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: props(text) })

  await $.turn.start({ text: 'short', turnId: 't2' })
  const live = await mount(SHORT.slice(0, 60))

  for (let cut = 60; cut <= SHORT.length; cut += 10) await live.redraw(props(SHORT.slice(0, cut)))
  await live.redraw(props(SHORT))
  const streamed = await blocksOf(live)

  await $.turn.complete({ answer: SHORT, durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answer' })
  await live.redraw(props(SHORT))
  const settled = await blocksOf(live)
  const fresh = await mount(SHORT)

  // No re-flow at completion: the turn rule, prompt and footer share the redrawn region,
  // so a re-flow there could print the whole turn twice. The engine mounting the same
  // message again keeps the streamed layout too.
  expect(settled).toEqual(streamed)
  expect(await blocksOf(fresh)).toEqual(streamed)
  await fresh.unmount()
  await live.unmount()
})

test('streamLayout: freezes on the first complete row, holds while live, re-flows when done unless off screen', async () => {
  const head = '| Id | Status |\n|---|---|\n'
  const table = (text: string) => {
    const b = splitBlocks(text)[0]
    if (b?.kind !== 'table') throw new Error('not a table')
    return b
  }

  // Header plus a half-written first row: nothing complete yet, nothing frozen.
  const early = table(`${head}| r01 | **Done, wi`)
  expect(early.partial).toBe(true)
  expect(early.table.rows).toHaveLength(1) // the half row still draws (marks dropped for now)
  expect(streamLayout(early, 96, true, undefined, false).hold).toBe(undefined)

  // First row complete, second streaming: frozen from the complete row alone.
  const first = table(`${head}| r01 | ok |\n| r02 | a much longer status that would widen the column if it were measured`)
  const { hold } = streamLayout(first, 96, true, undefined, false)
  expect(hold?.widths).toEqual([3, 6])

  // Later draws during the turn keep those widths, however the cells grow.
  const later = table(`${head}| r01 | ok |\n| r02 | a much longer status that would widen the column if it were measured |`)
  expect(streamLayout(later, 96, true, hold, false).drawn.layout.widths).toEqual([3, 6])
  expect(streamLayout(later, 96, true, hold, false).drawn.airy).toBe(false)

  // Turn complete: re-flow (and let go), unless the engine says it is off screen.
  const done = streamLayout(later, 96, false, hold, false)
  expect(done.hold).toBe(undefined)
  expect(done.drawn.layout.widths[1]).toBeGreaterThan(6)
  expect(streamLayout(later, 96, false, hold, true).drawn.layout.widths).toEqual([3, 6])

  // A reply taller than the window: frozen for good.
  const kept = streamLayout(later, 96, false, hold, false, false)
  expect(kept.drawn.layout.widths).toEqual([3, 6])
  expect(kept.hold).toEqual(hold)
})
