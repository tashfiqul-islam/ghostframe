import { expect, test } from 'claude-code/testing'

import { textAt } from '../../../support/text'
import { VIEW } from '../../../support/view'
import { engine, engineText } from '../../../support/engine'
import { respond } from '../../../support/respond'

// Session-state fixes: each row keeps what it claimed, a failing clock still settles a
// step, long turns keep their head, and openers match only within their own turn.

// ─── A clock that fails mid-call ────────────────────────────────────

test('a clock that fails at a call’s start or end: the step still settles, no time from 0', async ($, on) => {
  engine(on)
  let now = new Date(2026, 10, 17, 2, 10).getTime()
  let down = false
  on('clock.now', () => {
    if (down) throw new Error('clock down')

    return { value: (now += 1000) }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  // r1: the start fails, the end reads. r2: the start reads, the end fails.
  on('tool.call', (_, e) => {
    down = e.tool_use_id === 'r2'

    return { result: { type: 'text', file: { numLines: 3 } } }
  })
  await $.turn.start({ text: 'read two', turnId: 't1' })
  down = true
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', tool_use_id: 'r1' } as never)
  down = false
  await $.tool.call({ tool: 'Read', file_path: 'b.ts', tool_use_id: 'r2' } as never)
  down = false

  const row = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEW,
    props: {
      tool_use_id: 'r1',
      tool: 'Read',
      input: { file_path: 'a.ts' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { type: 'text', file: { numLines: 3 } }
    }
  })
  const rows = textAt(await row.drawn(), 120)
  await row.unmount()
  const head = rows.find(l => l.includes('activity')) ?? ''
  const step = rows.find(l => l.includes('a.ts')) ?? ''

  // Both steps settled: the rule carries a wall time, a sane one.
  expect(head).toMatch(/2 steps · \d+(\.\d)?s$/)
  // The first step's time is not counted from 0 (that read as decades).
  expect(step).toMatch(/0\.0s$/)
})

// ─── A long turn keeps its first step ───────────────────────────────

test('a turn with 450 steps keeps its activity head on its first step', { timeoutMs: 60_000 }, async ($, on) => {
  engine(on)
  let now = 0
  on('clock.now', () => ({ value: (now += 100) }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { type: 'text', file: { numLines: 3 } } }))
  await $.turn.start({ text: 'big job', turnId: 't1' })
  for (let i = 1; i <= 450; i++) await $.tool.call({ tool: 'Read', file_path: `f${i}.ts`, tool_use_id: `r${i}` } as never)

  const first = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEW,
    props: {
      tool_use_id: 'r1',
      tool: 'Read',
      input: { file_path: 'f1.ts' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { type: 'text', file: { numLines: 3 } }
    }
  })
  expect(await first.find({ type: 'Text', text: /^activity $/ })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /^ 450 steps · / })).toBeDefined()
  await first.unmount()
})

test('rows: ours when readable, the engine when expanded or unknown', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const base = { tool_use_id: 'x1', isRunning: false, isErrored: false, isInterrupted: false }
  const mine = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEW,
    props: { ...base, tool: 'Read', input: { file_path: 'src/a.ts' }, output: { type: 'text', file: { numLines: 212 } } }
  })
  expect(await mine.find({ type: 'Text', text: /^212 lines$/ })).toBeDefined()
  await mine.unmount()

  for (const props of [
    { ...base, tool: 'Read', input: { file_path: 'src/a.ts' }, isExpanded: true },
    { ...base, tool: 'Mystery', input: { q: 1 } }
  ]) {
    const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'ToolUse', viewport: VIEW, props })
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a turn that opens on tools: `claude` on its first step (the activity header)', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'read package.json', toolUses: [] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'first', tool: 'Read' }] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'second', tool: 'Read' }] }
      // Only the fields the mod reads; the full ToolUseSummary carries more.
    ] as never
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const row = (id: string) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolUse',
      viewport: VIEW,
      props: {
        tool_use_id: id,
        tool: 'Read',
        input: { file_path: 'a.ts' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        output: { type: 'text', file: { numLines: 3 } }
      }
    })

  const first = await row('first')
  expect(await first.find({ type: 'Text', text: /^claude$/ })).toBeDefined()
  await first.unmount()

  const second = await row('second')
  expect(await second.find({ type: 'Text', text: /^claude$/ })).toBeUndefined()
  await second.unmount()
})

