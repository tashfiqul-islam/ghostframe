import { expect, test } from 'claude-code/testing'

import { PANE_HINT } from '../../../hooks/cockpit/pane'
import { ON, PANE, T0, VIEW } from '../../support/cockpit'
import type { Engine, On } from '../../support/engine'

// Phase 7 keys in the v8 pane (8.1 to 8.11, 9.5): Cockpit's keys are hotkey Buttons drawn only while the pane holds the
// keyboard; `1` to `5` switch tabs, Enter on a row opens it (a drawer, a diff, a URL copy, an agent); Escape (the
// engine's) gives the keyboard back, and the pane then draws the timeline again.
const FAIL_OUT = ['tests/width.test.tsx:', '(fail) width > counts a skin-tone modifier [0.38ms]', ' 12 pass', ' 2 fail'].join('\n')
const ASYNC = { result: { status: 'async_launched', agentId: 'x', description: 'x' }, text: 'launched' }

function engine(on: On, clock: { now: number }, copies: string[]) {
  on('clock.now', () => ({ value: clock.now }))
  on('clock.after', () => ({ value: { cancel: () => undefined } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.copy', (_, e) => {
    copies.push(e.text)

    return { value: { isCopied: true } }
  })
  on('ui.focus', { plugin: '*' }, () => ({}))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.spawn', (_, e) => ({ model: 'haiku', agentId: `ag-${e.description}` }))
  on('agent.list', () => ({ value: [] as never }))
  on('tool.call', (_, e) => {
    clock.now += 1_000

    switch (e.tool) {
      case 'Bash':
        return { result: { stdout: FAIL_OUT, stderr: '' }, isError: true, text: FAIL_OUT } as never
      case 'Edit':
        return {
          result: { structuredPatch: [{ oldStart: 40, oldLines: 1, newStart: 40, newLines: 2, lines: ['-old line', '+new line', '+another'] }] },
          text: 'ok'
        }
      case 'Agent':
        return ASYNC
      default:
        return { result: { file: { numLines: 3 } }, text: 'ok' }
    }
  })
  // The engine's hint line, as the engine would draw it: its text.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: e.component === 'PromptHint' ? String((e.props as { hint?: string }).hint) : 'engine' }))
}

async function aTurn($: Engine) {
  await $.prompt.submit({ text: 'fix the width test', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix the width test', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: 'tests/width.test.tsx', tool_use_id: 'r1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'bun test tests/width.test.tsx --bail', tool_use_id: 'b1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'hooks/shared/text.ts', old_string: 'a', new_string: 'b', tool_use_id: 'e1' } as never)
}

const pane = (isFocused: boolean) => ({ ...PANE, props: { ...PANE.props, isFocused } })
const HINT = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'PromptHint',
  viewport: VIEW,
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' }
} as const

async function texts(ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }): Promise<string[]> {
  return [...new Set((await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.trim().length > 0 && !t.includes('\n')))]
}

async function hint($: Engine): Promise<string> {
  const ui = await $.ui.mount(HINT)
  const t = (await texts(ui)).join(' ')
  await ui.unmount()

  return t
}

const hotkeysOf = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Button' })).flatMap(b => (typeof b.props['hotkey'] === 'string' ? [b.props['hotkey']] : []))

test('unfocused: the pane draws no key at all, so no key typed at the prompt can press one; the hint line is the engine`s', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)
  const ui = await $.ui.mount(pane(false))
  expect(await hotkeysOf(ui)).toEqual([])
  // The timeline's group is a Button still (a click opens it), under the step that decides it: the open failure.
  expect((await ui.findAll({ type: 'Button' })).map(b => (b.props as { key?: string }).key)).toContain('step:b1')
  await expect(ui.press({ key: 'key-s' })).rejects.toThrow()
  expect(await hint($)).toBe('? for shortcuts')
  await ui.unmount()
})

