import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0, VIEW } from '../../support/cockpit'
import type { Engine, On } from '../../support/engine'
import { text } from '../../support/docked'
import { aTurn } from '../../support/history'
import { respond, rowOf } from '../../support/respond'

// Phase 8, history (spec E.45): every typed turn kept in $.state and $.store; a past turn pinned into the pane by
// `/steps n`, `p` / `n` / `l`, or a click on its receipt; resume and compaction.
type Store = Map<string, unknown>

function engine(on: On, clock: { now: number }, store: Store, session = 's1', sent: string[] = [], isPlaced = true) {
  on('clock.now', () => ({ value: clock.now }))
  on('clock.after', () => ({ value: { cancel: () => undefined } as never }))
  on('ui.open', () => ({ value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'unasked below 144 columns' } }))
  on('ui.focus', { plugin: '*' }, () => ({}))
  on('session.id', () => ({ value: session }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  // Whatever starts or sends a prompt is noted in `sent`.
  on('prompt.submit', (_, e) => {
    sent.push(`prompt.submit ${e.text}`)

    return { text: e.text }
  })
  on('prompt.fill', (_, e) => {
    sent.push(`prompt.fill ${JSON.stringify(e)}`)

    return {} as never
  })
  on('turn.start', (_, e) => {
    sent.push(`turn.start ${e.text}`)

    return { turnId: e.turnId }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: [] as never }))
  on('tool.call', () => {
    clock.now += 1_000

    return { result: { file: { numLines: 3 } }, text: 'ok' }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

/** A typed turn reading `files`, each its own step, answered `Turn n done.` (or `answer`) in row `mn`. */
async function turn($: Engine, clock: { now: number }, n: number, files: readonly string[], answer = `Turn ${n} done.`) {
  await $.prompt.submit({ text: `turn ${n}`, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: `turn ${n}`, turnId: `e${n}` })

  for (const [i, f] of files.entries()) await $.tool.call({ tool: 'Read', file_path: f, tool_use_id: `t${n}r${i}` } as never)

  await $.session.append(respond([text(answer)], `m${n}`))
  clock.now += 1_000
  await $.turn.complete({ answer: 'x', durationMs: 2_000, isAborted: false, turnId: `e${n}`, reason: 'answer' })
}

async function threeTurns($: Engine, clock: { now: number }) {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await turn($, clock, 1, ['one.ts'])
  await turn($, clock, 2, ['two-a.ts', 'two-b.ts'])
  await turn($, clock, 3, ['three-a.ts', 'three-b.ts', 'three-c.ts'])
}

const focused = (isFocused: boolean) => ({ ...PANE, props: { ...PANE.props, isFocused } })

async function paneText($: Engine, isFocused = false): Promise<string[]> {
  const ui = await $.ui.mount(focused(isFocused))
  const rows = [...new Set((await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.trim().length > 0 && !t.includes('\n')))]
  await ui.unmount()

  return rows
}

const $steps = (args: string | number) => ({ command: 'steps', args: String(args), presentation: { columns: 127, rows: 50, isFullscreen: true } })
const run = async ($: Engine, args: string | number) => ((await $.command.run({ ...$steps(args) } as never)) as { text?: string }).text

test('/steps n pins a past turn: STEPS, FILES and SOURCES show it, the head stays live; /steps alone releases', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, new Map())
  await threeTurns($, clock)

  expect(await run($, 1)).toBe('pinned turn 1 · l in the pane or /steps for live')
  let rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ STEPS · TURN 1 · PINNED \] ┄+ 1 step · \d+s$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}pinned · l or \/steps for live/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}read {5}one\.ts/))
  expect(rows.some(r => /three-a\.ts/.test(r))).toBe(false)
  // The head is the present: the last turn, 3.
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ LAST \] ┄+ turn 3/))

  expect(await run($, '')).toBe('live · the pane follows the current turn')
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ STEPS \] ┄+ 3 steps$/))
})

