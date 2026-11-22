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
  // The worked node (7.13): the stretch's steps and its agents; its failure drew its own row when it settled (13.1).
  expect(first[0]).toMatch(/^ {9}16s ◇  worked   [⣀-⣿]+   5 steps · 1 agent$/)
  expect(first.some(r => r.includes('the shell said hi'))).toBe(true)
  // Drawn again (a resize, a scroll), the block is as it was: a capsule is never updated.
  expect(await rowsOf($, answer)).toEqual(first)
  // The narration before each step left the transcript, as it does docked.
  expect(await rowsOf($, site('AssistantMessage', 'm11-sh11', 100, { text: 'Next, Bash for turn 11.', isFirstOfReply: true }))).toEqual([])
})

test('capsule, trigger 2: a step that starts after five silent minutes draws the capsule of the stretch before it', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await $.prompt.submit({ text: 'a long one', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'a long one', turnId: 'long' })
  const shell = (id: string) => ({ id, tool: 'Bash', input: { command: 'echo hi' } })
  const run = async (id: string, at: number) => {
    clock.now = at
    await $.session.append(respond([use(id, 'Bash', { command: 'echo hi' })], `long-${id}`))
    await $.tool.call({ tool: 'Bash', command: 'echo hi', tool_use_id: id } as never)
  }

  // Four minutes after the turn started: no capsule.
  await run('s1', T0)
  await run('s2', T0 + 4 * 60_000)
  expect(await rowsOf($, groupOf(shell('s2'), 100))).toEqual([])

  // Ten minutes in, with nothing drawn on the left since the start: the capsule of the two steps before it.
  await run('s3', T0 + 10 * 60_000)
  const rows = await rowsOf($, groupOf(shell('s3'), 100))
  expect(rows).toEqual([expect.stringMatching(/^ {6}4m 01s ◇  worked   [⣀-⣿]+   2 steps · 2 shell$/)])
  // Drawn again later (a resize, a scroll), it is the same row: it comes from the steps, not from the moment.
  clock.now += 60 * 60_000
  expect(await rowsOf($, groupOf(shell('s3'), 100))).toEqual(rows)
})

test('capsule, trigger 3: a turn that ends without any text draws its capsule and receipt under its last call`s row', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await $.prompt.submit({ text: 'just run it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'just run it', turnId: 'quiet' })
  await $.session.append(respond([use('q1', 'Bash', { command: 'echo hi' })], 'q-1'))
  await $.tool.call({ tool: 'Bash', command: 'echo hi', tool_use_id: 'q1' } as never)
  clock.now += 1_000
  await $.turn.complete({ answer: '', durationMs: 2_000, isAborted: false, turnId: 'quiet', reason: 'answer' })

  const row = await rowsOf($, groupOf({ id: 'q1', tool: 'Bash', input: { command: 'echo hi' } }, 100))
  expect(row).toEqual([
    expect.stringMatching(/^ {10}1s ◇  worked   [⣀-⣿]+   1 step · 1 shell$/),
    expect.stringMatching(/^ {13}│$/),
    expect.stringMatching(/^ {10}2s ✓  DONE   [⣀-⣿]+   1 step$/)
  ])
  // The footer names no turn (phase 5), so it draws nothing.
  expect(await rowsOf($, site('TurnDuration', 'td-quiet', 100, { word: 'Baked', durationMs: 2_000 }))).toEqual([])
})

test('a failure draws its `×` node at once at a narrow width: its result, its own time, the decisive line under it', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await mixedTurn($, clock, 13)

  const rows = await rowsOf($, groupOf(must(MIXED(13)[3]), 60, true))
  expect(rows[0]).toBe('             ×  shell ls /nope   exit 2   1s')
  expect(rows[1]).toBe("             │  └ ls: cannot access '/nope': No such file …")
  // A step that passed leaves no row.
  expect(await rowsOf($, groupOf(must(MIXED(13)[0]), 60))).toEqual([])
})