test('focused: every key is a hotkey (9.5), one digit or letter; the prompt`s hint line says `pane`; Escape gives both back', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)
  let ui = await $.ui.mount(pane(true))
  const keys = await hotkeysOf(ui)
  // `m` only while an agent is in view (8.10).
  expect(keys.toSorted()).toEqual(['1', '2', '3', '4', '5', 'b', 'c', 'l', 'n', 'p', 's', 'u'])
  for (const k of keys) expect(k).toMatch(/^[a-z0-9]$/)
  // The hint row shows what works here (8.12), and Escape is never offered as a key.
  expect((await texts(ui)).some(t => /^ {2}tab move {4}enter open {4}1–5 tabs/.test(t))).toBe(true)
  expect(await hint($)).toBe(PANE_HINT)
  await ui.unmount()

  // Escape: the engine hands the keyboard back; the pane draws unfocused, and the hint line is the engine`s again.
  ui = await $.ui.mount(pane(false))
  expect(await hint($)).toBe('? for shortcuts')
  await ui.unmount()
})

test('Enter on a group opens its drawer in place under it (8.4); `b` goes back; Escape closes it too', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)
  let ui = await $.ui.mount(pane(true))
  await ui.press({ key: 'step:b1' })
  await ui.redraw()
  let rows = await texts(ui)
  // The decisive step's kind and command, how it ended, its failing lines, the drawer's keys.
  expect(rows).toContainEqual(expect.stringMatching(/^ {6}test {4}bun test tests\/width\.test\.tsx --bail +failed/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {6}× \(fail\) width > counts a skin-tone modifier/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {6}c copy output   enter full output/))

  await ui.press({ key: 'key-b' })
  await ui.redraw()
  rows = await texts(ui)
  expect(rows.some(r => /c copy output/.test(r))).toBe(false)

  await ui.press({ key: 'step:b1' })
  await ui.unmount()
  // Escape: the pane, unfocused, is the timeline with no drawer.
  ui = await $.ui.mount(pane(false))
  expect((await texts(ui)).some(r => /c copy output/.test(r))).toBe(false)
  await ui.unmount()
})

test('Enter on an edit step (every step), or on its Files row, shows its diff (8.6)', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)
  const ui = await $.ui.mount(pane(true))

  for (const [tab, key] of [
    ['key-s', 'step:e1'],
    ['key-2', 'file:hooks/shared/text.ts']
  ] as const) {
    await ui.press({ key: tab })
    await ui.redraw()
    await ui.press({ key })
    await ui.redraw()
    const rows = await texts(ui)
    expect(rows).toContainEqual(expect.stringMatching(/^ {2}hooks\/shared\/text\.ts +\+2 −1  ·  1 hunk *$/))
    expect(rows).toContainEqual(expect.stringMatching(/^ {2}@@ 40,1 @@/))
    expect(rows).toContainEqual(expect.stringMatching(/^ {2}40 {5}− old line/))
    expect(rows).toContainEqual(expect.stringMatching(/^ {6}40 \+ new line/))
    await ui.press({ key: 'key-b' })
    await ui.press({ key: 'key-1' })
    await ui.redraw()
  }

  await ui.unmount()
})

test('`s` shows every step of the turn, unfolded (8.11); `s` again fits', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)

  for (let i = 0; i < 40; i++) await $.tool.call({ tool: 'Read', file_path: `f${i}.ts`, tool_use_id: `x${i}` } as never)

  const ui = await $.ui.mount({ ...pane(true), props: { ...pane(true).props, scroll: { ...PANE.props.scroll, bodyRows: 20 } } })
  const stepButtons = async () => (await ui.findAll({ type: 'Button' })).filter(b => String((b.props as { key?: string }).key).startsWith('step:'))
  const fitted = (await stepButtons()).length
  expect(fitted).toBeLessThan(20)

  await ui.press({ key: 'key-s' })
  await ui.redraw()
  expect(await texts(ui)).toContainEqual(expect.stringMatching(/^ {2}ALL STEPS · TURN 1 +43 steps · 1 failed *$/))
  expect(await stepButtons()).toHaveLength(43)

  await ui.press({ key: 'key-s' })
  await ui.redraw()
  expect((await stepButtons()).length).toBe(fitted)
  await ui.unmount()
})