test('/steps out of range, not a number, or the live turn: said plainly, nothing pinned', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, new Map())
  await threeTurns($, clock)

  expect(await run($, 9)).toBe('no step log for turn 9 · ctrl+o shows what the session still has')
  expect(await run($, 0)).toBe('/steps takes a turn number, 1 to 3')
  expect(await run($, 'two')).toBe('/steps takes a turn number, 1 to 3')
  expect(await run($, 3)).toBe('turn 3 is the live turn · the pane follows it')
  expect((await paneText($)).some(r => /PINNED/.test(r))).toBe(false)
})

test('p and n in the focused pane: back to turn 1 and no further; forward past the last kept turn is live; l releases', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, new Map())
  await threeTurns($, clock)
  const ui = await $.ui.mount(focused(true))
  const label = async () => {
    await ui.redraw()

    return (await ui.findAll({ type: 'Text' })).map(t => t.text).find(t => t.startsWith('┄ [ STEPS')) ?? ''
  }

  await ui.press({ key: 'key-p' })
  expect(await label()).toMatch(/\[ STEPS · TURN 2 · PINNED \]/)
  await ui.press({ key: 'key-p' })
  expect(await label()).toMatch(/\[ STEPS · TURN 1 · PINNED \]/)
  // At the first turn, p stays and says so.
  await ui.press({ key: 'key-p' })
  expect(await label()).toMatch(/\[ STEPS · TURN 1 · PINNED \]/)
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text.includes('no earlier turn kept'))).toBe(true)
  // l is offered while pinned, and releases.
  expect((await ui.findAll({ type: 'Button' })).some(b => (b.props as { hotkey?: string }).hotkey === 'l')).toBe(true)

  await ui.press({ key: 'key-n' })
  expect(await label()).toMatch(/\[ STEPS · TURN 2 · PINNED \]/)
  // Forward past the newest kept turn but the live one: the live turn itself, which is releasing.
  await ui.press({ key: 'key-n' })
  expect(await label()).toMatch(/^┄ \[ STEPS \] ┄/)

  await ui.press({ key: 'key-p' })
  await ui.press({ key: 'key-l' })
  expect(await label()).toMatch(/^┄ \[ STEPS \] ┄/)
  await ui.unmount()
})

test('a typed prompt releases the pin; a click on a receipt pins its turn', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, new Map())
  await threeTurns($, clock)
  // The quiet left: the pane docked.
  const docked = await $.ui.mount(focused(false))

  await run($, 1)
  await $.prompt.submit({ text: 'turn 4', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'turn 4', turnId: 'e4' })
  await docked.redraw()
  expect((await docked.findAll({ type: 'Text' })).some(t => /PINNED/.test(t.text))).toBe(false)
  await $.session.append(respond([text('Turn 4 done.')], 'm4'))
  await $.turn.complete({ answer: 'x', durationMs: 2_000, isAborted: false, turnId: 'e4', reason: 'answer' })

  // Turn 2's answer ends with its receipt, a Button: a click on it pins turn 2.
  const answer = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    ...rowOf('Turn 2 done.'),
    viewport: VIEW,
    props: { text: 'Turn 2 done.', isFirstOfReply: true }
  })
  await answer.press({ key: 'receipt:e2' })
  await answer.unmount()
  await docked.redraw()
  expect((await docked.findAll({ type: 'Text' })).map(t => t.text)).toContainEqual(expect.stringMatching(/^┄ \[ STEPS · TURN 2 · PINNED \]/))
  await docked.unmount()
})

test('every turn is kept in the store under the session`s key, as the turns end', ON, async ($, on) => {
  const clock = { now: T0 }
  const store: Store = new Map()
  engine(on, clock, store, 'kept')
  await threeTurns($, clock)
  // Beside the history, the transcript keeps its prompts' submit times for the turn rules.
  expect([...store.keys()].toSorted()).toEqual(['history:kept', 'prompts:kept'])
  const saved = store.get('history:kept') as { turns: { turnNo: number; steps: unknown[] }[] }
  expect(saved.turns.map(t => [t.turnNo, t.steps.length])).toEqual([
    [1, 1],
    [2, 2],
    [3, 3]
  ])
})

