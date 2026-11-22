import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../../support/cockpit'
import { text, use } from '../../support/docked'
import { respond } from '../../support/respond'
import { MIXED, answerOf, fallbackEngine, groupOf, mixedTurn, must, rowsOf, site, view } from '../../support/fallback'

// Fallback (spec E.3, E.5, E.33, E.46): Cockpit on and no pane docked. A capsule closes each stretch of work, at one
// of three moments; a failure draws its row at once; the live area is whole; `/steps` opens the inline inspector.

test('capsule, trigger 1: a block of text that stays opens with the capsule of the work before it, decided once', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await mixedTurn($, clock, 11)

  const answer = site('AssistantMessage', 'm11-answer', 100, { text: answerOf(11), isFirstOfReply: true })
  const first = await rowsOf($, answer)
  expect(first[0]).toMatch(/^│ worked · 5 steps · 2 shell · 1 edit · 1 fetch · 1 agent · 1 failure +16s$/)
  expect(first.some(r => r.includes('the shell said hi'))).toBe(true)
  // Drawn again (a resize, a scroll), the block is as it was: a capsule is never updated.
  expect(await rowsOf($, answer)).toEqual(first)
  // The narration before each step left the transcript, as it does docked.
  expect(await rowsOf($, site('AssistantMessage', 'm11-sh11', 100, { text: 'Next, Bash for turn 11.', isFirstOfReply: true }))).toEqual([])
})

test('capsule, trigger 2: after five silent minutes the next step`s row draws the capsule of the stretch so far', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await $.prompt.submit({ text: 'a long one', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'a long one', turnId: 'long' })
  const [shell, edit] = MIXED(12)
  await $.session.append(respond([use(shell?.id ?? '', 'Bash', shell?.input ?? {})], 'l1'))
  await $.tool.call({ tool: 'Bash', command: 'echo hi', tool_use_id: shell?.id } as never)

  // Under five minutes: the next step's row draws nothing.
  clock.now = T0 + 4 * 60_000
  expect(await rowsOf($, groupOf(must(edit), 100))).toEqual([])

  // Over five minutes since the left last drew: the next step's first draw carries the capsule, and keeps it.
  clock.now = T0 + 6 * 60_000
  const later = { ...must(edit), id: 'ed12b' }
  const rows = await rowsOf($, groupOf(later, 100))
  expect(rows).toEqual([expect.stringMatching(/^│ worked · 1 step · 1 shell +1s$/)])
  clock.now += 60_000
  expect(await rowsOf($, groupOf(later, 100))).toEqual(rows)
})

test('capsule, trigger 3: a turn that ends without any text draws its capsule and receipt in the footer', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await $.prompt.submit({ text: 'just run it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'just run it', turnId: 'quiet' })
  await $.session.append(respond([use('q1', 'Bash', { command: 'echo hi' })], 'q-1'))
  await $.tool.call({ tool: 'Bash', command: 'echo hi', tool_use_id: 'q1' } as never)
  clock.now += 1_000
  await $.turn.complete({ answer: '', durationMs: 2_000, isAborted: false, turnId: 'quiet', reason: 'answer' })

  const footer = await rowsOf($, site('TurnDuration', 'td-quiet', 100, { word: 'Baked', durationMs: 2_000 }))
  expect(footer).toEqual([expect.stringMatching(/^│ worked · 1 step · 1 shell +1s$/), expect.stringMatching(/^─ done ─+ 2s$/)])
})

test('a failure draws its row at once at a narrow width: `✕ failed`, its clock, the decisive line, nothing cut but the subject', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await mixedTurn($, clock, 13)

  const rows = await rowsOf($, groupOf(must(MIXED(13)[3]), 60, true))
  expect(rows[0]).toMatch(/^✕ failed · shell · ls \/nope · exit 2 +7s$/)
  expect(rows[0]?.length).toBe(58)
  expect(rows[1]).toBe("    ls: cannot access '/nope': No such file or directory")
  // A step that passed leaves no row.
  expect(await rowsOf($, groupOf(must(MIXED(13)[0]), 60))).toEqual([])
})

test('the live area in fallback is whole: the step`s kind word and subject, `step n · its time · the turn`s time`', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'go', turnId: 'live' })
  await $.session.append(respond([text('Reading.'), use('lr', 'Read', { file_path: 'a.ts' })], 'lv1'))
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', tool_use_id: 'lr' } as never)

  const spinner = site('Spinner', 'spin', 100, { word: 'Sauteing', message: null, suffix: '…', mode: 'tool-use' })
  clock.now = T0 + 5_000
  const rows = await rowsOf($, spinner)
  expect(rows[0]).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] waiting +5s$/)
  expect(rows[0]?.length).toBe(94)
})

