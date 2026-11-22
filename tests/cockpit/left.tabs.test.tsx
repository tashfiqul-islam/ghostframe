import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0, VIEW } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { Engine, On } from '../support/engine'
import { respond } from '../support/respond'

// Another pane in the dock (the engine's Diff view) hides Cockpit's tab: the turns that start then draw the full
// view on the left; showing Cockpit's tab again makes the next turns quiet. A row once drawn never changes.
const NARRATION = (n: number) => `Reading the config for turn ${n} first.`
const ANSWER = (n: number) => `Turn ${n} is done.`
const message = (t: string, id: string) =>
  ({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: id,
    viewport: VIEW,
    props: { text: t, isFirstOfReply: true }
  }) as const
const group = (id: string) =>
  ({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'ToolGroup',
    requestId: `g-${id}`,
    viewport: VIEW,
    props: {
      calls: [
        {
          tool_use_id: id,
          tool: 'Read',
          input: { file_path: 'a.ts' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
          output: { file: { numLines: 3 } }
        }
      ],
      isActive: false,
      isExpanded: false,
      isCallsOnly: true
    }
  }) as never

function engine(on: On, clock: { now: number }, shown: { cockpit: boolean }) {
  on('clock.now', () => ({ value: clock.now }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'cockpit', title: 'cockpit', isShown: shown.cockpit, isFocused: false, isPlaced: true }] }))
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

async function turn($: Engine, clock: { now: number }, n: number) {
  await $.prompt.submit({ text: `turn ${n}`, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: `turn ${n}`, turnId: `t${n}` })
  await $.session.append(respond([text(NARRATION(n)), use(`r${n}`, 'Read', { file_path: 'a.ts' })], `m${n}a`))
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', tool_use_id: `r${n}` } as never)
  await $.session.append(respond([text(ANSWER(n))], `m${n}b`))
  clock.now += 1_000
  await $.turn.complete({ answer: 'x', durationMs: 2_000, isAborted: false, turnId: `t${n}`, reason: 'answer' })
}

async function drawn($: Engine, site: Parameters<Engine['ui']['mount']>[0]): Promise<string[]> {
  const ui = await $.ui.mount(site)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.trim().length > 0)
  await ui.unmount()

  return texts
}

/** What a turn's rows look like on the left: narration shown or hidden, the step row, a receipt under the answer. */
async function look($: Engine, n: number) {
  const narration = await drawn($, message(NARRATION(n), `m${n}a`))
  const step = await drawn($, group(`r${n}`))
  const answer = await drawn($, message(ANSWER(n), `m${n}b`))

  return {
    isNarrationShown: narration.some(t => t.includes(NARRATION(n))),
    isStepShown: step.length > 0,
    hasReceipt: answer.some(t => t.startsWith('─ done')),
    rows: [...narration, ...step, ...answer]
  }
}

test('another tab in the dock: new turns draw the full view; Cockpit`s tab again: new turns are quiet; drawn rows never change', ON, async ($, on) => {
  const clock = { now: T0 }
  const shown = { cockpit: true }
  engine(on, clock, shown)
  const pane = await $.ui.mount(PANE)

  // Turn 1, Cockpit's tab shown: quiet. Narration and the step are the pane's; the answer ends with the receipt.
  await turn($, clock, 1)
  const one = await look($, 1)
  expect(one).toMatchObject({ isNarrationShown: false, isStepShown: false, hasReceipt: true })

  // The Diff view takes the dock: turn 2 draws the full view.
  shown.cockpit = false
  await turn($, clock, 2)
  const two = await look($, 2)
  expect(two).toMatchObject({ isNarrationShown: true, isStepShown: true, hasReceipt: false })
  // Turn 1's rows, drawn again, are as they were.
  expect((await look($, 1)).rows).toEqual(one.rows)

  // Cockpit's tab again: turn 3 is quiet; turn 2's rows stay full.
  shown.cockpit = true
  await turn($, clock, 3)
  expect(await look($, 3)).toMatchObject({ isNarrationShown: false, isStepShown: false, hasReceipt: true })
  expect((await look($, 2)).rows).toEqual(two.rows)
  expect((await look($, 1)).rows).toEqual(one.rows)
  await pane.unmount()
})
