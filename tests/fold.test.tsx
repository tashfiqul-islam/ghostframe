import { expect, test } from 'claude-code/testing'

import { foldOf, foldRow, foldSummary } from '../hooks/activity'
import { partsWidth } from '../hooks/shared/parts'

const VIEW = { columns: 120, rows: 40 }
const never = () => false
const stamp = (n: number, opts: { running?: number[]; tools?: string[]; failed?: number[]; turn?: string } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    turn: opts.turn ?? 't',
    at: i * 1000,
    ms: opts.running?.includes(i + 1) === true ? null : 500,
    tool: opts.tools?.[i] ?? 'Read',
    ok: opts.failed?.includes(i + 1) !== true
  }))

test('a turn folds only past eight finished steps, keeping the latest five as rows', async () => {
  expect(foldOf(stamp(8), 's1', never)).toBe(undefined)

  const nine = stamp(9)
  expect(foldOf(nine, 's1', never)).toEqual({ isAnchor: true, count: 4, summary: '4 reads', failed: 0, wall: 3500 })
  expect(foldOf(nine, 's4', never)?.isAnchor).toBe(false)
  expect(foldOf(nine, 's5', never)).toBe(undefined) // one of the latest five

  // A running step stops the fold there; nothing below it moves.
  expect(foldOf(stamp(12, { running: [3] }), 's1', never)?.count).toBe(2)
  // A browser frame is never cut: the fold stops at the first browser call.
  const tools = ['Read', 'Edit', 'mcp__playwright__browser_navigate', ...Array(9).fill('Read')]
  expect(foldOf(stamp(12, { tools }), 's1', t => (t ?? '').includes('playwright'))?.count).toBe(2)
  // Another turn's steps never count.
  expect(foldOf([...stamp(9), ...stamp(3, { turn: 'u' }).map(x => ({ ...x, id: `u${x.id}` }))], 's1', never)?.count).toBe(4)
})

test('the fold row: count, summary in words, ✓ or failures, time — exactly the measure', async () => {
  expect(foldSummary(['Read', 'Read', 'Edit', 'Bash', 'Bash', 'Bash', 'Grep'])).toBe('3 commands, 2 reads, 1 edit')

  const f = foldOf(stamp(11, { tools: ['Read', 'Edit', 'Bash', 'Bash', 'Read', 'Read'], failed: [3] }), 's1', never)
  if (f === undefined) throw new Error('no fold')
  const row = foldRow(f, 96)
  expect(row.map(p => p.t).join('')).toMatch(/^◦ 6 earlier steps · 3 reads, 2 commands, 1 edit +1 fail {3} +6s$/)
  for (const w of [96, 60, 30]) expect(partsWidth(foldRow(f, w))).toBe(w)
})

test('a settled turn: the first step draws the fold row, the rest of the fold draws nothing, the latest five stay', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  let now = 0
  on('clock.now', () => ({ value: (now += 100) }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { type: 'text', file: { numLines: 3 } } }))
  await $.turn.start({ text: 'big job', turnId: 't1' })
  for (let i = 1; i <= 10; i++) await $.tool.call({ tool: 'Read', file_path: `f${i}.ts`, tool_use_id: `r${i}` } as never)

  const row = (i: number) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolUse',
      viewport: VIEW,
      props: {
        tool_use_id: `r${i}`,
        tool: 'Read',
        input: { file_path: `f${i}.ts` },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        output: { type: 'text', file: { numLines: 3 } }
      }
    })

  const first = await row(1)
  expect(await first.find({ type: 'Text', text: /^5 earlier steps · 5 reads$/ })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /^activity $/ })).toBeDefined()
  await first.unmount()

  const hidden = await row(3)
  expect(await hidden.findAll({ type: 'Text' })).toHaveLength(0)
  await hidden.unmount()

  const result = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolResult',
    viewport: VIEW,
    props: { tool_use_id: 'r3', tool: 'Read', isErrored: false, output: {} }
  })
  expect(await result.findAll({ type: 'Text' })).toHaveLength(0)
  await result.unmount()

  const kept = await row(6)
  expect(await kept.find({ type: 'Text', text: /^f6\.ts$/ })).toBeDefined()
  await kept.unmount()

  // ctrl+o: every step is the engine's again.
  const open = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEW,
    props: { tool_use_id: 'r3', tool: 'Read', input: { file_path: 'f3.ts' }, isRunning: false, isErrored: false, isInterrupted: false, isExpanded: true }
  })
  expect(await open.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await open.unmount()
})
