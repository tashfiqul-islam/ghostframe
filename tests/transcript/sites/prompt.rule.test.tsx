import { expect, test } from 'claude-code/testing'

import { turnHeader } from '../../../hooks/transcript/v8/turn'
import { TOKEN } from '../../../hooks/shared/look/palette'
import { OFF, ON, PANE, T0 } from '../../support/cockpit'
import { shown } from '../../support/screens'
import type { Engine, On } from '../../support/engine'
import { fallbackEngine, rowsOf, site } from '../../support/fallback'
import type { Clock } from '../../support/fallback'

// The turn header while Cockpit is on (v8 7.1, amendment 12): `10:26:45 ◆  TURN n  ───`, n the step log's turn number,
// its rule ending on the text column's last cell: 86 cells beside a docked pane (a 127-column region), 78 at 100.
const header = (turnNo: number | undefined, cells: number, at = T0) => shown([turnHeader({ at, turnNo, isLive: false }, cells)])[0] ?? ''
const trimmed = (rows: readonly string[]) => rows.map(r => r.trimEnd())

function engine(on: On, clock: Clock, isPlaced: boolean) {
  fallbackEngine(on, clock, isPlaced)
  const store = new Map<string, unknown>()
  on('session.id', () => ({ value: 's1' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
}

async function start($: Engine, isDocked: boolean) {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  if (isDocked) await (await $.ui.mount(PANE)).unmount()
}

/** A typed prompt as the engine takes it: the submit, its stored row, its turn. */
async function typed($: Engine, clock: Clock, text: string, turnId: string, row: string) {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: row
  } as never)
  await $.turn.start({ text, turnId })
  clock.now += 5_000
  await $.turn.complete({ answer: 'ok', durationMs: 5_000, isAborted: false, turnId, reason: 'answer' })
}

const prompt = (row: string, columns: number, text: string, isExpanded = false) =>
  site('UserMessage', row, columns, { text, origin: { kind: 'composer' }, isExpanded })

for (const [mode, columns, cells] of [
  ['docked', 127, 86],
  ['fallback', 100, 78]
] as const) {
  test(`${mode}: the prompt opens with its header, \`10:26:45 ◆  TURN 1\`, then your message as a card`, ON, async ($, on) => {
    const clock = { now: T0 }
    engine(on, clock, mode === 'docked')
    await start($, mode === 'docked')
    await typed($, clock, 'why do the width tests fail?', 'e1', 'u1')

    const rows = await rowsOf($, prompt('u1', columns, 'why do the width tests fail?'))
    expect(rows[0]?.trimEnd()).toBe(header(1, cells))
    expect(trimmed(rows).some(r => r.endsWith('❯ why do the width tests fail?'))).toBe(true)
  })
}

test('ctrl+o: the same header and card as folded (screen 30), not the engine`s row', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, true)
  await start($, true)
  await typed($, clock, 'go', 'e1', 'u1')

  const rows = await rowsOf($, prompt('u1', 127, 'go', true))

  expect(rows[0]?.trimEnd()).toBe(header(1, 86))
  expect(trimmed(rows)).toEqual(trimmed(await rowsOf($, prompt('u1', 127, 'go'))))
  expect(rows).not.toContain('engine')
})

test('two prompts with the same text: each rule finds its own number by its row, drawn in any order', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, true)
  await start($, true)
  await typed($, clock, 'continue', 'e1', 'u1')
  clock.now += 60_000
  await typed($, clock, 'continue', 'e2', 'u2')
  // A later prompt, so the latest submit is neither: a claim by text alone would give the first row drawn turn 1.
  await typed($, clock, 'something else', 'e3', 'u3')

  expect((await rowsOf($, prompt('u2', 127, 'continue')))[0]?.trimEnd()).toBe(header(2, 86, T0 + 65_000))
  expect((await rowsOf($, prompt('u1', 127, 'continue')))[0]?.trimEnd()).toBe(header(1, 86))
})

test('the engine`s stand-in row shows the number and the time without taking either from the prompt`s own row', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, true)
  await start($, true)
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })

  expect((await rowsOf($, prompt('placeholder', 127, 'go')))[0]?.trimEnd()).toBe(header(1, 86))
  // The real row, drawn before its turn starts (the predicted number), then after.
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'go' }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: 'u1'
  } as never)
  expect((await rowsOf($, prompt('u1', 127, 'go')))[0]?.trimEnd()).toBe(header(1, 86))
  await $.turn.start({ text: 'go', turnId: 'e1' })
  expect((await rowsOf($, prompt('u1', 127, 'go')))[0]?.trimEnd()).toBe(shown([turnHeader({ at: T0, turnNo: 1, isLive: true }, 86)])[0])
})

