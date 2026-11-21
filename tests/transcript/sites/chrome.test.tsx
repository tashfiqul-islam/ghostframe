import { expect, test } from 'claude-code/testing'

import { vw } from '../../../hooks/shared/text'
import { C } from '../../../hooks/shared/tokens'
import { commandNotice } from '../../../hooks/transcript/notices'
import { spinnerWord } from '../../../hooks/transcript/live'
import { partsWidth } from '../../../hooks/shared/parts'
import { textAt } from '../../support/text'
import { engineText, engine } from '../../support/engine'
import type { Engine, On } from '../../support/engine'
import { VIEW } from '../../support/view'
import { respond, respondText } from '../../support/respond'
import { REPLY } from '../../support/releases'

// ─── Measure ──────────────────────────────────────────────────────────────

for (const [columns, edge] of [
  [140, 12 + 96],
  [120, 12 + 96],
  [110, 12 + 96],
  [90, 90]
] as const) {
  test(`measure at ${columns} columns: turn and footer rules end at ${edge} (gutter + measure; narrow: full)`, async ($, on) => {
    on('ui.render', engineText as never)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.complete', (_, e) => ({ text: e.answer }))
    await $.turn.start({ text: 'q', turnId: 'm1' })
    await $.turn.complete({ answer: '', durationMs: 3100, isAborted: false, turnId: 'm1', reason: 'answer', usage: { output_tokens: 412 } } as never)

    const foot = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'TurnDuration',
      viewport: { columns, rows: 40 },
      props: { word: 'Baked', durationMs: 3100 }
    })
    const rows = textAt(await foot.drawn(), columns)
    expect(rows[0]).toBe('') // one blank row before the footer rule
    expect(vw(rows[1] ?? '')).toBe(edge)
    expect(rows[1]).toMatch(/ 3s · 412 tokens ┄┄\+$/) // meta right-aligned to the edge
    await foot.unmount()

    const you = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'UserMessage',
      viewport: { columns, rows: 40 },
      props: { text: 'next question', origin: { kind: 'composer' }, isExpanded: false }
    })
    const urows = textAt(await you.drawn(), columns)
    expect(urows[0]).toBe('') // never touching the footer rule above
    expect(vw(urows[1] ?? '')).toBe(edge)
    await you.unmount()
  })
}

// ─── Engine lines ─────────────────────────────────────────────────────────

test('engine lines: info notices and command output are one muted/dim line clipped at the measure', async ($, on) => {
  on('ui.render', engineText as never)
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'InfoNotice',
    viewport: { columns: 120, rows: 40 },
    props: { text: 'Using the model from your settings, which overrides the default for this project and every session started in it', command: '/model' }
  })
  const rows = textAt(await ui.drawn(), 120)
  expect(rows).toHaveLength(1)
  expect(vw(rows[0] ?? '')).toBeLessThanOrEqual(12 + 96)
  expect(rows[0]).toMatch(/^ {12}› Using the model/)
  // Visible text only: a clip pads with blank cells, whose colour shows nothing.
  const colours = (await ui.findAll({ type: 'Text' }))
    .filter(t => t.text.trim().length > 0)
    .map(t => t.props['color'])
    .filter(c => c !== undefined)
  for (const c of colours) expect([C.muted, C.dim]).toContain(c)
  await ui.unmount()

  const notice = commandNotice('effort', 'high', 'Applies from next turn', 96) ?? []
  for (const p of notice) expect([C.muted, C.dim]).toContain(p.color)
})
test('spinner: the verb from the mode, props only; a state message stands', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: `${(e.props as { word: string }).word}|${(e.props as { suffix: string }).suffix}` }))
  expect(spinnerWord('responding')).toBe('writing')
  expect(spinnerWord('tool-use')).toBe('running')

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'Spinner',
    viewport: VIEW,
    props: { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' }
  })
  expect(await ui.find({ type: 'Text', text: /^writing\|$/ })).toBeDefined()
  await ui.unmount()

  const msg = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'Spinner',
    viewport: VIEW,
    props: { word: 'Sauteing', message: 'Compacting', suffix: '…', mode: 'requesting' }
  })
  expect(await msg.find({ type: 'Text', text: /^Sauteing\|…$/ })).toBeDefined()
  await msg.unmount()
})

test('footer: a row keeps its own turn when a later turn of about the same length lands', async ($, on) => {
  engine(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const run = async (turnId: string, durationMs: number, tokens: number) => {
    await $.turn.start({ text: 'again', turnId })
    await $.session.append(respond([{ type: 'text', text: `Turn ${turnId}.` }], `a-${turnId}`))
    await $.turn.complete({ answer: '', durationMs, isAborted: false, turnId, reason: 'answer', usage: { output_tokens: tokens } } as never)
  }
  const footer = (requestId: string, durationMs: number) =>
    $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'TurnDuration',
      requestId,
      viewport: { columns: 140, rows: 40 },
      props: { word: 'Baked', durationMs }
    } as never)
  const shown = async (ui: Awaited<ReturnType<typeof footer>>) => textAt(await ui.drawn(), 140).join('\n')

  // A's row draws while A is the only close: the one fit.
  await run('A', 5000, 100)
  const a = await footer('fA', 5000)
  expect(await shown(a)).toContain('5s · 100 tokens')

  // B (within 250ms of A) lands; A's row draws again before B's row exists.
  await run('B', 5200, 200)
  expect(await shown(a)).toContain('5s · 100 tokens')
  const b = await footer('fB', 5200)
  expect(await shown(b)).toContain('5s · 200 tokens')

  await run('C', 9000, 300)
  const c = await footer('fC', 9000)
  expect(await shown(c)).toContain('9s · 300 tokens')
  expect(await shown(a)).toContain('5s · 100 tokens')
  expect(await shown(b)).toContain('5s · 200 tokens')
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
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'CommandOutput',
    viewport: VIEW,
    props: { command: 'effort', args: 'high', text: 'Applies from next turn', isErrored: false }
  })
  expect(await ui.find({ type: 'Text', text: /^\/effort high$/ })).toBeDefined()
  await ui.unmount()
})
/** Two no-tool turns of this shape, the same prompt run twice at about 5s each. */
async function twoRuns($: Engine, on: On, text: string) {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  for (const [turnId, ms, tokens] of [
    ['t1', 5200, 240],
    ['t2', 5300, 260]
  ] as const) {
    await $.turn.start({ text: 'make a table', turnId })
    await $.session.append(respondText(text, `a-${turnId}`))
    await $.turn.complete({ answer: text, durationMs: ms, isAborted: false, turnId, reason: 'answer', usage: { output_tokens: tokens } } as never)
  }
}
const footer = async ($: Engine, ms: number) => {
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'TurnDuration',
    viewport: { columns: 140, rows: 40 },
    props: { word: 'Baked', durationMs: ms }
  } as never)
  const text = textAt(await ui.drawn(), 140).join('\n')
  await ui.unmount()

  return text
}

test('footer: a no-tool turn keeps its tokens and sources count when another turn took about as long', async ($, on) => {
  await twoRuns($, on, REPLY)

  // The row the engine draws as t2 ends: t2's numbers (5.3s and 5.2s are within 250ms).
  const t2 = await footer($, 5300)
  expect(t2).toContain('5s · 260 tokens · 4 sources')
  // The earlier row, redrawn: its own turn, not t2's.
  const t1 = await footer($, 5200)
  expect(t1).toContain('5s · 240 tokens · 4 sources')
})