test('`c` copies the row under the ring (a step`s command, an edit`s patch) and says `copied`', ON, async ($, on) => {
  const clock = { now: T0 }
  const copies: string[] = []
  engine(on, clock, copies)
  await aTurn($)
  const ui = await $.ui.mount(pane(true))
  const ring = (element: string) => $.ui.focus({ component: 'Pane', requestId: 'cockpit', plugin: 'ghostframe', element, origin: { kind: 'person' } } as never)

  await ring('step:b1')
  await ui.press({ key: 'key-c' })
  await ring('step:e1')
  await ui.press({ key: 'key-c' })
  expect(copies).toEqual(['bun test tests/width.test.tsx --bail', '@@ -40,1 +40,2 @@\n-old line\n+new line\n+another'])
  await ui.redraw()
  expect((await texts(ui)).some(t => t.includes('copied'))).toBe(true)

  // In a step's drawer, `c` copies its command; nothing under the ring copies nothing, and says so.
  await ui.press({ key: 'step:b1' })
  await ui.press({ key: 'key-c' })
  expect(copies.at(-1)).toBe('bun test tests/width.test.tsx --bail')
  await ui.press({ key: 'key-b' })
  await ring('nothing')
  await ui.press({ key: 'key-c' })
  await ui.redraw()
  expect(copies).toHaveLength(3)
  expect((await texts(ui)).some(t => t.includes('nothing to copy'))).toBe(true)
  await ui.unmount()
})

test('`5` shows the Agents tab: every agent, none folded away (8.9); `1` goes back to the timeline', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)

  for (let i = 0; i < 8; i++) {
    await $.tool.call({ tool: 'Agent', description: `Agent ${i}`, prompt: 'go', tool_use_id: `c${i}` } as never)
    await $.agent.spawn({
      tool_use_id: `c${i}`,
      prompt: 'go',
      description: `Agent ${i}`,
      subagentType: 'Explore',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'haiku',
      background: true,
      fork: false
    } as never)
  }

  const ui = await $.ui.mount(pane(true))
  await ui.press({ key: 'key-5' })
  await ui.redraw()
  const agents = async () => (await texts(ui)).filter(r => /^. ◇ Agent \d/.test(r))
  expect(await agents()).toHaveLength(8)
  expect(await texts(ui)).toContainEqual(expect.stringMatching(/^ {2}8 agents {3}8 running/))
  expect((await ui.findAll({ type: 'Button' })).filter(b => String((b.props as { key?: string }).key).startsWith('agent:'))).toHaveLength(8)

  await ui.press({ key: 'key-1' })
  await ui.redraw()
  expect(await agents()).toHaveLength(0)
  await ui.unmount()
})
test('a FILES row a shell also changed: its diff is the whole turn`s, the file at the turn`s start against now', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  // Git, as the work tree reads at the turn's start, after the Edit, and after the shell's append.
  const numstat = ['', '1\t1\tnotes.md\n', '2\t1\tnotes.md\n']
  let diffs = 0
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv.startsWith('git diff --numstat')) return { value: { exitCode: 0, stdout: numstat[Math.min(diffs++, 2)] ?? '', stderr: '' } } as never

    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  // The file before the Edit (read as the Edit starts), and after the shell's append (read when the diff opens).
  let content = 'old line\nkept\n'
  on('fs.read', () => ({ value: content }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'notes', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'notes', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/notes.md', old_string: 'old line', new_string: 'new line', tool_use_id: 'e1' } as never)
  content = 'new line\nkept\n'
  await $.tool.call({ tool: 'PowerShell', command: 'Add-Content notes.md "four"', tool_use_id: 'p1' } as never)
  content = 'new line\nkept\nfour\n'

  const ui = await $.ui.mount(pane(true))
  await ui.press({ key: 'key-2' })
  await ui.redraw()
  await ui.press({ key: 'file:notes.md' })
  await ui.redraw()
  const rows = await texts(ui)
  // The full diff (8.6): the file's counts over the turn, its hunk, two gutters, the sign, the line.
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}@@ 1,2 @@/))
  expect(rows.filter(r => /^ {2}[ \d]{6} [−+ ] /.test(r)).map(r => r.trimEnd())).toEqual([
    '   1     − old line',
    '       1 + new line',
    '   2   2   kept',
    '       3 + four'
  ])
  expect(rows.some(r => /more from shell commands|no snapshot/.test(r))).toBe(false)
  await ui.unmount()
})

