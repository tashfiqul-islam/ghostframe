import { expect, test } from 'claude-code/testing'

const VIEW = { columns: 120, rows: 40 }

type Node = { type?: string; props?: Record<string, unknown>; text?: string; children?: unknown[] }

/** The engine stub's path from the root: every Box above it, outermost first. */
function boxesAbove(node: unknown, path: Node[] = []): Node[] | undefined {
  if (typeof node !== 'object' || node === null) return undefined

  const n = node as Node

  if (n.type === 'Text' && (n.text === 'engine' || n.children?.[0] === 'engine')) return path

  for (const c of n.children ?? []) {
    const found = boxesAbove(c, n.type === 'Box' ? [...path, n] : path)

    if (found !== undefined) return found
  }

  return undefined
}

const SEARCH_GROUP = {
  calls: [
    { tool_use_id: 'g1', tool: 'Grep', input: { pattern: 'TODO' }, isRunning: false, isErrored: false, isInterrupted: false, output: { mode: 'count', numFiles: 1, filenames: [], numMatches: 3 } },
    { tool_use_id: 'g2', tool: 'Read', input: { file_path: 'a.ts' }, isRunning: false, isErrored: false, isInterrupted: false, output: { type: 'text', file: { numLines: 3 } } }
  ],
  isActive: false,
  isExpanded: false,
  // Not calls-only (say a hook-timing row joined it): the engine draws the line.
  isCallsOnly: false
}

test('a folded engine group that opens the turn keeps the activity rule and `claude`', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'search then read', toolUses: [] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'g1', tool: 'Grep' }] }
    ] as never
  }))
  let now = 1000
  on('clock.now', () => ({ value: (now += 100) }))
  on('tool.call', () => ({ result: {} }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  // Stamp the two calls the way a live turn does: turn.start, then each tool.call, timed.
  await $.turn.start({ text: 'search then read', turnId: 't1' })
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', tool_use_id: 'g1' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', tool_use_id: 'g2' } as never)

  const ui = await $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'ToolGroup', viewport: VIEW, props: SEARCH_GROUP })

  expect(await ui.findAll({ type: 'Text', text: /^claude$/ })).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^activity $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ 2 steps · 0\.3s$/ })).toBeDefined()
  expect(await ui.findAll({ type: 'Text', text: /^engine$/ })).toHaveLength(1)

  // The engine's node: indented to the step dots by padding, under no Box with a size.
  const root = (await ui.findAll({ type: 'Box' }))[0]
  const above = boxesAbove(root) ?? []
  expect(above.length).toBeGreaterThan(0)
  expect(above.some(b => b.props?.width !== undefined || b.props?.minWidth !== undefined || b.props?.height !== undefined)).toBe(false)
  expect(above[above.length - 1]?.props?.paddingLeft).toBe(12)
  await ui.unmount()
})

test('a folded engine group mid-turn: indented, no rule, no label', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const ui = await $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'ToolGroup', viewport: VIEW, props: SEARCH_GROUP })
  expect(await ui.find({ type: 'Text', text: /^claude$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^activity $/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  const root = (await ui.findAll({ type: 'Box' }))[0]
  expect(boxesAbove(root)?.some(b => b.props?.paddingLeft === 12)).toBe(true)
  await ui.unmount()

  // ctrl+o (expanded) is the engine's alone, unwrapped.
  const open = await $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'ToolGroup', viewport: VIEW, props: { ...SEARCH_GROUP, isExpanded: true } })
  expect(await open.findAll({ type: 'Box' })).toHaveLength(0)
  await open.unmount()
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
    plugin: 'graticule', surface: 'terminal', component: 'ToolUse', viewport: VIEW,
    props: { tool_use_id: 'm1', tool: 'Mystery', input: { q: 1 }, isRunning: false, isErrored: false, isInterrupted: false }
  })
  expect(await ui.findAll({ type: 'Text', text: /^claude {6}$/ })).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await ui.unmount()
})

test('a summary row: dim text in the content column, no bullet', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const ui = await $.ui.mount({
    plugin: 'graticule', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW,
    props: { text: 'Checked the config and the tests', isFirstOfReply: true, isSummary: true }
  })
  const body = await ui.find({ type: 'Text', text: /^Checked the config and the tests$/ })
  expect(body?.props.color).toBe('#4e4e5a')
  expect(await ui.find({ type: 'Text', text: /●/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^claude$/ })).toBeUndefined()
  await ui.unmount()
})
