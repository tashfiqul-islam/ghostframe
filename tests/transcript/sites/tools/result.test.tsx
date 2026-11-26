import { expect, test } from 'claude-code/testing'

import { stepOf } from '../../../../hooks/transcript/activity/steps'
import { VIEW } from '../../../support/view'
import { OFF, ON, VIEW as COCKPIT_VIEW } from '../../../support/cockpit'
import { PLAN, TODOS } from '../../../support/states'

test('diff card off by default; only a new file under 12 lines; ctrl+o is the engine', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const result = (output: unknown, isExpanded?: boolean) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolResult',
      viewport: VIEW,
      props: { tool_use_id: 'e1', tool: 'Write', isErrored: false, output, ...(isExpanded ? { isExpanded } : {}) }
    })

  const patch = [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 3, lines: [' keep', '+a', '+b'] }]
  const edit = await result({ type: 'update', filePath: 'src/q.ts', content: 'x', structuredPatch: patch, originalFile: 'keep' })
  expect(await edit.findAll({ type: 'Text' })).toHaveLength(0)
  await edit.unmount()

  const small = await result({ type: 'create', filePath: 'src/new.ts', content: 'one\ntwo\nthree\n', structuredPatch: [], originalFile: null })
  expect(await small.find({ type: 'Text', text: /^src\/new\.ts$/ })).toBeDefined()
  expect(await small.find({ type: 'Text', text: /^\+3$/ })).toBeDefined()
  await small.unmount()

  const big = await result({ type: 'create', filePath: 'src/big.ts', content: 'x\n'.repeat(12), structuredPatch: [], originalFile: null })
  expect(await big.findAll({ type: 'Text' })).toHaveLength(0)
  await big.unmount()

  const expanded = await result({ type: 'update', filePath: 'src/q.ts', content: 'x', structuredPatch: patch, originalFile: 'keep' }, true)
  expect(await expanded.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await expanded.unmount()
})

test('shell output: no lines by default; ctrl+o is the engine, without its own notes', async ($, on) => {
  on('ui.render', ($, e) => {
    const out = (e.props as { output?: { stdout?: string } }).output

    return $.ui.resolve(e).Text({ children: `engine:${out?.stdout ?? ''}` })
  })

  const output = { stdout: '1\n2\n3\n4\n5\nShell cwd was reset to D:\\Projects', stderr: '', interrupted: false }
  const mount = (isExpanded: boolean) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolResult',
      viewport: VIEW,
      props: { tool_use_id: 'b1', tool: 'Bash', isErrored: false, isExpanded, output }
    })

  const shell = await mount(false)
  expect(await shell.findAll({ type: 'Text' })).toHaveLength(0)
  await shell.unmount()

  const open = await mount(true)
  expect(await open.find({ type: 'Text', text: /^engine:1\n2\n3\n4\n5\n?$/ })).toBeDefined()
  expect(await open.find({ type: 'Text', text: /Shell cwd/ })).toBeUndefined()
  await open.unmount()
})

test('a test run draws a [ TESTS ] card with the change since the last run; unreadable output keeps the activity rows', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  let out = ' 10 pass\n 2 fail\n'
  on('tool.call', () => ({ result: { stdout: out, stderr: '', interrupted: false } }))
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 's1' } as never)
  out = ' 12 pass\n 0 fail\n'
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 's2' } as never)
  out = 'hello\nworld\n'
  await $.tool.call({ tool: 'Bash', command: 'echo hello', tool_use_id: 's3' } as never)

  const result = (id: string, isErrored = false) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolResult',
      viewport: VIEW,
      props: { tool_use_id: id, tool: 'Bash', isErrored, output: { stdout: out, stderr: '' } }
    })

  const failing = await result('s1', true)
  expect(await failing.find({ type: 'Text', text: /^TESTS$/ })).toBeDefined()
  expect(await failing.find({ type: 'Text', text: /^2 failing$/ })).toBeDefined()
  await failing.unmount()

  const fixed = await result('s2')
  expect(await fixed.find({ type: 'Text', text: /^all passing$/ })).toBeDefined()
  expect(await fixed.find({ type: 'Text', text: /^was 10 passed · 2 failing$/ })).toBeDefined()
  await fixed.unmount()

  const plain = await result('s3')
  expect(await plain.find({ type: 'Text', text: /^TESTS$/ })).toBeUndefined()
  expect(await plain.findAll({ type: 'Text' })).toHaveLength(0) // no output lines: the row says ✓
  await plain.unmount()
})

