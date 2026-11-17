import { expect, test } from 'claude-code/testing'

import { LEAD, activityHead, changeParts, clipPath, describe, diffRows, diffTop, foldOutput, layoutStep, relPath, stepOf } from '../hooks/activity'
import type { Step } from '../hooks/activity'
import { vw } from '../hooks/grid'

const OK = { isRunning: false, isErrored: false, isInterrupted: false }
const CWD = 'D:\\Projects\\app'

const rowWidth = (step: Step, time: string, width: number) => {
  const l = layoutStep(step, time, width)
  return 2 + vw(l.verb) + vw(l.target) + vw(l.gap) + vw(step.result.map(r => r.text).join(' ')) + vw(l.timeCell)
}

test('verbs and targets follow the v3 timeline', async () => {
  expect(describe('Read', { file_path: 'D:\\Projects\\app\\src\\toast\\queue.ts' }, CWD)).toEqual({ verb: 'read', target: 'src/toast/queue.ts', isPath: true })
  expect(describe('Grep', { pattern: 'pushToast(', path: 'src' }, CWD)?.target).toBe('"pushToast(" in src')
  expect(describe('Bash', { command: 'bun test toast' })?.verb).toBe('test')
  expect(describe('Bash', { command: 'git status\ngit log' })).toEqual({ verb: 'shell', target: 'git status', isPath: false })
  expect(describe('mcp__github__list_pull_requests', {})?.target).toBe('github · list_pull_requests')
  expect(describe('SomethingNew', { x: 1 })).toBe(undefined)
})

test('the dot is the state, one state everywhere', async () => {
  const input = { file_path: 'a.ts' }
  expect(stepOf('Read', input, undefined, { ...OK, isRunning: true })?.dot.text).toBe('◐')
  expect(stepOf('Read', input, 'x', { ...OK, isInterrupted: true })?.result[0]?.text).toBe('interrupted')
  expect(stepOf('Write', input, "The user doesn't want to proceed with this tool use.", { ...OK, isErrored: true })?.result[0]?.text).toBe('denied')

  const failed = stepOf('Bash', { command: 'bun test toast' }, 'Error: Exit code 1\ntoast.e2e.ts:42  expected 1 toast, got 2', { ...OK, isErrored: true })
  expect(failed?.result[0]?.text).toBe('exit 1')
  expect(failed?.detail).toBe('toast.e2e.ts:42  expected 1 toast, got 2')
})

test('results read from the real output shapes', async () => {
  expect(stepOf('Read', { file_path: 'a' }, { type: 'text', file: { numLines: 212 } }, OK)?.result[0]?.text).toBe('212 lines')
  expect(stepOf('Grep', { pattern: 'x' }, { mode: 'count', numFiles: 2, filenames: [], numMatches: 9 }, OK)?.result[0]?.text).toBe('9 matches')
  expect(stepOf('Glob', { pattern: '*.ts' }, { numFiles: 0, filenames: [] }, OK)?.result[0]?.text).toBe('no files')

  const patch = [{ oldStart: 10, oldLines: 2, newStart: 10, newLines: 3, lines: [' a', '-b', '+c', '+d'] }]
  expect(stepOf('Edit', { file_path: 'a' }, { filePath: 'a', structuredPatch: patch }, OK)?.result.map(r => r.text)).toEqual(['+2', '−1'])
})

test('every step row is exactly the measure wide', async () => {
  const long = stepOf('Read', { file_path: 'src/' + 'deep/'.repeat(40) + 'file.ts' }, { type: 'text', file: { numLines: 9 } }, OK)
  const fail = stepOf('Bash', { command: 'x'.repeat(300) }, 'Exit code 128', { ...OK, isErrored: true })

  for (const step of [long, fail]) {
    if (step === undefined) throw new Error('no step')
    for (const width of [96, 70, 40]) for (const time of ['0.1s', '41s', '']) expect(rowWidth(step, time, width)).toBe(width)
  }

  expect(layoutStep(long as Step, '0.1s', 60).target).toContain('…')
})

