import { expect, test } from 'claude-code/testing'

import { VIEW } from '../../../support/view'
import { OFF } from '../../../support/cockpit'

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
    {
      tool_use_id: 'g1',
      tool: 'Grep',
      input: { pattern: 'TODO' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { mode: 'count', numFiles: 1, filenames: [], numMatches: 3 }
    },
    {
      tool_use_id: 'g2',
      tool: 'Read',
      input: { file_path: 'a.ts' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { type: 'text', file: { numLines: 3 } }
    }
  ],
  isActive: false,
  isExpanded: false,
  // Not calls-only (say a hook-timing row joined it): the engine draws the line.
  isCallsOnly: false
}

test('a folded engine group that opens the turn keeps the activity rule and `claude`', OFF, async ($, on) => {
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

  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'ToolGroup', viewport: VIEW, props: SEARCH_GROUP })

  expect(await ui.findAll({ type: 'Text', text: /^claude$/ })).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^activity $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ 2 steps · 0\.3s$/ })).toBeDefined()
  expect(await ui.findAll({ type: 'Text', text: /^engine$/ })).toHaveLength(1)

  // The engine's node: indented to the step dots by padding, under no Box with a size.
  const root = (await ui.findAll({ type: 'Box' }))[0]
  const above = boxesAbove(root) ?? []
  expect(above.length).toBeGreaterThan(0)
  expect(above.some(b => b.props?.['width'] !== undefined || b.props?.['minWidth'] !== undefined || b.props?.['height'] !== undefined)).toBe(false)
  expect(above[above.length - 1]?.props?.['paddingLeft']).toBe(12)
  await ui.unmount()
})

test('a folded engine group mid-turn: indented, no rule, no label', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'ToolGroup', viewport: VIEW, props: SEARCH_GROUP })
  expect(await ui.find({ type: 'Text', text: /^claude$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^activity $/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  const root = (await ui.findAll({ type: 'Box' }))[0]
  expect(boxesAbove(root)?.some(b => b.props?.['paddingLeft'] === 12)).toBe(true)
  await ui.unmount()

  // ctrl+o (expanded) is the engine's alone, unwrapped.
  const open = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolGroup',
    viewport: VIEW,
    props: { ...SEARCH_GROUP, isExpanded: true }
  })
  expect(await open.findAll({ type: 'Box' })).toHaveLength(0)
  await open.unmount()
})

test('a group we cannot draw whole is the engine node, under no sized Box', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const read = { tool_use_id: 'r1', tool: 'Read', input: { file_path: 'a.ts' }, isRunning: false, isErrored: false, isInterrupted: false }
  for (const props of [
    { calls: [read], isActive: false, isExpanded: false, isCallsOnly: false },
    { calls: [read, { ...read, tool_use_id: 'r2', tool: 'Mystery', input: { q: 1 } }], isActive: false, isExpanded: false, isCallsOnly: true }
  ]) {
    const ui = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'ToolGroup', viewport: VIEW, props })
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    // Only the indent wrappers: no Box here carries a width or height.
    for (const b of await ui.findAll({ type: 'Box' })) {
      expect(b.props['width'] === undefined && b.props['height'] === undefined && b.props['minWidth'] === undefined).toBe(true)
    }
    await ui.unmount()
  }
})

test('a folded group of reads becomes timeline rows', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const call = (id: string, file: string, n: number) => ({
    tool_use_id: id,
    tool: 'Read',
    input: { file_path: file },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    output: { type: 'text', file: { numLines: n } }
  })
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolGroup',
    viewport: VIEW,
    props: { calls: [call('g1', 'a.ts', 3), call('g2', 'b.ts', 7)], isActive: false, isExpanded: false, isCallsOnly: true }
  })
  expect(await ui.find({ type: 'Text', text: /^3 lines$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^7 lines$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  await ui.unmount()
})