test('a commit draws a [ SHIPPED ] card', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('tool.call', () => ({
    result: { stdout: '[main a1b2c3d] fix(toast): dedupe by key\n 3 files changed, 48 insertions(+), 12 deletions(-)', stderr: '', interrupted: false }
  }))
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix(toast): dedupe by key"', tool_use_id: 'g1' } as never)

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolResult',
    viewport: VIEW,
    props: { tool_use_id: 'g1', tool: 'Bash', isErrored: false, output: { stdout: '', stderr: '' } }
  })
  expect(await ui.find({ type: 'Text', text: /^SHIPPED$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^committed$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^a1b2c3d$/ })).toBeDefined()
  await ui.unmount()
})

test("final evidence: only a turn's last test run and last shipping call draw cards", OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  let out = ' 69 pass\n 6 fail\n'
  on('tool.call', () => ({ result: { stdout: out, stderr: '', interrupted: false } }))
  await $.turn.start({ text: 'fix it', turnId: 't1' })

  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'a' } as never)
  out = '[main a1b2c3d] fix: one\n 1 file changed, 2 insertions(+)'
  await $.tool.call({ tool: 'Bash', command: 'git commit -m one', tool_use_id: 'c1' } as never)
  out = ' 75 pass\n 0 fail\n'
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'b' } as never)
  out = 'https://github.com/me/app/pull/9\n'
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --base main', tool_use_id: 'pr' } as never)

  const result = (id: string) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolResult',
      viewport: VIEW,
      props: { tool_use_id: id, tool: 'Bash', isErrored: false, output: { stdout: '', stderr: '' } }
    })

  for (const id of ['a', 'c1']) {
    const early = await result(id)
    expect(await early.findAll({ type: 'Text' })).toHaveLength(0)
    await early.unmount()
  }

  const last = await result('b')
  expect(await last.find({ type: 'Text', text: /^TESTS$/ })).toBeDefined()
  expect(await last.find({ type: 'Text', text: /^was 69 passed · 6 failing$/ })).toBeDefined()
  await last.unmount()

  // The last shipping call carries the turn's commit and its PR.
  const ship = await result('pr')
  expect(await ship.find({ type: 'Text', text: /^SHIPPED$/ })).toBeDefined()
  expect(await ship.find({ type: 'Text', text: /^a1b2c3d$/ })).toBeDefined()
  expect(await ship.find({ type: 'Text', text: /^#9$/ })).toBeDefined()
  expect(await ship.find({ type: 'Text', text: /^PR open$/ })).toBeDefined()
  await ship.unmount()

  // The earlier steps' rows say what they did.
  const ok = { isRunning: false, isErrored: false, isInterrupted: false }
  expect(stepOf('Bash', { command: 'git commit -m one' }, { stdout: '[main a1b2c3d] fix: one', stderr: '' }, ok)?.result.map(r => r.text)).toEqual([
    'committed',
    'a1b2c3d'
  ])
  expect(stepOf('Bash', { command: 'bun test' }, 'Exit code 1\n 69 pass\n 6 fail', { ...ok, isErrored: true })?.result[0]?.text).toBe('6 fail')
})

/** Each card line as drawn: the one-line Texts the card is built from. */
async function cardLinesOf(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; text: string }[]> }) {
  return (await ui.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
}

test('a card streams stable: once drawn, no line changes and none repeats while the turn goes on', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  let now = 0
  on('clock.now', () => ({ value: (now += 250) }))
  const FULL = ' (pass) a\n (pass) b\n\n 74 pass\n 1 fail\nRan 75 tests'
  let out = FULL
  on('tool.call', () => ({ result: { stdout: out, stderr: '', interrupted: false } }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'r0' } as never) // an earlier turn's-worth of history
  await $.turn.start({ text: 'again', turnId: 't2' })

  // The run's row streams its output, then its result block draws the card.
  const row = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEW,
    props: {
      tool_use_id: 'r1',
      tool: 'Bash',
      input: { command: 'bun test', description: 'Run the tests' },
      isRunning: true,
      isErrored: false,
      isInterrupted: false
    }
  })
  for (const cut of [10, 25, FULL.length]) {
    await row.redraw({
      tool_use_id: 'r1',
      tool: 'Bash',
      input: { command: 'bun test', description: 'Run the tests' },
      isRunning: true,
      isErrored: false,
      isInterrupted: false,
      output: { stdout: FULL.slice(0, cut), stderr: '' }
    })
  }
  await $.tool.call({ tool: 'Bash', command: 'bun test', tool_use_id: 'r1' } as never)
  await row.unmount()

  const props = { tool_use_id: 'r1', tool: 'Bash', isErrored: true, output: { stdout: FULL, stderr: '' } }
  const card = await $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'ToolResult', viewport: VIEW, props })
  const first = await cardLinesOf(card)
  expect(first.some(l => /TESTS/.test(l))).toBe(true)

  // The turn goes on: more calls stamp steps and runs; the card re-draws each time.
  out = 'ok'
  for (let i = 0; i < 4; i++) {
    await $.tool.call({ tool: 'Bash', command: `echo ${i}`, tool_use_id: `e${i}` } as never)
    await card.redraw(props)
    const lines = await cardLinesOf(card)
    expect(lines).toEqual(first)
    const seen = new Set<string>()
    for (const l of lines.filter(x => x.trim().length > 0 && !/^\+┄+\+$/.test(x))) {
      expect(seen.has(l)).toBe(false)
      seen.add(l)
    }
  }
  expect(first.filter(l => /was 74 passed · 1 failing/.test(l))).toHaveLength(0) // same counts as before: no `was`
  await card.unmount()
})

