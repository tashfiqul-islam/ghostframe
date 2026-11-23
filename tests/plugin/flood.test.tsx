import { expect, test } from 'claude-code/testing'

import { FLOOD } from '../fixtures/session-flood'
import { ON, PANE, T0 } from '../support/cockpit'
import { use } from '../support/docked'
import type { Engine, On } from '../support/engine'
import { groupOf, rowsOf, site } from '../support/fallback'
import type { Clock } from '../support/fallback'
import { respond } from '../support/respond'

// Spec 13.1 against a real flood: this session's own turn of 455 steps, 80 of them errors, most of them exploratory
// PowerShell (`$t = Get-Content …`, `[IO.File]::ReadAllText(…)`, `foreach …`), the gate run with its output
// redirected, and edits refused until the file was read. On main it drew 34 `✕ still failing` rows.
const ANSWER = 'Cockpit v8 is built.'
const calls = FLOOD.map((s, i) => ({ id: `f${i}`, ...s }))

/** The engine: every call answers as it did in the session, at the time it took. */
function floodEngine(on: On, clock: Clock, placed: boolean): void {
  let isPlaced = false
  on('clock.now', () => ({ value: clock.now }))
  on('ui.open', () => {
    isPlaced = placed

    return { value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'unasked below 144 columns' } }
  })
  on('ui.close', () => {
    isPlaced = false

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: isPlaced ? [{ id: 'cockpit', title: 'cockpit', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('agent.list', () => ({ value: [] as never }))
  on('clock.after', () => ({ value: { cancel: () => undefined } as never }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('tool.call', (_, e) => {
    const c = calls.find(k => k.id === (e as { tool_use_id?: string }).tool_use_id)

    if (c === undefined) throw new Error('a call the fixture does not hold')
    clock.now = T0 + c.at + c.ms

    return c.isError === true ? { isError: true, text: c.text ?? '', result: c.text ?? '' } : { result: { stdout: '', stderr: '' }, text: '' }
  })
}

/** The whole turn, call by call, then its answer. */
async function floodTurn($: Engine, clock: Clock): Promise<void> {
  await $.prompt.submit({ text: 'build Cockpit v8', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'build Cockpit v8', turnId: 'flood' })

  for (const c of calls) {
    clock.now = T0 + c.at
    await $.session.append(respond([use(c.id, c.tool, c.input)], `m-${c.id}`))
    await $.tool.call({ tool: c.tool, ...c.input, tool_use_id: c.id } as never)
  }

  await $.session.append(respond([{ type: 'text', text: ANSWER }], 'm-answer'))
  clock.now += 1_000
  await $.turn.complete({ answer: ANSWER, durationMs: clock.now - T0, isAborted: false, turnId: 'flood', reason: 'answer' })
}

const answerRows = async ($: Engine, columns: number) => rowsOf($, site('AssistantMessage', 'm-answer', columns, { text: ANSWER, isFirstOfReply: true }))
// 455 calls through the engine take longer than a test's usual 5 seconds.
const LONG = { ...ON, timeoutMs: 120_000 }
const RECEIPT = /×  FAILED   [⣀-⣿]+   455 steps · 15 fixed · 4 still failing · 56 files$/

test('fallback, 100 columns: three failure rows as they happen, then `+ 16 more · /steps 1` above the receipt', LONG, async ($, on) => {
  const clock = { now: T0 }
  floodEngine(on, clock, false)
  await floodTurn($, clock)

  const drawn: string[][] = []

  // Only a call that errored can draw a failure row.
  for (const c of calls.filter(k => k.isError === true)) {
    const rows = await rowsOf($, groupOf(c, 100, true))

    if (rows.some(r => /^ {13}× {2}/.test(r))) drawn.push(rows)
  }

  // 19 keys failed, by key and not by attempt: the first three draw their row, once each.
  expect(drawn.map(r => r[0]?.trim())).toEqual([
    expect.stringMatching(/^×  shell \$t = Measure-Command \{ bun run --cwd tools check .*…   exit 1$/),
    '×  edit D:/Projects/ghostframe-v8/hooks/README.md   not read',
    '×  edit D:/Projects/ghostframe-v8/tools/scripts/boundaries.ts   not read'
  ])
  const answer = await answerRows($, 100)
  expect(answer.at(-2)).toBe('             │  + 16 more · /steps 1')
  expect(answer.at(-1)).toMatch(RECEIPT)
})

test('docked, 200 columns: one failure card for the 4 keys still failing, two shown and `+ 2 more`; the same receipt', LONG, async ($, on) => {
  const clock = { now: T0 }
  floodEngine(on, clock, true)
  await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  const pane = await $.ui.mount(PANE)
  await floodTurn($, clock)
  const answer = await answerRows($, 127)
  await pane.unmount()

  // Docked the steps leave the transcript: no failure row at any call.
  for (const c of calls.filter(k => k.isError === true)) expect((await rowsOf($, groupOf(c, 127, true))).some(r => r.includes('×'))).toBe(false)

  const card = answer.filter(r => r.includes('×') || r.includes('more · /steps'))
  expect(card.map(r => r.trim())).toEqual([
    '│    × 4 still failing',
    // A long command is cut in its middle, its first two words and its last kept (13.5); its result stays whole.
    expect.stringMatching(/^│    × test claude … .* exit 1$/),
    // An edit refused because the file changed since it was read, and never made again with an edit tool.
    expect.stringMatching(/^│    × edit D:\/Projects\/ghostframe-v8\/tests\/plugin\/screens\.test\.ts +file changed$/),
    '│    + 2 more · /steps 1',
    expect.stringMatching(RECEIPT)
  ])
})