test('paths: relative inside the session, ~ for home, one slash style, clipped at folders', async () => {
  const scratch = 'C:\\Users\\me\\AppData\\Local\\Temp\\notebook-scratch.txt'
  expect(relPath(scratch, 'D:\\Projects')).toBe('~/AppData/Local/Temp/notebook-scratch.txt')
  expect(relPath('/home/ana/src/x.ts', '/srv')).toBe('~/src/x.ts')
  expect(relPath('D:\\Projects\\app\\src\\a.ts', 'D:\\Projects')).toBe('app/src/a.ts')
  expect(relPath('D:\\other\\b.ts', 'D:\\Projects')).toBe('D:/other/b.ts')

  expect(clipPath('~/AppData/Local/Temp/notebook-scratch.txt', 38)).toBe('~/AppData/…/Temp/notebook-scratch.txt')
  expect(clipPath('~/AppData/Local/Temp/notebook-scratch.txt', 32)).toBe('~/AppData/…/notebook-scratch.txt')
  expect(clipPath('~/AppData/Local/Temp/notebook-scratch.txt', 30)).toBe('…/Temp/notebook-scratch.txt')
  expect(vw(clipPath('~/a/' + 'x'.repeat(80) + '.txt', 20))).toBe(20)

  const step = stepOf('Write', { file_path: scratch }, { type: 'create', content: 'a\nb\n', structuredPatch: [] }, OK, 'D:\\Projects')
  expect(layoutStep(step as Step, '0.1s', 60).target).toBe('~/AppData/…/Temp/notebook-scratch.txt')
  expect(layoutStep(step as Step, '0.1s', 50).target).toBe('…/Temp/notebook-scratch.txt')
  expect(layoutStep(step as Step, '0.1s', 96).target).toBe('~/AppData/Local/Temp/notebook-scratch.txt')
})

test('change counts never show +0 or −0', async () => {
  const edit = (lines: string[]) =>
    stepOf('Edit', { file_path: 'a' }, { filePath: 'a', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines }] }, OK)?.result.map(r => r.text)

  expect(edit([' a', '+b'])).toEqual(['+1'])
  expect(edit([' a', '-b'])).toEqual(['−1'])
  expect(edit([' a'])).toEqual(['ok'])
  expect(changeParts(0, 0)).toEqual([])
})

test('the activity rule sits on the first step of its turn', async () => {
  const list = [
    { id: 'a', turn: 't1', at: 1000, ms: 100 },
    { id: 'b', turn: 't2', at: 5000, ms: 200 },
    { id: 'c', turn: 't2', at: 5300, ms: 41_000 - 300 }
  ]
  expect(activityHead(list, 'b')).toBe('2 steps · 41s')
  expect(activityHead(list, 'c')).toBe(undefined)
  expect(activityHead([...list.slice(0, 2), { id: 'c', turn: 't2', at: 5300, ms: null }], 'b')).toBe('2 steps')
})

test('diff card: numbered rows, top edge exactly the width', async () => {
  const patch = [{ oldStart: 10, oldLines: 2, newStart: 10, newLines: 3, lines: [' a', '-b', '+c', '+d'] }]
  const d = diffRows({ filePath: 'src/toast/queue.ts', structuredPatch: patch })
  expect(d?.rows.map(r => `${r.kind}:${r.no}`)).toEqual(['ctx:10', 'del:11', 'add:11', 'add:12'])

  for (const width of [96, 60, 40]) {
    for (const parts of [changeParts(18, 4), changeParts(3, 0), changeParts(0, 0)]) {
      expect(diffTop(width, 'src/' + 'very/'.repeat(30) + 'long.ts', parts, '22 lines').total).toBe(width)
    }
  }

  expect(diffRows({ filePath: 'n.ts', structuredPatch: [], content: 'one\ntwo\n' })?.adds).toBe(2)
})

test('shell output folds: first 2, a fold, the last', async () => {
  expect(foldOutput('a\nb')).toEqual({ lines: ['a', 'b'], more: 0 })
  expect(foldOutput('1\n2\n3\n4\n5\n6')).toEqual({ lines: ['1', '2'], more: 3, last: '6' })
  expect(foldOutput('   ')).toBe(undefined)
  expect(LEAD).toBe(10)
})

const VIEW = { columns: 120, rows: 40 }

test('rows: ours when readable, the engine when expanded or unknown', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const base = { tool_use_id: 'x1', isRunning: false, isErrored: false, isInterrupted: false }
  const mine = await $.ui.mount({
    plugin: 'graticule', surface: 'terminal', component: 'ToolUse', viewport: VIEW,
    props: { ...base, tool: 'Read', input: { file_path: 'src/a.ts' }, output: { type: 'text', file: { numLines: 212 } } }
  })
  expect(await mine.find({ type: 'Text', text: /^212 lines$/ })).toBeDefined()
  await mine.unmount()

  for (const props of [
    { ...base, tool: 'Read', input: { file_path: 'src/a.ts' }, isExpanded: true },
    { ...base, tool: 'Mystery', input: { q: 1 } }
  ]) {
    const ui = await $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'ToolUse', viewport: VIEW, props })
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('diff card off by default; only a new file under 12 lines; ctrl+o is the engine', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const result = (output: unknown, isExpanded?: boolean) =>
    $.ui.mount({
      plugin: 'graticule', surface: 'terminal', component: 'ToolResult', viewport: VIEW,
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
    $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'ToolResult', viewport: VIEW, props: { tool_use_id: 'b1', tool: 'Bash', isErrored: false, isExpanded, output } })

  const shell = await mount(false)
  expect(await shell.findAll({ type: 'Text' })).toHaveLength(0)
  await shell.unmount()

  const open = await mount(true)
  expect(await open.find({ type: 'Text', text: /^engine:1\n2\n3\n4\n5\n?$/ })).toBeDefined()
  expect(await open.find({ type: 'Text', text: /Shell cwd/ })).toBeUndefined()
  await open.unmount()
})