test('the live area in fallback is whole: the live line, then the running step as a branch under it (screen 31)', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'go', turnId: 'live' })
  await $.session.append(respond([text('Reading.'), use('lr', 'Read', { file_path: 'a.ts' })], 'lv1'))
  await $.tool.call({ tool: 'Read', file_path: 'a.ts', tool_use_id: 'lr' } as never)

  const spinner = site('Spinner', 'spin', 100, { word: 'Sauteing', message: null, suffix: '…', mode: 'tool-use' })
  clock.now = T0 + 5_000
  const rows = await rowsOf($, spinner)
  expect(rows[0]).toBe('             ┊')
  expect(rows[1]).toMatch(/^ {10}5s [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]  Reading   1 step$/)
  // The read has settled; nothing runs under the live line.
  expect(rows).toHaveLength(2)
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
  expect(rows.some(r => /^ {3}STEPS · TURN \d+ +5 steps · 1 failed *$/.test(r))).toBe(true)
  // One card: no head card, no tabs.
  expect(rows.some(r => /TIMELINE|DONE|LIVE/.test(r))).toBe(false)
  await inline.unmount()
})

test('C.2 in fallback: one blank row above the first event row after the prompt, none between event rows or above the capsule', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  const topOf = async (raised: Parameters<typeof $.ui.mount>[0]) => {
    const ui = await $.ui.mount(raised)
    const box = await ui.find({ type: 'Box' })
    await ui.unmount()

    return box?.props['marginTop']
  }
  const failing = (id: string) => ({ id, tool: 'Bash', input: { command: 'ls /nope' } })
  await $.prompt.submit({ text: 'list both', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'list both', turnId: 'two' })
  await $.session.append(respond([text('Listing it twice.'), use('ls15', 'Bash', { command: 'ls /nope' })], 'c15-1'))
  await $.tool.call({ tool: 'Bash', command: 'ls /nope', tool_use_id: 'ls15' } as never)
  await $.session.append(respond([use('ls15b', 'Bash', { command: 'ls /nope' })], 'c15-2'))
  await $.tool.call({ tool: 'Bash', command: 'ls /nope', tool_use_id: 'ls15b' } as never)
  await $.session.append(respond([text(answerOf(15))], 'm15-answer'))
  await $.turn.complete({ answer: answerOf(15), durationMs: 3_000, isAborted: false, turnId: 'two', reason: 'answer' })

  // Two failing commands: the first event row of the turn has a blank row above it (the narration left), the second none.
  expect(await topOf(groupOf(failing('ls15'), 100, true))).toBe(1)
  expect(await topOf(groupOf(failing('ls15b'), 100, true))).toBe(0)
  // The answer's capsule touches the event row above it.
  const answer = await $.ui.mount(site('AssistantMessage', 'm15-answer', 100, { text: answerOf(15), isFirstOfReply: true }))
  const boxes = await answer.findAll({ type: 'Box' })
  expect(boxes.every(b => (b.props['marginTop'] ?? 0) === 0)).toBe(true)
  expect((await answer.findAll({ type: 'Text' })).find(t => t.text.trim().length > 0)?.text).toMatch(/◇  worked/)
  await answer.unmount()
})

test('the inspector offers the keys that work on its card: s, c, p, n (8.13); never the tabs', ON, async ($, on) => {
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
  // The card's own key row says what they do (8.13).
  expect((await inline.findAll({ type: 'Text' })).some(t => /^ {3}s fit   c copy   b back   esc close/.test(t.text))).toBe(true)

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
  const rows = [...new Set((await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => /^ {13}[×│]  /.test(t)))]
  await ui.unmount()
  expect(rows).toEqual([expect.stringMatching(/^ {13}×  shell ls \/nope   exit 2/), "             │  └ ls: cannot access '/nope': No such file or directory"])
})
