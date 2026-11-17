import { expect, test } from 'claude-code/testing'

import { stepOf } from '../hooks/activity'
import { commandNotice, frameLines, partsWidth, planLine, tasksFrame } from '../hooks/states'

const OK = { isRunning: false, isErrored: false, isInterrupted: false }
const VIEW = { columns: 120, rows: 40 }
const PLAN =
  '# Fix the toast double-fire\n\n1. Extract the toast queue into its own module\n2. Add a **dedupe key** per message\n3. Cover the double-fire case in `toast.e2e.ts`'
const TODOS = {
  oldTodos: [],
  newTodos: [
    { content: 'extract queue module', status: 'completed', activeForm: 'Extracting' },
    { content: 'add dedupe key', status: 'in_progress', activeForm: 'Adding' },
    { content: 'cover double-fire case', status: 'pending', activeForm: 'Covering' },
    { content: 'run full e2e suite ' + 'and then some more words '.repeat(8), status: 'pending', activeForm: 'Running' }
  ]
}

test('every framed line is exactly the frame width, at any measure', async () => {
  for (const width of [96, 70, 40, 24]) {
    for (const lines of [
      tasksFrame(width, TODOS),
      frameLines(width, 'A VERY LONG TITLE '.repeat(9), { t: 'meta', color: '' }, [[{ t: 'x'.repeat(300), color: '' }]])
    ]) {
      expect(lines).toBeDefined()
      for (const l of lines ?? []) expect(partsWidth(l)).toBe(width)
    }
  }
})

test('plan: one dim line, `plan approved · <~-shortened path>`; the path keeps its file name', async () => {
  const path = (p: string) => p.replace(/^C:\/Users\/me/, '~')
  const line = planLine(96, { plan: PLAN, isAgent: false, filePath: 'C:/Users/me/.claude/plans/fix-toast.md' }, path) ?? []
  expect(line.map(p => p.t).join('')).toBe('plan approved · ~/.claude/plans/fix-toast.md')
  expect(line.every(p => p.color === '#4e4e5a')).toBe(true)

  // No plan file: the engine's block.
  expect(planLine(96, { plan: PLAN, isAgent: false }, path)).toBe(undefined)

  for (const width of [96, 50, 30]) {
    const l = planLine(width, { plan: 'x'.repeat(200), isAgent: false, filePath: `/home/me/${'deep/'.repeat(20)}plan.md` }, path) ?? []
    expect(partsWidth(l)).toBeLessThanOrEqual(width)
    expect(l.map(p => p.t).join('')).toMatch(/plan\.md$/)
  }

  expect(planLine(96, { plan: null, isAgent: false }, path)).toBe(undefined)
  expect(planLine(96, { plan: PLAN, isAgent: true, awaitingLeaderApproval: true }, path)).toBe(undefined)
  expect(planLine(96, 'oops', path)).toBe(undefined)
})

test('tasks: done / total, [x] [>] [ ], rail and percent', async () => {
  const lines = tasksFrame(60, TODOS) ?? []
  expect(lines[0]?.some(p => p.t === '1 / 4')).toBe(true)
  expect(lines[1]?.[1]?.t).toBe('[x]  ')
  expect(lines[2]?.some(p => p.t === '  in progress')).toBe(true)
  expect(lines[lines.length - 2]?.some(p => p.t.includes('25%'))).toBe(true)
  expect(tasksFrame(60, { newTodos: [] })).toBe(undefined)
  expect(tasksFrame(60, { newTodos: [{ content: 'x', status: 'weird' }] })).toBe(undefined)
})

test('permission: `needs you` only while asked and not yet running', async () => {
  const asking = stepOf('Bash', { command: 'rm -rf node_modules' }, undefined, { ...OK, isAsking: true })
  expect(asking?.dot.text).toBe('◇')
  expect(asking?.result[0]?.text).toBe('needs you')
  expect(asking?.detail).toBe('waiting for you')
  expect(stepOf('Bash', { command: 'ls' }, undefined, { ...OK, isRunning: true, isAsking: true })?.result[0]?.text).toBe('running')
  expect(stepOf('Bash', { command: 'ls' }, { stdout: 'a', stderr: '', interrupted: false }, { ...OK, isAsking: true })?.dot.text).toBe('●')
})

test('question, plan, task and source steps read their real shapes', async () => {
  const q = { questions: [{ question: 'Which branch should the fix land on?', header: 'Branch', options: [], multiSelect: false }] }
  const ask = stepOf('AskUserQuestion', q, { questions: q.questions, answers: { 'Which branch should the fix land on?': 'feature/toast-rebuild' } }, OK)
  expect(ask?.verb).toBe('ask')
  expect(ask?.result[0]?.text).toBe('❯ feature/toast-rebuild')

  expect(stepOf('ExitPlanMode', {}, { plan: PLAN, isAgent: false }, OK)?.target).toBe('Fix the toast double-fire')
  expect(stepOf('TaskUpdate', { taskId: '3', status: 'completed' }, { success: true, taskId: '3', updatedFields: ['status'] }, OK)?.result[0]?.text).toBe(
    'done'
  )
  expect(stepOf('TaskCreate', { subject: 'add dedupe key', description: 'x' }, { task: { id: '4', subject: 'add dedupe key' } }, OK)?.result[0]?.text).toBe(
    '#4'
  )
  expect(stepOf('WebFetch', { url: 'https://vitest.dev/guide/test-context', prompt: 'x' }, { code: 200 }, OK)?.targetColor).toBe('#686874') // a URL label is muted
})

test('an approved plan is one line; the task list a frame; ctrl+o and unreadable plans are the engine', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const result = (tool: string, output: unknown, isExpanded = false) =>
    $.ui.mount({
      plugin: 'graticule',
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

test('question dialog: the engine draws it, no rule above', async $ => {
  // No stub: the dialog site holds the engine's own node, which the kit supplies.

  const ui = await $.ui.mount({
    plugin: 'graticule',
    surface: 'terminal',
    component: 'AskUserQuestion',
    viewport: VIEW,
    props: { tool: 'AskUserQuestion', questions: [{ question: 'Which branch?', header: 'Branch', options: [], multiSelect: false }] }
  })
  expect(await ui.find({ type: 'Text', text: /^question $/ })).toBeUndefined()
  expect(await ui.findAll({ type: 'Box' })).toHaveLength(0)
  await ui.unmount()
})

test('a one-line command output is a notice; longer output keeps the dim markdown', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  expect(
    commandNotice('effort', 'high', 'Applies from next turn', 96)
      ?.map(p => p.t)
      .join('')
  ).toBe('/  /effort high · Applies from next turn')
  expect(
    commandNotice('compact', '', 'Compacted', 96)
      ?.map(p => p.t)
      .join('')
  ).toBe('↻  context compacted · Compacted')
  expect(commandNotice('cost', '', 'a\nb', 96)).toBe(undefined)
  expect(partsWidth(commandNotice('x', 'y', 'z'.repeat(300), 50) ?? [])).toBe(50)

  const ui = await $.ui.mount({
    plugin: 'graticule',
    surface: 'terminal',
    component: 'CommandOutput',
    viewport: VIEW,
    props: { command: 'effort', args: 'high', text: 'Applies from next turn', isErrored: false }
  })
  expect(await ui.find({ type: 'Text', text: /^\/effort high$/ })).toBeDefined()
  await ui.unmount()
})