test('resume: a fresh session finds its turns in the store; [ LAST ] is the last turn`s verdict, /steps 1 pins the first', ON, async ($, on) => {
  const clock = { now: T0 + 999_000 }
  const last = { state: 'done' as const, story: '20 steps', wait: '', durationMs: 90_000, endedAt: T0 + 200_000 }
  // What the session left in the store before the restart: two turns, the second its last.
  const store: Store = new Map([['history:resumed', { savedAt: T0, turns: [aTurn(1, T0), { ...aTurn(2, T0 + 100_000), last }] }]])
  engine(on, clock, store, 'resumed')
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  let rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ LAST \] ┄+ turn 2 · \d\d:\d\d$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}done · 20 steps +1m 30s$/))
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ STEPS \] ┄+ 20 steps$/))

  expect(await run($, 1)).toBe('pinned turn 1 · l in the pane or /steps for live')
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ STEPS · TURN 1 · PINNED \] ┄+ 20 steps · 1m 30s$/))
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ FILES · TURN 1 \] ┄+ 3 changed/))

  // The next typed turn is turn 3, and releases the pin.
  await turn($, clock, 3, ['after.ts'])
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ LAST \] ┄+ turn 3/))
  expect(rows.some(r => /PINNED/.test(r))).toBe(false)
})

test('compaction changes nothing: the pane reads the same after it, and /steps still pins a turn from before it', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, new Map())
  const summary = [{ role: 'user', text: 'Summary of the conversation so far.', toolUses: [] }]
  on('session.compact', () => ({ messages: summary }) as never)
  await threeTurns($, clock)
  const before = await paneText($)

  await $.session.compact({ trigger: 'manual', messages: summary } as never)
  expect(await paneText($)).toEqual(before)
  expect(await run($, 1)).toBe('pinned turn 1 · l in the pane or /steps for live')
  expect(await paneText($)).toContainEqual(expect.stringMatching(/^┄ \[ STEPS · TURN 1 · PINNED \]/))
})

