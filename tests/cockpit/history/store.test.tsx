import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0, VIEW } from '../../support/cockpit'
import type { Engine, On } from '../../support/engine'
import { text } from '../../support/docked'
import { aTurn } from '../../support/history'
import { respond } from '../../support/respond'

// Phase 8, history (spec E.45): every typed turn kept in $.state and $.store; a past turn pinned into the pane by
// `/steps n`, `p` / `n` / `l`, or a click on its receipt; resume and compaction.
type Store = Map<string, unknown>

function engine(on: On, clock: { now: number }, store: Store, session = 's1') {
  on('clock.now', () => ({ value: clock.now }))
  on('clock.after', () => ({ value: { cancel: () => undefined } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
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
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.list', () => ({ value: [] as never }))
  on('tool.call', () => {
    clock.now += 1_000

    return { result: { file: { numLines: 3 } }, text: 'ok' }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

/** A typed turn reading `files`, each its own step, answered `Turn n done.`. */
async function turn($: Engine, clock: { now: number }, n: number, files: readonly string[]) {
  await $.prompt.submit({ text: `turn ${n}`, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: `turn ${n}`, turnId: `e${n}` })

  for (const [i, f] of files.entries()) await $.tool.call({ tool: 'Read', file_path: f, tool_use_id: `t${n}r${i}` } as never)

  await $.session.append(respond([text(`Turn ${n} done.`)], `m${n}`))
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
  expect([...store.keys()]).toEqual(['history:kept'])
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