test('/steps where no dock exists opens the inline inspector, focused, closing on Escape; it draws one section', ON, async ($, on) => {
  const clock = { now: T0 }
  const { opened } = fallbackEngine(on, clock, true)
  await mixedTurn($, clock, 14)

  const said = await $.command.run({ command: 'steps', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(said.text).toMatch(/^live/)
  expect(opened.at(-1)).toMatchObject({ id: 'cockpit', focus: true, closeOnEscape: true, rows: 12 })

  const inline = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, placement: 'inline', bodyColumns: 100, isFocused: true, scroll: { offset: 0, bodyRows: 12 } },
    viewport: view(100)
  })
  const rows = (await inline.findAll({ type: 'Text' })).map(t => t.text)
  expect(rows.some(r => /^┄ \[ STEPS · TURN \d+ \] ┄+ 5 steps · 1 failed$/.test(r))).toBe(true)
  // One section: no head, no other section.
  expect(rows.some(r => /\[ (NOW|LAST|FILES|SOURCES) \]/.test(r))).toBe(false)
  await inline.unmount()
})

test('C.2 in fallback: one blank row above the first event row after the prompt, none between event rows or above the capsule', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await mixedTurn($, clock, 15)
  const topOf = async (raised: Parameters<typeof $.ui.mount>[0]) => {
    const ui = await $.ui.mount(raised)
    const box = await ui.find({ type: 'Box' })
    await ui.unmount()

    return box?.props['marginTop']
  }
  const failing = { ...must(MIXED(15)[3]), id: 'ls15' }

  // The edit and the failing command: the first event row of the turn has a blank row above it, the second none.
  expect(await topOf(groupOf(failing, 100, true))).toBe(1)
  await $.tool.call({ tool: 'Bash', command: 'ls /nope', tool_use_id: 'ls15b' } as never)
  expect(await topOf(groupOf({ ...failing, id: 'ls15b' }, 100, true))).toBe(0)
  // The answer's capsule touches the event row above it.
  const answer = await $.ui.mount(site('AssistantMessage', 'm15-answer', 100, { text: answerOf(15), isFirstOfReply: true }))
  const boxes = await answer.findAll({ type: 'Box' })
  expect(boxes.some(b => b.props['marginTop'] === 0 && b.text.startsWith('│ worked'))).toBe(true)
  await answer.unmount()
})

test('the inspector offers the keys that work on one section: s, c, p, n (E.46); never the section keys', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock, true)
  await mixedTurn($, clock, 16)
  await $.command.run({ command: 'steps', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } })

  const inline = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, placement: 'inline', bodyColumns: 100, isFocused: true, scroll: { offset: 0, bodyRows: 12 } },
    viewport: view(100)
  })
  const keysNow = async () => (await inline.findAll({ type: 'Button' })).map(b => b.props['hotkey']).filter(k => k !== undefined)
  expect(await keysNow()).toEqual(['s', 'c', 'p', 'n'])

  // `s` opens every step: the hint row offers what works there, `b: back` with it, first so it is on screen.
  await inline.press({ key: 'key-s' })
  await inline.redraw()
  expect(await keysNow()).toEqual(['s', 'c', 'b'])
  const labels = (await inline.findAll({ type: 'Button' })).filter(b => b.props['hotkey'] !== undefined).map(b => b.text)
  expect(labels).toEqual(['fit', 'copy', 'back'])

  // `b` goes back to the fitted section, and its keys come back.
  await inline.press({ key: 'key-b' })
  await inline.redraw()
  expect(await keysNow()).toEqual(['s', 'c', 'p', 'n'])
  await inline.unmount()
})

test('a failure row drawn while its step settles has its detail: the output is kept before the step settles', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await $.prompt.submit({ text: 'list it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'list it', turnId: 'race' })
  const call = { id: 'lsrace', tool: 'Bash', input: { command: 'ls /nope' } }

  // The engine raises the group as the call starts, and draws it again as the call ends.
  const ui = await $.ui.mount(groupOf(call, 100, true))
  await $.tool.call({ tool: 'Bash', command: 'ls /nope', tool_use_id: call.id } as never)
  await ui.redraw()
  const rows = [...new Set((await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => /^(✕ failed| {4}\S)/.test(t)))]
  await ui.unmount()
  expect(rows).toEqual([expect.stringMatching(/^✕ failed · shell · ls \/nope · exit 2/), "    ls: cannot access '/nope': No such file or directory"])
})
