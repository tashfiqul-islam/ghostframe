import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../../support/cockpit'
import type { Engine, On } from '../../support/engine'
import { fallbackEngine, rowsOf, site } from '../../support/fallback'
import type { Clock } from '../../support/fallback'

// The turn rule while Cockpit is on (E.1, amendment 12): `─ [ TURN n ] ─── 10:26`, n the step log's turn number,
// ending on the receipt's edge: 108 cells beside a docked pane at 200 columns (a 127-column region), 98 at 100.
const rule = (label: string, fill: number, clock = ' 10:26') => `─ [ ${label} ] ${'─'.repeat(fill)}${clock}`

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

for (const [mode, columns, fill] of [
  ['docked', 127, 89],
  ['fallback', 100, 79]
] as const) {
  test(`${mode}: the prompt opens with \`─ [ TURN 1 ] ─── 10:26\`, the clock on the receipt's edge`, ON, async ($, on) => {
    const clock = { now: T0 }
    engine(on, clock, mode === 'docked')
    await start($, mode === 'docked')
    await typed($, clock, 'why do the width tests fail?', 'e1', 'u1')

    const rows = await rowsOf($, prompt('u1', columns, 'why do the width tests fail?'))
    expect(rows[0]).toBe(rule('TURN 1', fill))
    expect(rows.some(r => r.includes('why do the width tests fail?'))).toBe(true)
  })
}

test('ctrl+o: the rule sits above the engine`s own prompt row, the same rule', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, true)
  await start($, true)
  await typed($, clock, 'go', 'e1', 'u1')

  expect(await rowsOf($, prompt('u1', 127, 'go', true))).toEqual([rule('TURN 1', 89), 'engine'])
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

  expect((await rowsOf($, prompt('u2', 127, 'continue')))[0]).toBe(rule('TURN 2', 89, ' 10:27'))
  expect((await rowsOf($, prompt('u1', 127, 'continue')))[0]).toBe(rule('TURN 1', 89))
})

test('the engine`s stand-in row shows the number and the time without taking either from the prompt`s own row', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, true)
  await start($, true)
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })

  expect((await rowsOf($, prompt('placeholder', 127, 'go')))[0]).toBe(rule('TURN 1', 89))
  // The real row, drawn before its turn starts (the predicted number), then after.
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'go' }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: 'u1'
  } as never)
  expect((await rowsOf($, prompt('u1', 127, 'go')))[0]).toBe(rule('TURN 1', 89))
  await $.turn.start({ text: 'go', turnId: 'e1' })
  expect((await rowsOf($, prompt('u1', 127, 'go')))[0]).toBe(rule('TURN 1', 89))
})

for (const [mode, columns] of [
  ['docked', 127],
  ['fallback', 100]
] as const) {
  test(`${mode}: a prompt folded into the running turn opens no rule; \`steer\` and the turn clock sit on its time edge (E.20)`, ON, async ($, on) => {
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

    // Waiting to be delivered (the engine's own queued row): no rule, no number, nothing on the edge yet.
    const waiting = await rowsOf($, prompt('q2', columns, 'also this'))
    expect(waiting.some(r => r.includes('TURN'))).toBe(false)
    expect(waiting.some(r => r.includes('steer'))).toBe(false)

    clock.now += 4_000
    const said = '<system-reminder>\nThe user sent a new message while you were working:\nalso this\n</system-reminder>'
    await $.session.append({ message: { type: 'attachment', role: 'user', content: [{ type: 'text', text: said }] }, door: 'delivery', uuid: 'd1' } as never)
    clock.now += 5_000
    await $.turn.complete({ answer: 'ok', durationMs: 12_000, isAborted: false, turnId: 'e1', reason: 'answer' })

    const rows = await rowsOf($, prompt('d1', columns, 'also this'))
    const width = (await rowsOf($, prompt('u1', columns, 'ten steps')))[0]?.length ?? 0
    expect(rows.some(r => r.includes('TURN'))).toBe(false)
    expect(rows).toContain('you')
    const line = rows.find(r => r.startsWith('▎ also this')) ?? ''
    expect(line).toMatch(/^▎ also this +steer · 7s$/)
    // The edge ends where the rule and the receipt end: the gutter's 12 cells, then the row.
    expect(12 + line.length).toBe(width)
  })
}

test('narrow fallback: below 40 cells the clock goes and the label stays whole', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, false)
  await start($, false)
  await typed($, clock, 'go', 'e1', 'u1')

  // 40 columns: content 38 cells (layout's 2-cell inset), under 40.
  expect((await rowsOf($, prompt('u1', 40, 'go')))[0]).toBe(`─ [ TURN 1 ] ${'─'.repeat(25)}`)
})

test('Cockpit off: the v6 rule, as before', async ($, on) => {
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
