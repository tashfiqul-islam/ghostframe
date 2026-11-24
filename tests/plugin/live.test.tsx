import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import type { Engine } from '../support/engine'
import { groupOf, rowsOf, site } from '../support/fallback'
import { TURNS } from '../fixtures/live'
import { blockRow, blocksOf, liveEngine, liveTurn } from '../support/live'

// The live checks' session (tests/fixtures/live.ts), replayed: each test is a bug the person saw on screen, at 200
// columns docked (127 for the transcript beside the 72-column pane) or at 100 in fallback.
const LONG = { ...ON, timeoutMs: 60_000 }

/** The engine on, docked at 200 columns (`/cockpit` once, as the person did) or not. */
async function session($: Engine, on: Parameters<typeof liveEngine>[0], isDocked: boolean) {
  const clock = { now: T0 }
  liveEngine(on, clock, isDocked)
  if (isDocked) await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  if (isDocked) await (await $.ui.mount(PANE)).unmount()

  return clock
}

const block = (n: number, t: string, columns: number, isSummary = false) =>
  site('AssistantMessage', blockRow(n, t), columns, { text: t, isFirstOfReply: false, ...(isSummary ? { isSummary: true } : {}) })

for (const [mode, columns] of [
  ['docked', 127],
  ['fallback', 100]
] as const) {
  test(`1. ${mode}: Claude's thinking summary between calls draws nothing (turn 1)`, LONG, async ($, on) => {
    const clock = await session($, on, mode === 'docked')
    await liveTurn($, clock, 1)
    const [summary] = blocksOf(1, 'summary')

    expect(summary).toMatch(/^The root cause is that/)
    expect(await rowsOf($, block(1, summary ?? '', columns, true))).toEqual([])
  })
}

const commitCall = () => {
  const c = TURNS[1]?.events.find(e => e.k === 'call' && JSON.stringify(e['input']).includes('git commit'))

  if (c === undefined) throw new Error('turn 1 has no commit')

  return { id: String(c['id']), tool: String(c['tool']), input: c['input'] as Record<string, unknown> }
}

for (const [mode, columns] of [
  ['docked', 127],
  ['fallback', 100]
] as const) {
  test(`4. ${mode}: \`git add …; git commit -q -m @'…'@\` draws \`↗ committed 3c32406\` and the receipt names it (turn 1)`, LONG, async ($, on) => {
    const clock = await session($, on, mode === 'docked')
    await liveTurn($, clock, 1)
    const c = commitCall()
    const rows = await rowsOf($, groupOf(c, columns))

    expect(rows.some(r => /↗  committed   3c32406 fix: count width by grapheme cluster/.test(r))).toBe(true)
    const [answer] = blocksOf(1, 'text')
    const receipt = (await rowsOf($, site('AssistantMessage', blockRow(1, answer ?? ''), columns, { text: answer, isFirstOfReply: true }))).at(-1)
    expect(receipt).toMatch(/✓  DONE .* ↗ 3c32406$/)
  })
}

const callOf = (n: number, match: (command: string) => boolean) => {
  const c = TURNS[n]?.events.find(e => e.k === 'call' && match(JSON.stringify(e['input'])))

  if (c === undefined) throw new Error(`turn ${n} has no such call`)

  return { id: String(c['id']), tool: String(c['tool']), input: c['input'] as Record<string, unknown> }
}
const BLOCKED = '⊘  BLOCKED   by a hook · guard-main.ps1 · pushing is blocked in this repo'

test('5, 6. turn 4: ⊘ BLOCKED names the hook`s script and its message; after /cockpit closes the pane it is still that row', LONG, async ($, on) => {
  const clock = await session($, on, true)
  const push = callOf(4, c => c.includes('git push'))
  await liveTurn($, clock, 4, 200)
  // liveTurn ran the turn's slash commands too: the last, `/cockpit`, closed the pane; the row is drawn again at 200.
  const after = await rowsOf($, groupOf(push, 200, true))

  expect(after.some(r => r.trim().endsWith(BLOCKED))).toBe(true)
  expect(after.some(r => /◇  worked/.test(r))).toBe(false)
  expect(after.join('\n')).not.toMatch(/hook error|pwsh -NoProfile/)
})

