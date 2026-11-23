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