test('a FILES row no call named, which had changes from before the turn: its diff says why it holds no more', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  // src/app.ts was already changed when the turn started; a formatter changes it again without naming it.
  const numstat = ['3\t0\tsrc/app.ts\n', '5\t1\tsrc/app.ts\n', '5\t1\tsrc/app.ts\n']
  let diffs = 0
  on('process.run', (_, e) => {
    const argv = e.argv.join(' ')

    if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '' } } as never
    if (argv.startsWith('git diff --numstat')) return { value: { exitCode: 0, stdout: numstat[Math.min(diffs++, 2)] ?? '', stderr: '' } } as never

    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'fmt', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fmt', turnId: 't1' })
  await $.tool.call({ tool: 'PowerShell', command: 'bun run fmt', tool_use_id: 'p1' } as never)

  const ui = await $.ui.mount(pane(true))
  await ui.press({ key: 'key-2' })
  await ui.redraw()
  await ui.press({ key: 'file:src/app.ts' })
  await ui.redraw()
  const rows = await texts(ui)
  // No patch to draw: the head says the file's counts, and no hunk is invented.
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}src\/app\.ts +.*·  0 hunks *$/))
  expect(rows.some(r => /@@/.test(r))).toBe(false)
  await ui.unmount()
})

/** A turn that launches `Edit note`, whose own calls are a read and an edit. */
async function agentTurn($: Engine, clock: { now: number }) {
  await aTurn($)
  await $.tool.call({ tool: 'Agent', description: 'Edit note', prompt: 'go', run_in_background: true, tool_use_id: 'c1' } as never)
  await $.agent.spawn({
    tool_use_id: 'c1',
    prompt: 'go',
    description: 'Edit note',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'haiku',
    background: true,
    fork: false
  } as never)
  clock.now += 2_000
  await $.tool.call({ tool: 'Read', file_path: 'notes.md', tool_use_id: 'ar1', agentId: 'ag-Edit note' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'notes.md', old_string: 'a', new_string: 'b', tool_use_id: 'ae1', agentId: 'ag-Edit note' } as never)
}

const viewing = (agentId?: string) => ({ ...PANE, props: { ...PANE.props, isFocused: true, view: agentId === undefined ? {} : { agentId } } })

test('Enter on an agent opens its conversation (8.10); the pane shows its ◇ AGENT head and its own timeline; Enter again goes back', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  const views: unknown[] = []
  on('ui.view', (_, e) => {
    views.push({ ...e })

    return { value: {} }
  })
  await agentTurn($, clock)

  let ui = await $.ui.mount(viewing())
  await ui.press({ key: 'key-5' })
  await ui.redraw()
  await ui.press({ key: 'agent:ag-Edit note' })
  await ui.unmount()
  expect(views).toEqual([{ agentId: 'ag-Edit note' }])

  ui = await $.ui.mount(viewing('ag-Edit note'))
  const rows = await texts(ui)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}▐ ◇ AGENT ▌  Edit note +running · \d+s/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}The conversation on the left is this agent’s\./))
  // Its own steps, as one group on its own clock; the main loop's are not listed while the agent's are.
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}✓ read notes\.md +[━╸╺ ]+ +\+2 −1 *$/))
  expect(rows.some(r => /bun test tests\/width/.test(r))).toBe(false)

  await ui.press({ key: 'key-m' })
  await ui.unmount()
  expect(views).toEqual([{ agentId: 'ag-Edit note' }, {}])
})

test('an agent in view: `m` goes back to main from any row or view, the hint row offers `m` and never Escape', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  const views: unknown[] = []
  on('ui.view', (_, e) => {
    views.push({ ...e })

    return { value: {} }
  })
  await agentTurn($, clock)

  const ui = await $.ui.mount(viewing('ag-Edit note'))
  expect(await hotkeysOf(ui)).toContain('m')
  expect((await texts(ui)).some(t => /^ {2}m back to main {4}tab move {4}enter open step/.test(t))).toBe(true)
  expect((await texts(ui)).some(t => /esc/.test(t))).toBe(false)

  // Enter on the agent's own group (its edit decides it) opens the edit's diff, and `m` still goes back.
  await ui.press({ key: 'step:ae1' })
  await ui.redraw()
  expect(await texts(ui)).toContainEqual(expect.stringMatching(/^ {2}@@ 40,1 @@/))
  await ui.press({ key: 'key-m' })
  expect(views).toEqual([{}])
  await ui.unmount()

  // The main conversation in view: the timeline's keys, `m` still bound but not offered.
  const main = await $.ui.mount(viewing())
  expect((await texts(main)).some(t => /m back to main/.test(t))).toBe(false)
  await main.unmount()
})