test('an approved plan is one line; the task list a frame; ctrl+o and unreadable plans are the engine', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const result = (tool: string, output: unknown, isExpanded = false) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolResult',
      viewport: VIEW,
      props: { tool_use_id: 'p1', tool, isErrored: false, output, isExpanded }
    })

  const plan = await result('ExitPlanMode', { plan: PLAN, isAgent: false, filePath: '/tmp/plan.md' })
  expect(await plan.find({ type: 'Text', text: /^plan approved · \/tmp\/plan\.md$/ })).toBeDefined()
  expect(await plan.find({ type: 'Text', text: /Fix the toast/ })).toBeUndefined()
  expect(await plan.find({ type: 'Text', text: /^PLAN$/ })).toBeUndefined()
  expect(await plan.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  expect(await plan.findAll({ type: 'Text', text: /Extract the toast queue/ })).toHaveLength(0)
  await plan.unmount()

  const expanded = await result('ExitPlanMode', { plan: PLAN, isAgent: false }, true)
  expect(await expanded.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await expanded.unmount()

  const tasks = await result('TodoWrite', TODOS)
  expect(await tasks.find({ type: 'Text', text: /^TASKS$/ })).toBeDefined()
  await tasks.unmount()

  const none = await result('ExitPlanMode', { plan: null, isAgent: false })
  expect(await none.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  expect((await none.findAll({ type: 'Box' })).some(b => b.props['paddingLeft'] === 12)).toBe(true)
  await none.unmount()

  const asked = await result('AskUserQuestion', { questions: [], answers: {} })
  expect(await asked.findAll({ type: 'Text' })).toHaveLength(0)
  await asked.unmount()
})

test("Cockpit on: a shell call's result row draws no [ TESTS ] card, docked or in fallback (live check, step 2)", ON, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('tool.call', () => ({ result: { stdout: ' 0 pass\n 3 fail\n', stderr: '', interrupted: false } }))
  const command = 'sed -i "4s/toBe(3)/toBe(4)/" src/width.test.ts && bun test'

  await $.tool.call({ tool: 'Bash', command, tool_use_id: 'c1' } as never)

  for (const viewport of [COCKPIT_VIEW, { columns: 100, rows: 40, isFullscreen: true }]) {
    const row = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolResult',
      viewport,
      props: { tool_use_id: 'c1', tool: 'Bash', isErrored: true, output: { stdout: ' 0 pass\n 3 fail\n', stderr: '' } }
    })

    expect(await row.find({ type: 'Text', text: /^TESTS$/ })).toBeUndefined()
    expect(await row.findAll({ type: 'Text' })).toHaveLength(0)
    await row.unmount()
  }
})