/** An answer row as the engine draws it, under its message's id, and its rows' text. */
const answerRow = (text: string, id = rowOf(text).requestId ?? 'unknown') =>
  ({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', requestId: id, viewport: VIEW, props: { text, isFirstOfReply: true } }) as never
const rowsOf = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.trim().length > 0)

test('each kept receipt names its turn`s last answer row, by the id it is drawn under, the same after a resume', ON, async ($, on) => {
  const clock = { now: T0 }
  const store: Store = new Map()
  engine(on, clock, store, 'answers')
  await threeTurns($, clock)
  const saved = store.get('history:answers') as { turns: { receipts: { turn: string; answer: string }[] }[] }
  expect(saved.turns.flatMap(t => t.receipts).map(r => [r.turn, r.answer])).toEqual([
    ['e1', 'm1'],
    ['e2', 'm2'],
    ['e3', 'm3']
  ])
})

test('resume: the answers drawn again from history get their receipts back, by row id, once the pane is drawn', ON, async ($, on) => {
  const clock = { now: T0 + 999_000 }
  const receipt = (turnNo: number, answer: string) => ({
    turn: `e${turnNo}`,
    turnNo,
    answer,
    state: 'done' as const,
    agents: 0,
    steps: turnNo,
    failures: 0,
    fixed: 0,
    files: 0,
    commit: '',
    open: [],
    durationMs: 2_000
  })
  const turns = [
    { ...aTurn(1, T0), receipts: [receipt(1, 'row1')] },
    { ...aTurn(2, T0 + 100_000), receipts: [receipt(2, 'row2')] }
  ]
  engine(on, clock, new Map([['history:resumed', { savedAt: T0, turns }]]), 'resumed')

  // The engine draws the resumed transcript before the session starts: its mode is not known yet, and it is not
  // held to it; placing the pane draws it again.
  const first = await $.ui.mount(answerRow('Turn 1 done.', 'row1'))
  const second = await $.ui.mount(answerRow('Turn 2 done.', 'row2'))
  expect((await rowsOf(second)).some(t => t.startsWith('─ done'))).toBe(false)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount(focused(false))
  await first.redraw()
  await second.redraw()

  // Drawn again in the pane's mode: each answer carries `claude` and ends with its own turn's receipt, as it did live.
  expect(await rowsOf(first)).toContain('claude')
  expect(await rowsOf(first)).toContainEqual(expect.stringMatching(/^─ done ─.* 1 step · 2s$/))
  expect(await rowsOf(second)).toContainEqual(expect.stringMatching(/^─ done ─.* 2 steps · 2s$/))
  // An answer no kept receipt ends on gets none.
  const other = await $.ui.mount(answerRow('Something else.', 'row9'))
  expect((await rowsOf(other)).some(t => t.startsWith('─ done'))).toBe(false)
  expect(await rowsOf(other)).not.toContain('claude')

  // And a resumed receipt pins its turn, like a live one (turn 2, the last, is the live turn).
  await first.press({ key: 'receipt:e1' })
  await pane.redraw()
  expect(await rowsOf(pane)).toContainEqual(expect.stringMatching(/^┄ \[ STEPS · TURN 1 · PINNED \]/))
  await Promise.all([first.unmount(), second.unmount(), other.unmount(), pane.unmount()])
})

test('resume in fallback: no capsule was drawn for the turns brought back, so each receipt carries its step count', ON, async ($, on) => {
  const clock = { now: T0 + 999_000 }
  const receipt = (turnNo: number, answer: string) => ({
    turn: `e${turnNo}`,
    turnNo,
    answer,
    state: 'done' as const,
    agents: 0,
    steps: turnNo,
    failures: 0,
    fixed: 0,
    files: 0,
    commit: '',
    open: [],
    durationMs: 2_000
  })
  const turns = [
    { ...aTurn(1, T0), receipts: [receipt(1, 'row1')] },
    { ...aTurn(2, T0 + 100_000), receipts: [receipt(2, 'row2')] }
  ]
  // No dock: the engine does not place the pane, so the left is in fallback.
  engine(on, clock, new Map([['history:resumed', { savedAt: T0, turns }]]), 'resumed', [], false)

  const first = await $.ui.mount(answerRow('Turn 1 done.', 'row1'))
  const second = await $.ui.mount(answerRow('Turn 2 done.', 'row2'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await first.redraw()
  await second.redraw()

  // E.47: no turn is left without its numbers. The steps are in the receipt, since no capsule said them.
  expect(await rowsOf(first)).toContainEqual(expect.stringMatching(/^─ done ─.* 1 step · 2s$/))
  expect(await rowsOf(second)).toContainEqual(expect.stringMatching(/^─ done ─.* 2 steps · 2s$/))
  expect((await rowsOf(first)).some(t => t.startsWith('│ worked'))).toBe(false)
  await Promise.all([first.unmount(), second.unmount()])
})

test('a click on any Cockpit row sends nothing: receipts, step rows and key hints only pin, open or say', ON, async ($, on) => {
  const clock = { now: T0 }
  const sent: string[] = []
  const toasts: string[] = []
  engine(on, clock, new Map(), 's1', sent)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.copy', () => ({ value: undefined }) as never)
  await threeTurns($, clock)
  const pane = await $.ui.mount(focused(true))
  sent.length = 0

  // Every receipt: turns 1 and 2 pin; turn 3 is the live turn, and says so.
  for (const n of [1, 2, 3]) {
    const answer = await $.ui.mount(answerRow(`Turn ${n} done.`))
    await answer.press({ key: `receipt:e${n}` })
    await answer.unmount()
  }

  expect(toasts).toEqual([
    'pinned turn 1 · l in the pane or /steps for live',
    'pinned turn 2 · l in the pane or /steps for live',
    'turn 3 is the live turn · the pane follows it'
  ])

  // Every Button the focused pane draws: its step rows and its key hints.
  await pane.redraw()
  const keys = (await pane.findAll({ type: 'Button' })).flatMap(b => [(b.props as { key?: string }).key ?? []].flat())
  expect(keys.some(k => k.startsWith('step:'))).toBe(true)
  expect(keys.some(k => k.startsWith('key-'))).toBe(true)

  await pane.unmount()
  let pressed = 0

  // Each from the live list: a step row's press opens its detail and `p` pins, so `b` and `/steps` come back first.
  for (const key of keys) {
    await run($, '')
    const ui = await $.ui.mount(focused(true))
    const drawn = async () => (await ui.findAll({ type: 'Button' })).map(b => (b.props as { key?: string }).key)

    while ((await drawn()).includes('key-b')) {
      await ui.press({ key: 'key-b' })
      await ui.redraw()
    }

    if ((await drawn()).includes(key)) {
      await ui.press({ key })
      pressed++
    }

    await ui.unmount()
  }

  expect(pressed).toBe(keys.length)
  expect(sent).toEqual([])
})

test('two answers with the same text keep their own receipts live, whatever order they draw in', ON, async ($, on) => {
  const clock = { now: T0 }
  const store: Store = new Map()
  engine(on, clock, store, 'same')
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await turn($, clock, 1, ['one.ts'], 'Same as before.')
  await turn($, clock, 2, ['two-a.ts', 'two-b.ts'], 'Same as before.')
  const pane = await $.ui.mount(focused(false))
  const receiptOf = async (id: string) => {
    const ui = await $.ui.mount(answerRow('Same as before.', id))
    const row = (await rowsOf(ui)).find(t => t.startsWith('─ done'))
    await ui.unmount()

    return row
  }

  // Live: turn 2's answer drawn first, then turn 1's; each keeps its own turn's receipt.
  expect(await receiptOf('m2')).toMatch(/ 2 steps · \d+s$/)
  expect(await receiptOf('m1')).toMatch(/ 1 step · \d+s$/)
  await pane.unmount()
  const kept = store.get('history:same') as { turns: { receipts: { answer: string; steps: number }[] }[] }
  expect(kept.turns.flatMap(t => t.receipts).map(r => [r.answer, r.steps])).toEqual([
    ['m1', 1],
    ['m2', 2]
  ])
})

test('resume: two answers with the same text get their own receipts back, in either drawing order', ON, async ($, on) => {
  const clock = { now: T0 + 999_000 }
  const receipt = (turnNo: number) => ({
    turn: `e${turnNo}`,
    turnNo,
    answer: `row${turnNo}`,
    state: 'done' as const,
    agents: 0,
    steps: turnNo,
    failures: 0,
    fixed: 0,
    files: 0,
    commit: '',
    open: [],
    durationMs: 2_000
  })
  const turns = [
    { ...aTurn(1, T0), receipts: [receipt(1)] },
    { ...aTurn(2, T0 + 100_000), receipts: [receipt(2)] }
  ]
  engine(on, clock, new Map([['history:resumed', { savedAt: T0, turns }]]), 'resumed')

  // Drawn bottom first, as a scrolled-back viewport may: the later answer, then the earlier one.
  const second = await $.ui.mount(answerRow('Same as before.', 'row2'))
  const first = await $.ui.mount(answerRow('Same as before.', 'row1'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount(focused(false))
  await second.redraw()
  await first.redraw()

  expect((await rowsOf(first)).find(t => t.startsWith('─ done'))).toMatch(/ 1 step · 2s$/)
  expect((await rowsOf(second)).find(t => t.startsWith('─ done'))).toMatch(/ 2 steps · 2s$/)
  await Promise.all([first.unmount(), second.unmount(), pane.unmount()])
})

test('one `/steps` after a click on a receipt returns the pane to live at once, with no redraw asked', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, new Map())
  on('ui.toast', () => ({ value: undefined }))
  await threeTurns($, clock)
  const pane = await $.ui.mount(focused(false))
  const pinnedNow = async () => (await pane.findAll({ type: 'Text' })).some(t => t.text.includes('PINNED'))

  const answer = await $.ui.mount(answerRow('Turn 1 done.'))
  await answer.press({ key: 'receipt:e1' })
  expect(await pinnedNow()).toBe(true)

  // The command's answer and the pane agree, the first time: the pane is drawn again by the release itself.
  expect(await run($, '')).toBe('live · the pane follows the current turn')
  expect(await pinnedNow()).toBe(false)

  // Pinned again by a click, released by one `/steps` again.
  await answer.press({ key: 'receipt:e1' })
  expect(await pinnedNow()).toBe(true)
  expect(await run($, '')).toBe('live · the pane follows the current turn')
  expect(await pinnedNow()).toBe(false)
  await Promise.all([answer.unmount(), pane.unmount()])
})