test('a view the engine refuses (no agent under that id): the pane still shows the agent`s kept steps; `b` goes back', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  on('ui.view', () => ({ value: { deny: 'no agent under that id' } }))
  await agentTurn($, clock)

  const ui = await $.ui.mount(viewing())
  await ui.press({ key: 'key-5' })
  await ui.redraw()
  await ui.press({ key: 'agent:ag-Edit note' })
  await ui.redraw()
  let rows = await texts(ui)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}▐ ◇ AGENT ▌  Edit note/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}✓ read notes\.md /))

  await ui.press({ key: 'key-b' })
  await ui.press({ key: 'key-1' })
  await ui.redraw()
  rows = await texts(ui)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}4 steps {4}1 still failing|^ {2}4 steps {4}1 open/))
  await ui.unmount()
})

test('Enter on a source copies its URL and says no key opens a browser; `c` on it copies the URL; `u` hides URLs (8.7)', ON, async ($, on) => {
  const clock = { now: T0 }
  const copies: string[] = []
  engine(on, clock, copies)
  await aTurn($)
  await $.tool.call({ tool: 'WebFetch', url: 'https://bun.sh/docs/cli/publish', prompt: 'x', tool_use_id: 'f1' } as never)

  const ui = await $.ui.mount(pane(true))
  await ui.press({ key: 'key-3' })
  await ui.redraw()
  await ui.press({ key: 'source:https://bun.sh/docs/cli/publish' })
  await ui.redraw()
  expect(copies).toEqual(['https://bun.sh/docs/cli/publish'])
  expect((await texts(ui)).join(' ')).toContain('url copied · no key opens a browser')

  await $.ui.focus({
    component: 'Pane',
    requestId: 'cockpit',
    plugin: 'ghostframe',
    element: 'source:https://bun.sh/docs/cli/publish',
    origin: { kind: 'person' }
  } as never)
  await ui.press({ key: 'key-c' })
  await ui.redraw()
  expect(copies).toEqual(['https://bun.sh/docs/cli/publish', 'https://bun.sh/docs/cli/publish'])

  // The URL shows under its row until `u` hides it; the row still copies on Enter.
  expect(await texts(ui)).toContainEqual(expect.stringMatching(/^ {6}https:\/\/bun\.sh\/docs\/cli\/publish/))
  await ui.press({ key: 'key-u' })
  await ui.redraw()
  expect((await texts(ui)).some(r => /^ {6}https:/.test(r))).toBe(false)
  await ui.press({ key: 'source:https://bun.sh/docs/cli/publish' })
  expect(copies).toHaveLength(3)
  await ui.press({ key: 'key-u' })
  await ui.unmount()
})

test('8.5: on the Files tab the file under the ring opens its first hunk in place; Enter still opens the full diff', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)
  const ui = await $.ui.mount(pane(true))
  const ring = (element: string) => $.ui.focus({ component: 'Pane', requestId: 'cockpit', plugin: 'ghostframe', element, origin: { kind: 'person' } } as never)
  const rows = async () => {
    await ui.redraw()

    return texts(ui)
  }

  await ui.press({ key: 'key-2' })
  expect((await rows()).some(t => t.includes('@@'))).toBe(false)

  // The ring on the file's row: its first hunk under it, the hunk's header and its lines, the old and the new.
  await ring('file:hooks/shared/text.ts')
  const open = await rows()
  const at = open.findIndex(t => t.includes('hooks/shared/text.ts'))
  expect(at).toBeGreaterThan(0)
  expect(open.slice(at + 1).find(t => t.includes('@@'))).toMatch(/@@ 40,2 @@ +c copy/)
  expect(open.some(t => /^ *40 {2}- old line/.test(t))).toBe(true)
  expect(open.some(t => /^ *40 {2}\+ new line/.test(t))).toBe(true)

  // Enter on the row opens the full diff (8.6); `b` goes back to the tab, and the ring off the row closes the hunk.
  await ui.press({ key: 'file:hooks/shared/text.ts' })
  expect((await rows()).some(t => /@@ 40,1 @@/.test(t))).toBe(true)
  await ui.press({ key: 'key-b' })
  await ring('nothing')
  expect((await rows()).some(t => t.includes('@@'))).toBe(false)
  await ui.unmount()
})