for (const [mode, columns] of [
  ['docked', 127],
  ['fallback', 100]
] as const) {
  test(`${mode}: a prompt queued over the running turn is a \`⋯ QUEUED\` card; delivered into it, a \`↳ added\` card with its clock`, ON, async ($, on) => {
    const clock = { now: T0 }
    engine(on, clock, mode === 'docked')
    await start($, mode === 'docked')
    await $.prompt.submit({ text: 'ten steps', wait: false, origin: { kind: 'composer' } })
    await $.session.append({
      message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'ten steps' }] },
      door: 'prompt',
      origin: { kind: 'composer' },
      uuid: 'u1'
    } as never)
    await $.turn.start({ text: 'ten steps', turnId: 'e1' })
    clock.now += 3_000
    await $.prompt.submit({ text: 'also this', wait: false, origin: { kind: 'composer' }, turnId: 'e1' } as never)
    await $.session.append({
      message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'also this' }] },
      door: 'queue',
      origin: { kind: 'composer' },
      uuid: 'q1'
    } as never)

    // Waiting to be delivered (the engine's own queued row): no header, no number; a queued card with its clock (7.2).
    const waiting = trimmed(await rowsOf($, prompt('q2', columns, 'also this')))
    expect(waiting.some(r => r.includes('TURN'))).toBe(false)
    expect(waiting.find(r => r.includes('⋯ also this'))).toMatch(/^ {4}10:26:48 │ {4}⋯ also this +QUEUED$/)
    expect(waiting).toContain('             │  Sends when this turn ends · ctrl+enter send now')

    clock.now += 4_000
    const said = '<system-reminder>\nThe user sent a new message while you were working:\nalso this\n</system-reminder>'
    await $.session.append({ message: { type: 'attachment', role: 'user', content: [{ type: 'text', text: said }] }, door: 'delivery', uuid: 'd1' } as never)
    clock.now += 5_000
    await $.turn.complete({ answer: 'ok', durationMs: 12_000, isAborted: false, turnId: 'e1', reason: 'answer' })

    const rows = trimmed(await rowsOf($, prompt('d1', columns, 'also this')))
    const line = rows.find(r => r.includes('↳ also this')) ?? ''
    expect(rows.some(r => r.includes('TURN'))).toBe(false)
    expect(line).toMatch(/^ {4}10:26:48 │ {4}↳ also this +added$/)
    // `added` sits 2 cells from the card's end, the text column's last cell (7.2).
    expect(line.length).toBe(16 + (mode === 'docked' ? 86 : 78) - 2)
  })
}

test('narrow fallback: at 40 columns the text column narrows and the label stays whole', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, false)
  await start($, false)
  await typed($, clock, 'go', 'e1', 'u1')

  // 40 columns: the text column takes what the region leaves after its 16 cells and one free cell, at least 20.
  expect((await rowsOf($, prompt('u1', 40, 'go')))[0]?.trimEnd()).toBe(header(1, 23))
})

test('Cockpit off: the v6 rule, as before', OFF, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, false)
  await start($, false)
  await typed($, clock, 'go', 'e1', 'u1')

  // v6's rule draws its `+` ends and its time as Texts of their own.
  const rows = await rowsOf($, prompt('u1', 127, 'go'))
  expect(rows[0]).toBe('+')
  expect(rows).toContain(' 10:26 ')
  expect(rows.some(r => r.includes('TURN'))).toBe(false)
})

test('7.1: a header drawn while its turn runs keeps its accent `◆` when drawn again after the turn ends', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, true)
  await start($, true)
  const glyph = async (row: string) => {
    const ui = await $.ui.mount(prompt(row, 127, 'go'))
    const found = (await ui.findAll({ type: 'Text' })).find(t => t.text === '◆')
    await ui.unmount()

    return found?.props['color']
  }

  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'go' }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: 'u1'
  } as never)
  await $.turn.start({ text: 'go', turnId: 'e1' })
  const live = await glyph('u1')
  clock.now += 5_000
  await $.turn.complete({ answer: 'ok', durationMs: 5_000, isAborted: false, turnId: 'e1', reason: 'answer' })

  expect(live).toBe(TOKEN.accent)
  // Drawn again (a resize, a scroll back), the row is the same: it does not turn `spine` because the turn ended.
  expect(await glyph('u1')).toBe(TOKEN.accent)

  // A turn whose header first draws once it has ended is `spine`.
  await typed($, clock, 'again', 'e2', 'u2')
  const ui = await $.ui.mount(prompt('u2', 127, 'again'))
  expect((await ui.findAll({ type: 'Text' })).find(t => t.text === '◆')?.props['color']).toBe(TOKEN.spine)
  await ui.unmount()
})