test('shell rows: the description is the target; the result is ✓, ✗ exit N, or the test summary', async () => {
  expect(describe('Bash', { command: 'claude plugin test .', description: 'Run plugin tests' })).toEqual({ verb: 'test', target: 'Run plugin tests', isPath: false })
  expect(describe('Bash', { command: 'git status' })?.target).toBe('git status')

  const pass = stepOf('Bash', { command: 'bun test' }, { stdout: ' 56 pass\n 0 fail\nShell cwd was reset to D:\\Projects', stderr: '' }, OK)
  expect(pass?.result).toEqual([{ text: '56 pass', color: '#96d292' }])
  const fail = stepOf('Bash', { command: 'bun test' }, 'Error: Exit code 1\n 53 pass\n 3 fail', { ...OK, isErrored: true })
  expect(fail?.result).toEqual([{ text: '3 fail', color: '#ec84a0' }])
  expect(stepOf('Bash', { command: 'ls' }, { stdout: 'a\nb', stderr: '' }, OK)?.result[0]?.text).toBe('ok')
  expect(stepOf('Bash', { command: 'make' }, 'Error: Exit code 2\nmake: *** no rule', { ...OK, isErrored: true })?.result[0]?.text).toBe('exit 2')
  // The engine's note is never the detail line.
  expect(stepOf('Bash', { command: 'false' }, 'Error: Exit code 1\nShell cwd was reset to D:\\Projects\nreal reason', { ...OK, isErrored: true })?.detail).toBe('real reason')
})

test('a group we cannot draw whole is the engine node, under no sized Box', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const read = { tool_use_id: 'r1', tool: 'Read', input: { file_path: 'a.ts' }, isRunning: false, isErrored: false, isInterrupted: false }
  for (const props of [
    { calls: [read], isActive: false, isExpanded: false, isCallsOnly: false },
    { calls: [read, { ...read, tool_use_id: 'r2', tool: 'Mystery', input: { q: 1 } }], isActive: false, isExpanded: false, isCallsOnly: true }
  ]) {
    const ui = await $.ui.mount({ plugin: 'graticule', surface: 'terminal', component: 'ToolGroup', viewport: VIEW, props })
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
    // Only the indent wrappers: no Box here carries a width or height.
    for (const b of await ui.findAll({ type: 'Box' })) {
      expect(b.props.width === undefined && b.props.height === undefined && b.props.minWidth === undefined).toBe(true)
    }
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
      plugin: 'graticule', surface: 'terminal', component: 'ToolUse', viewport: VIEW,
      props: { tool_use_id: id, tool: 'Read', input: { file_path: 'a.ts' }, isRunning: false, isErrored: false, isInterrupted: false, output: { type: 'text', file: { numLines: 3 } } }
    })

  const first = await row('first')
  expect(await first.find({ type: 'Text', text: /^claude$/ })).toBeDefined()
  await first.unmount()

  const second = await row('second')
  expect(await second.find({ type: 'Text', text: /^claude$/ })).toBeUndefined()
  await second.unmount()
})

test('a folded group of reads becomes timeline rows', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  const call = (id: string, file: string, n: number) => ({
    tool_use_id: id, tool: 'Read', input: { file_path: file }, isRunning: false, isErrored: false, isInterrupted: false,
    output: { type: 'text', file: { numLines: n } }
  })
  const ui = await $.ui.mount({
    plugin: 'graticule', surface: 'terminal', component: 'ToolGroup', viewport: VIEW,
    props: { calls: [call('g1', 'a.ts', 3), call('g2', 'b.ts', 7)], isActive: false, isExpanded: false, isCallsOnly: true }
  })
  expect(await ui.find({ type: 'Text', text: /^3 lines$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^7 lines$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  await ui.unmount()
})
