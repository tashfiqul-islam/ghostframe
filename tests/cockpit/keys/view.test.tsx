import { expect, test } from 'claude-code/testing'

import { PANE_HINT } from '../../../hooks/cockpit/pane'
import { ON, PANE, T0, VIEW } from '../../support/cockpit'
import type { Engine, On } from '../../support/engine'

// Phase 7, keys and views (spec E.44): Cockpit's keys are hotkey Buttons drawn only while the pane holds the keyboard;
// Enter on a row opens it; Escape (the engine's) gives the keyboard back, and the pane then draws the fitted layout.
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

test('unfocused: the pane draws no key at all, so no key typed at the prompt can press one; the hint line is the engine`s', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)
  const ui = await $.ui.mount(pane(false))
  const hotkeys = (await ui.findAll({ type: 'Button' })).filter(b => typeof (b.props as { hotkey?: unknown }).hotkey === 'string')
  expect(hotkeys).toEqual([])
  // Rows are Buttons still (a click opens one), but none answers a letter.
  expect((await ui.findAll({ type: 'Button' })).map(b => (b.props as { key?: string }).key)).toContain('step:b1')
  await expect(ui.press({ key: 'key-s' })).rejects.toThrow()
  expect(await hint($)).toBe('? for shortcuts')
  await ui.unmount()
})

test('focused: the hint row lists the keys as hotkeys, the prompt`s hint line says `pane`; Escape gives both back', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)
  let ui = await $.ui.mount(pane(true))
  const keys = (await ui.findAll({ type: 'Button' })).flatMap(b => {
    const hk = (b.props as { hotkey?: unknown }).hotkey

    return typeof hk === 'string' ? [hk] : []
  })
  expect(keys).toEqual(['s', 'a', 't', 'f', 'u', 'c', 'p', 'n'])
  // Every key is one lowercase letter: the only kind a pane may bind, and never one the engine keeps.
  for (const k of keys) expect(k).toMatch(/^[a-z]$/)
  expect(await texts(ui)).toContainEqual('esc: prompt')
  expect(await hint($)).toBe(PANE_HINT)
  await ui.unmount()

  // Escape: the engine hands the keyboard back; the pane draws unfocused, and the hint line is the engine`s again.
  ui = await $.ui.mount(pane(false))
  expect(await hint($)).toBe('? for shortcuts')
  await ui.unmount()
})

test('Enter on a step opens its detail; `b` goes back; Escape closes it too', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)
  let ui = await $.ui.mount(pane(true))
  await ui.press({ key: 'step:b1' })
  await ui.redraw()
  let rows = await texts(ui)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ STEP 2 · TURN 1 \] ┄+ 2 of 14 fail · \d+s$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}test {5}bun test tests\/width\.test\.tsx --bail/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}ran {6}1s · failed · 4 lines of output/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}\(fail\) width > counts a skin-tone modifier/))
  expect((await ui.findAll({ type: 'Button' })).flatMap(b => [(b.props as { hotkey?: string }).hotkey ?? []].flat())).toEqual(['c', 'b'])

  await ui.press({ key: 'key-b' })
  await ui.redraw()
  rows = await texts(ui)
  expect(rows.some(r => r.includes('[ STEP 2'))).toBe(false)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ STEPS \]/))

  await ui.press({ key: 'step:b1' })
  await ui.unmount()
  // Escape: the pane, unfocused, is the fitted layout.
  ui = await $.ui.mount(pane(false))
  expect((await texts(ui)).some(r => r.includes('[ STEP 2'))).toBe(false)
  await ui.unmount()
})

