import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { Engine, On } from '../support/engine'
import { fallbackEngine, rowsOf, site } from '../support/fallback'
import type { Clock } from '../support/fallback'
import { aTurn } from '../support/history'
import { respond, rowOf } from '../support/respond'

// One number everywhere (amendment 12): the turn rule's `[ TURN n ]` is the number the pane's head, `/steps n` and
// `/copy steps n` use. An agent's report starts a turn of its own that carries on the typed one: no rule, no number.
type Store = Map<string, unknown>

function engine(on: On, clock: Clock, store: Store) {
  fallbackEngine(on, clock, true)
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
  on('store.delete', (_, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
}

/** A typed turn of one shell call and an answer, as the engine runs it. */
async function typed($: Engine, clock: Clock, n: number) {
  const said = `prompt ${n}`
  await $.prompt.submit({ text: said, wait: false, origin: { kind: 'composer' } })
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: said }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: `u${n}`
  } as never)
  await $.turn.start({ text: said, turnId: `e${n}` })
  await $.session.append(respond([use(`c${n}`, 'Bash', { command: `echo ${n}` })], `m${n}`))
  await $.tool.call({ tool: 'Bash', command: `echo ${n}`, tool_use_id: `c${n}` } as never)
  await $.session.append(respond([text(`answer ${n}`)], `a${n}`))
  clock.now += 1_000
  await $.turn.complete({ answer: `answer ${n}`, durationMs: 2_000, isAborted: false, turnId: `e${n}`, reason: 'answer' })
  clock.now += 60_000
}

/** An agent's report: a meta prompt from a peer, then a turn of its own. */
async function reported($: Engine, clock: Clock) {
  await $.prompt.submit({ text: '<agent-message from="Explore">', wait: false, isMeta: true, origin: { kind: 'peer' } })
  await $.turn.start({ text: '<agent-message from="Explore">', turnId: 'r1' })
  await $.session.append(respond([text('the agent found two files')], 'ra'))
  clock.now += 1_000
  await $.turn.complete({ answer: 'the agent found two files', durationMs: 1_000, isAborted: false, turnId: 'r1', reason: 'answer' })
}

const promptRow = (row: string, said: string) => site('UserMessage', row, 127, { text: said, origin: { kind: 'composer' }, isExpanded: false })
const steps = (args: string) => ({ command: 'steps', args, presentation: { columns: 127, rows: 50, isFullscreen: true } })

test('docked: the rules, the pane`s head and /steps agree on n across a session with an agent report in it', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock, new Map())
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)

    return { value: { isCopied: true } }
  })
  on('ui.toast', () => ({ value: undefined }))
  // The engine's own `/copy`, beneath Cockpit's forms.
  on('command.run', () => ({ text: 'the engine`s /copy' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await (await $.ui.mount(PANE)).unmount()

  await typed($, clock, 1)
  await typed($, clock, 2)
  await reported($, clock)
  await typed($, clock, 3)

  const rules = await Promise.all([1, 2, 3].map(async n => (await rowsOf($, promptRow(`u${n}`, `prompt ${n}`)))[0] ?? ''))
  expect(rules.map(r => /\[ (TURN \d+) \]/.exec(r)?.[1])).toEqual(['TURN 1', 'TURN 2', 'TURN 3'])

  // The agent's report draws no turn rule.
  const report = await rowsOf($, site('UserMessage', 'rp', 127, { text: '<agent-message from="Explore">', origin: { kind: 'peer' }, isExpanded: false }))
  expect(report.some(r => r.includes('TURN'))).toBe(false)

  // The rule and the receipt end on one edge: the same width.
  const receipt = (await rowsOf($, site('AssistantMessage', rowOf('answer 3').requestId ?? 'a3', 127, { text: 'answer 3', isFirstOfReply: true }))).at(-1) ?? ''
  expect(receipt).toMatch(/^─ done ─+/)
  expect(rules[2]?.length).toBe(receipt.length)

  const pane = await $.ui.mount(PANE)
  const head = (await pane.findAll({ type: 'Text' })).map(t => t.text)
  await pane.unmount()
  expect(head).toContainEqual(expect.stringMatching(/^┄ \[ LAST \] ┄+ turn 3/))

  // `/steps 2 all` prints turn 2's rows, `/copy steps 2` copies them, and `/steps 2` pins turn 2 in the pane.
  const all = ((await $.command.run(steps('2 all') as never)) as { text?: string }).text ?? ''
  expect(all).toContain('echo 2')
  expect(all).not.toMatch(/echo [13]/)

  await $.command.run({ command: 'copy', args: 'steps 2', origin: { kind: 'composer' }, presentation: { columns: 127, rows: 50, isFullscreen: true } } as never)
  expect(copied.at(-1)).toContain('echo 2')
  expect(copied.at(-1)).not.toMatch(/echo [13]/)

  await $.command.run(steps('2') as never)
  const pinned = await $.ui.mount(PANE)
  const rows = (await pinned.findAll({ type: 'Text' })).map(t => t.text)
  await pinned.unmount()
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ STEPS · TURN 2 · PINNED \] ┄+/))
})

test('resume: each redrawn rule keeps its number and time from the store, drawn before the session starts; the next is RESUMED', ON, async ($, on) => {
  const day = 86_400_000
  const clock = { now: T0 + day + 3_600_000 }
  const store: Store = new Map<string, unknown>([
    [
      'prompts:s1',
      [
        { text: 'prompt 1', at: T0, row: 'u1', turnNo: 1 },
        { text: 'prompt 2', at: T0 + 300_000, row: 'u2', turnNo: 2 }
      ]
    ],
    ['history:s1', { savedAt: T0, turns: [aTurn(1, T0), aTurn(2, T0 + 300_000)] }]
  ])
  engine(on, clock, store)

  // The engine draws the resumed transcript first (amendment 8): nothing in the state yet.
  expect((await rowsOf($, promptRow('u2', 'prompt 2')))[0]).toMatch(/^─ \[ TURN 2 \] ─+ 10:31$/)
  expect((await rowsOf($, promptRow('u1', 'prompt 1')))[0]).toMatch(/^─ \[ TURN 1 \] ─+ 10:26$/)

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await (await $.ui.mount(PANE)).unmount()
  expect((await rowsOf($, promptRow('u1', 'prompt 1')))[0]).toMatch(/^─ \[ TURN 1 \] ─+ 10:26$/)

  await typed($, clock, 3)
  // A day later than the turn before it: the clock names the day.
  expect((await rowsOf($, promptRow('u3', 'prompt 3')))[0]).toMatch(/^─ \[ TURN 3 · RESUMED \] ─+ Sun 22 Nov · 11:26$/)
  await typed($, clock, 4)
  expect((await rowsOf($, promptRow('u4', 'prompt 4')))[0]).toMatch(/^─ \[ TURN 4 \] ─+ 11:27$/)
})