test('an unknown tool that opens the turn: `claude` beside the engine row', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'do the thing', toolUses: [] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'm1', tool: 'Mystery' }] }
    ] as never
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEW,
    props: { tool_use_id: 'm1', tool: 'Mystery', input: { q: 1 }, isRunning: false, isErrored: false, isInterrupted: false }
  })
  expect(await ui.findAll({ type: 'Text', text: /^claude {6}$/ })).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await ui.unmount()
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
test('rhythm: narration and the activity row after it have one blank row between them', async ($, on) => {
  on('ui.render', engineText as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { stdout: 'a', stderr: '', interrupted: false } }))
  await $.turn.start({ text: 'x', turnId: 'r1' })
  await $.session.append(respond([{ type: 'tool_use', id: 's0', name: 'Bash', input: { command: 'ls', description: 'list files' } }], 'a0'))
  await $.tool.call({ tool: 'Bash', tool_use_id: 's0', command: 'ls', description: 'list files' } as never)
  await $.session.append(respond([{ type: 'text', text: 'Now checking the queue.' }], 'a1'))
  await $.session.append(respond([{ type: 'tool_use', id: 's1', name: 'Bash', input: { command: 'ls q', description: 'list the queue' } }], 'a2'))
  await $.tool.call({ tool: 'Bash', tool_use_id: 's1', command: 'ls q', description: 'list the queue' } as never)
  await $.session.append(respond([{ type: 'tool_use', id: 's2', name: 'Bash', input: { command: 'ls r', description: 'list the rest' } }], 'a3'))
  await $.tool.call({ tool: 'Bash', tool_use_id: 's2', command: 'ls r', description: 'list the rest' } as never)

  const row = async (id: string, command: string, description: string) => {
    const ui = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolUse',
      viewport: { columns: 120, rows: 40 },
      props: {
        tool_use_id: id,
        tool: 'Bash',
        input: { command, description },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        output: { stdout: 'a', stderr: '' }
      }
    })
    const rows = textAt(await ui.drawn(), 120)
    await ui.unmount()
    return rows
  }

  const afterNarration = await row('s1', 'ls q', 'list the queue')
  expect(afterNarration[0]).toBe('')
  expect(afterNarration[1]).toMatch(/● shell +list the queue/)
  // The next row in the same run: no blank row.
  const next = await row('s2', 'ls r', 'list the rest')
  expect(next[0]).toMatch(/● shell +list the rest/)
})

test('a browser run is one frame across its rows; the next block and the close rule end it', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  let now = 0
  on('clock.now', () => ({ value: (now += 100) }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: [{ type: 'text', text: 'ok' }] }))
  await $.turn.start({ text: 'check the page', turnId: 't1' })

  const calls = [
    { id: 'b1', tool: 'mcp__playwright__browser_navigate', input: { url: 'http://localhost:5173/products?page=6' } },
    { id: 'b2', tool: 'mcp__playwright__browser_click', input: { element: 'Find product', ref: 'e7' } }
  ]
  await $.session.append(respond([{ type: 'text', text: 'Checking the page first.' }], 'r0'))
  for (const c of calls) {
    await $.session.append(respond([{ type: 'tool_use', id: c.id, name: c.tool, input: c.input }], `r-${c.id}`))
    await $.tool.call({ tool: c.tool, tool_use_id: c.id, ...c.input } as never)
  }

  const row = (c: (typeof calls)[number]) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolUse',
      viewport: VIEW,
      props: {
        tool_use_id: c.id,
        tool: c.tool,
        input: c.input,
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        output: [{ type: 'text', text: 'ok' }]
      }
    })

  const first = await row(calls[0] as (typeof calls)[number])
  expect(await first.find({ type: 'Text', text: /^BROWSER$/ })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /^localhost:5173$/ })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /^goto {4}$/ })).toBeDefined()
  await first.unmount()

  const second = await row(calls[1] as (typeof calls)[number])
  expect(await second.find({ type: 'Text', text: /^BROWSER$/ })).toBeUndefined()
  expect(await second.find({ type: 'Text', text: /^click {3}$/ })).toBeDefined()
  expect(await second.find({ type: 'Text', text: /actions/ })).toBeUndefined()
  await second.unmount()

  // The turn ends on the browser run: the close rule draws the frame's bottom edge.
  await $.turn.complete({ answer: '', durationMs: 4200, isAborted: false, turnId: 't1', reason: 'answer' })
  const close = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'TurnDuration',
    viewport: VIEW,
    props: { word: 'Baked', durationMs: 4200 }
  })
  expect(await close.find({ type: 'Text', text: /^2 actions$/ })).toBeDefined()
  expect(await close.find({ type: 'Text', text: /2 browser actions/ })).toBeDefined()
  await close.unmount()
})