test('Enter on an edit step, or on its FILES row, shows its diff', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)
  const ui = await $.ui.mount(pane(true))

  for (const key of ['step:e1', 'file:hooks/shared/text.ts']) {
    await ui.press({ key })
    await ui.redraw()
    const rows = await texts(ui)
    expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ DIFF · hooks\/shared\/text\.ts \] ┄+ \+2 −1 · 1 hunk$/))
    expect(rows).toContainEqual(expect.stringMatching(/^ {2}hunk 1 of 1 · lines 40 to 41/))
    expect(rows).toContainEqual(expect.stringMatching(/^ {2}−old line/))
    expect(rows).toContainEqual(expect.stringMatching(/^ {2}\+new line/))
    await ui.press({ key: 'key-b' })
  }

  await ui.unmount()
})

test('`s` shows every step of the turn, unfolded; `s` again fits', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  await aTurn($)

  for (let i = 0; i < 40; i++) await $.tool.call({ tool: 'Read', file_path: `f${i}.ts`, tool_use_id: `x${i}` } as never)

  const ui = await $.ui.mount({ ...pane(true), props: { ...pane(true).props, scroll: { ...PANE.props.scroll, bodyRows: 20 } } })
  const stepRows = async () => (await texts(ui)).filter(r => /^ {2}read /.test(r) || /^[✕▸ ] (test|edit|read) /.test(r))
  const fitted = (await stepRows()).length
  expect(fitted).toBeLessThan(20)

  await ui.press({ key: 'key-s' })
  await ui.redraw()
  expect(await texts(ui)).toContainEqual(expect.stringMatching(/^┄ \[ STEPS · TURN 1 · ALL \] ┄+ 43 steps · 1 failed$/))
  expect((await ui.findAll({ type: 'Button' })).filter(b => String((b.props as { key?: string }).key).startsWith('step:'))).toHaveLength(43)

  await ui.press({ key: 'key-s' })
  await ui.redraw()
  expect((await stepRows()).length).toBe(fitted)
  await ui.unmount()
})

test('`c` copies the row under the ring (a step`s command, an edit`s patch, a file`s diff) and says `copied`', ON, async ($, on) => {
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

  // In a step's detail, `c` copies its command; nothing under the ring copies nothing, and says so.
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

test('`a` shows every agent (an eighth is no longer `… 1 more`); again to fit', ON, async ($, on) => {
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
  const agents = async () => (await texts(ui)).filter(r => /^◇ Agent \d/.test(r))
  expect(await agents()).toHaveLength(7)
  expect(await texts(ui)).toContainEqual(expect.stringMatching(/^ {2}… 1 more/))

  await ui.press({ key: 'key-a' })
  await ui.redraw()
  expect(await agents()).toHaveLength(8)
  expect((await texts(ui)).some(r => /^ {2}… 1 more/.test(r))).toBe(false)

  await ui.press({ key: 'key-a' })
  await ui.redraw()
  expect(await agents()).toHaveLength(7)
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
  await ui.press({ key: 'file:notes.md' })
  await ui.redraw()
  const rows = await texts(ui)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ DIFF · notes\.md \] ┄+ \+2 −1 · 1 hunk$/))
  expect(rows.filter(r => /^ {2}[−+ ]/.test(r)).map(r => r.trimEnd())).toEqual(['  −old line', '  +new line', '   kept', '  +four'])
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
  await ui.press({ key: 'file:src/app.ts' })
  await ui.redraw()
  const rows = await texts(ui)
  const note = rows
    .filter(r => /^ {2}\S/.test(r) && !r.includes('[ DIFF'))
    .map(r => r.trim())
    .join(' ')
  expect(note).toBe('… +2 −1 more from shell commands · no snapshot · no call named this file before it changed, and it had changes from before the turn')
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

test('Enter on an agent opens its conversation; the pane lists its own steps as `[ STEPS · AGENT name ]`; Enter again goes back (A1)', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  const views: unknown[] = []
  on('ui.view', (_, e) => {
    views.push({ ...e })

    return { value: {} }
  })
  await agentTurn($, clock)

  let ui = await $.ui.mount(viewing())
  await ui.press({ key: 'agent:ag-Edit note' })
  await ui.unmount()
  expect(views).toEqual([{ agentId: 'ag-Edit note' }])

  ui = await $.ui.mount(viewing('ag-Edit note'))
  const rows = await texts(ui)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ STEPS · AGENT Edit note \] ┄+ 2 steps$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}agent in view · m for main/))
  // On the agent's own clock: its read ends 3 s after its launch (7 s on the turn's), its edit 4 s after.
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}read {5}notes\.md +3 lines +3s$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}edit {5}notes\.md +\+2 −1 +4s$/))
  // The main loop's steps are not listed while the agent's are.
  expect(rows.some(r => /bun test tests\/width/.test(r))).toBe(false)

  await ui.press({ key: 'agent:ag-Edit note' })
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
  let hints = (await ui.findAll({ type: 'Button' })).flatMap(b => {
    const hotkey = (b.props as { hotkey?: unknown }).hotkey

    return typeof hotkey === 'string' ? [hotkey] : []
  })
  expect(hints).toContain('m')
  expect((await texts(ui)).some(t => t.includes('esc: prompt'))).toBe(false)

  // The ring on one of the agent's step rows; Enter opens that step, and `m` still goes back.
  await ui.press({ key: 'step:ar1' })
  await ui.redraw()
  expect(await texts(ui)).toContainEqual(expect.stringMatching(/^┄ \[ STEP 1 · AGENT Edit note \]/))
  await ui.press({ key: 'key-m' })
  expect(views).toEqual([{}])
  await ui.unmount()

  // The main conversation in view: no `m`, and the hint row says Escape returns the keyboard.
  const main = await $.ui.mount(viewing())
  hints = (await main.findAll({ type: 'Button' })).flatMap(b => {
    const hotkey = (b.props as { hotkey?: unknown }).hotkey

    return typeof hotkey === 'string' ? [hotkey] : []
  })
  expect(hints).not.toContain('m')
  expect((await texts(main)).some(t => t.includes('esc: prompt'))).toBe(true)
  await main.unmount()
})