/** A command Cockpit answers, then its output row as the engine raises it: no arguments, its `ghostframe:` prefix. */
async function commandRows($: Engine, command: string, args: string) {
  const out = await $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

  return rowsOf($, site('CommandOutput', `out-${command}-${args}`, 127, { command, args: '', text: `ghostframe: ${out.text ?? ''}`, isErrored: false }))
}

test('7. after turn 4: one row per command, `×` for an error, the whole command, no `ghostframe:`; /steps n all is step rows', LONG, async ($, on) => {
  const clock = await session($, on, true)
  await liveTurn($, clock, 4, 200)
  const copy = await commandRows($, 'copy', 'code 9')
  const steps = await commandRows($, 'steps', '1 all')
  const cockpit = await commandRows($, 'cockpit', '')

  expect(copy).toEqual([
    expect.stringMatching(/^ {4}\d\d:\d\d:\d\d ×  \/copy code 9 {3}There is no code block 9 · the last answer has /),
    expect.stringMatching(/^ {13}│$/)
  ])
  expect(steps[0]).toMatch(/^ {4}\d\d:\d\d:\d\d ✓  \/steps 1 all$/)
  expect(steps.join('\n')).not.toMatch(/ghostframe:|[▄▀]|\{ "name"/)
  // `/cockpit` toggles: the pane was open, so it closes.
  expect(cockpit[0]).toMatch(/✓  \/cockpit {3}Pane (closed|docked · 200 columns)$/)
  for (const r of [...copy, ...steps, ...cockpit]) expect(r).not.toContain('ghostframe:')
})

const receiptRows = async ($: Engine, n: number, answer: string, columns: number) =>
  (await rowsOf($, site('AssistantMessage', blockRow(n, answer), columns, { text: answer, isFirstOfReply: true }))).filter(r =>
    /✓  DONE|×  FAILED|!  WAITING/.test(r)
  )

test('8. turn 7, three agents: one receipt, at the end, counting the whole turn: every step and `3 agents`; never WAITING', LONG, async ($, on) => {
  const clock = await session($, on, true)
  await liveTurn($, clock, 7, 200)
  const answers = blocksOf(7, 'text')

  // The first two answers came while agents still ran: no receipt under either.
  expect(await receiptRows($, 7, answers[0] ?? '', 127)).toEqual([])
  expect(await receiptRows($, 7, answers[1] ?? '', 127)).toEqual([])
  // The last: the whole turn's, its steps from the header (the launch and Claude's own 3 calls).
  // 1m 31s from the header; Claude's own `bun run test` after the reports failed and nothing fixed it.
  expect(await receiptRows($, 7, answers[2] ?? '', 127)).toEqual([
    expect.stringMatching(/^ +1m 31s × {2}FAILED {3}[⣀-⣿]+ {3}4 steps · 1 still failing · 3 agents$/)
  ])
})

const paneRows = async ($: Engine) => {
  const pane = await $.ui.mount(PANE)
  const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text)
  await pane.unmount()

  return texts.filter((t, i) => !texts.slice(0, i).some(o => o !== t && o.includes(t)))
}

test('9, 14. turn 7: Claude`s own `bun run test` is its own row, never the agents` launch group; the launch reads 3 agents', LONG, async ($, on) => {
  const clock = await session($, on, true)
  await liveTurn($, clock, 7, 200)
  const rows = await paneRows($)

  expect(rows).toContainEqual(expect.stringMatching(/^ {2}◇ agent 3 launched .* 3 agents *$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}× shell bun run test .* exit 1 *$/))
  expect(rows.some(r => /◇ agent 3 launched .*exit 1/.test(r))).toBe(false)
})

test('14. turn 10, no working sentences: one row per step, each `ls` its own, its own failure', LONG, async ($, on) => {
  const clock = await session($, on, true)
  await liveTurn($, clock, 10, 200)
  const rows = (await paneRows($)).filter(r => /^ {2}[×✓●] shell ls /.test(r))

  expect(rows.map(r => /ls (\/nope\d)/.exec(r)?.[1])).toEqual(['/nope1', '/nope2', '/nope3', '/nope4', '/nope5', '/nope1'])
})