test('a view the engine refuses (no agent under that id): the pane still lists the agent`s kept steps and says why; `b` goes back', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, [])
  on('ui.view', () => ({ value: { deny: 'no agent under that id' } }))
  await agentTurn($, clock)

  const ui = await $.ui.mount(viewing())
  await ui.press({ key: 'agent:ag-Edit note' })
  await ui.redraw()
  let rows = await texts(ui)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ STEPS · AGENT Edit note \] ┄+ 2 steps$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}conversation not held · no agent under that id · b: back/))

  await ui.press({ key: 'key-b' })
  await ui.redraw()
  rows = await texts(ui)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ STEPS \] ┄+ 4 steps · 1 failed$/))
  await ui.unmount()
})

test('Enter on a source copies its URL and says no key opens a browser; `c` on it copies the URL (A2)', ON, async ($, on) => {
  const clock = { now: T0 }
  const copies: string[] = []
  engine(on, clock, copies)
  await aTurn($)
  await $.tool.call({ tool: 'WebFetch', url: 'https://bun.sh/docs/cli/publish', prompt: 'x', tool_use_id: 'f1' } as never)

  const ui = await $.ui.mount(pane(true))
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
  expect((await texts(ui)).join(' ')).toContain('url copied · no key opens a browser')

  // In the `u` view too: the row under its URL copies on Enter.
  await ui.press({ key: 'key-u' })
  await ui.redraw()
  expect(await texts(ui)).toContainEqual(expect.stringMatching(/^ {4}https:\/\/bun\.sh\/docs\/cli\/publish/))
  await ui.press({ key: 'source:https://bun.sh/docs/cli/publish' })
  expect(copies).toEqual(['https://bun.sh/docs/cli/publish', 'https://bun.sh/docs/cli/publish', 'https://bun.sh/docs/cli/publish'])
  await ui.unmount()
})