test(
  'round 6, 3. turn 10 in fallback at 100: three × rows, `+ 2 more` directly under them above the worked node, never after the answer',
  LONG,
  async ($, on) => {
    const clock = await session($, on, false)
    await liveTurn($, clock, 10, 100)
    const calls = (TURNS[10]?.events ?? [])
      .filter(e => e.k === 'call')
      .map(e => ({ id: String(e['id']), tool: String(e['tool']), input: e['input'] as Record<string, unknown> }))
    const rows: string[] = []

    for (const c of calls) rows.push(...(await rowsOf($, groupOf(c, 100, true))))

    const [answer] = blocksOf(10, 'text')
    const left = [...rows, ...(await rowsOf($, site('AssistantMessage', blockRow(10, answer ?? ''), 100, { text: answer, isFirstOfReply: true })))]
    const marks = left.flatMap(r => {
      const m = /^ +(?:\d+s )?([×◇│]) {2}(\S+)/.exec(r)

      return m === null ? [] : m[1] === '│' && m[2] !== '+' ? [] : [m[1] === '│' ? '+' : `${m[1]} ${m[2]}`]
    })

    // The order the left reads, top to bottom: the three keys' rows, the count of the rest, the worked node, the receipt.
    expect(marks).toEqual(['× shell', '× shell', '× shell', '+', '◇ worked', '× FAILED'])
    // Directly under the third row's detail line, and nothing of the answer between.
    const more = left.indexOf('             │  + 2 more · /steps 1')
    expect(more).toBeGreaterThan(0)
    expect(left[more - 1]).toMatch(/^ {13}│ {2}└ ls: cannot access '\/nope3'/)
  }
)

test('12, 17. the focused pane: no `1: 2: …` hotkey column; the hint row is the pane`s last row', LONG, async ($, on) => {
  const clock = await session($, on, true)
  await liveTurn($, clock, 10, 200)
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  await $.ui.focus({
    component: 'Pane',
    requestId: 'cockpit',
    plugin: 'ghostframe',
    element: (await pane.findAll({ type: 'Button' }))[0]?.props['key'],
    origin: { kind: 'person' }
  } as never)
  await pane.redraw()

  // The hotkey Buttons sit in a Box that is not displayed: nothing of them is drawn.
  const hidden = (await pane.findAll({ type: 'Box' })).filter(b => b.props['display'] === 'none')
  expect(hidden).toHaveLength(1)
  const shown = (await pane.findAll({ type: 'Text' })).map(t => t.text)
  expect(shown.some(t => /^[0-9a-z]: ?$/.test(t.trim()))).toBe(false)
  // Every row takes its line (a blank one draws a space), so the hint row and the wordmark are the pane's last row,
  // blank rows above it where the content ends.
  const lines = (await pane.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate' || t.text === ' ').map(t => t.text)
  const hint = lines.findLastIndex(t => t.trim().length > 0)
  expect(lines[hint]).toMatch(/ghostframe /)
  expect(lines[hint - 1]).toBe(' ')
  await pane.unmount()
})

test('16. turn 8, interrupted: the head`s pill is ◼ INTERRUPTED, never FAILED; its search is one row and fails nothing', LONG, async ($, on) => {
  const clock = await session($, on, true)
  await liveTurn($, clock, 8, 200)
  const rows = await paneRows($)

  expect(rows).toContainEqual(expect.stringMatching(/^ {2}▐ ◼ INTERRUPTED ▌  TURN 1 /))
  expect(rows.some(r => /× FAILED/.test(r))).toBe(false)
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}✓ search "width\\\.test" .* no matches *$/))
})

test('15. turn 7`s agents: nothing invented before a first step; done, `✓ reported · n steps` and `done`; the drawer`s brief', LONG, async ($, on) => {
  const clock = await session($, on, true)
  await liveTurn($, clock, 7, 200)
  const rows = await paneRows($)

  expect(rows.some(r => /reading its brief/.test(r))).toBe(false)
  expect(rows.filter(r => /^ {2}[│ ] ✓ reported · \d+ steps? +done *$/.test(r))).toHaveLength(3)
  expect(rows.some(r => /D:\|\uFE0F/.test(r))).toBe(false)
})
