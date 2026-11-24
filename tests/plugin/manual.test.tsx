import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import type { Engine } from '../support/engine'
import { groupOf, rowsOf, site } from '../support/fallback'
import { blockRow, blocksOf, liveEngine, liveTurn, MANUAL } from '../support/live'

// The person's own manual run (tests/fixtures/manual.ts), replayed: each test is something they saw on screen, at
// 200 columns docked (127 for the transcript beside the 72-column pane) or at 100 in fallback.
const LONG = { ...ON, timeoutMs: 120_000 }

/** The engine for the manual run, its session started in the run's project, the pane docked at 200 columns or not. */
async function manualSession(
  $: Engine,
  on: Parameters<typeof liveEngine>[0],
  isDocked: boolean,
  gone: ReadonlySet<string> = new Set()
): Promise<{ now: number }> {
  const clock = { now: T0 }
  liveEngine(on, clock, isDocked, MANUAL, gone)
  await $.session.start({ cwd: String.raw`D:\Projects\cockpit-live`, surface: 'terminal', isInteractive: true } as never)
  // The session's start seats the pane where it docks; its first draw places it.
  if (isDocked) await (await $.ui.mount(PANE)).unmount()

  return clock
}

test('20. turn 1`s prompt was sent beginning `6113223212`: the message card draws what was sent, nothing more', () => {
  expect(MANUAL.turns[1]?.prompt).toBe('6113223212the width tests fail, find out why and fix src/width.ts, then commit')
})

/** The docked pane's rows, focused or not, each once. */
async function paneRows($: Engine, isFocused = false): Promise<string[]> {
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused } })
  const texts = (await pane.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await pane.unmount()

  return texts
}

/** Replays turns `from` to `to` of the manual run. */
async function turns($: Engine, clock: { now: number }, to: number, from = 1, columns = 200): Promise<void> {
  for (let n = from; n <= to; n++) await liveTurn($, clock, n, columns, MANUAL)
}

test('5. turn 1: the first `bun test` failed and stays ×, though a later run fixed it; the passing rerun is its own ✓ row', LONG, async ($, on) => {
  const clock = await manualSession($, on, true)
  await turns($, clock, 1)
  const rows = await paneRows($)
  const tests = rows.filter(r => / test bun test /.test(r))

  expect(tests).toEqual([expect.stringMatching(/^ {2}× test bun test .* 2 of 3 *$/), expect.stringMatching(/^ {2}✓ test bun test .* 3 pass *$/)])
})

test('7. turn 1: the commit step reads `git commit …` and the head summary `↗ <sha>`', LONG, async ($, on) => {
  const clock = await manualSession($, on, true)
  await turns($, clock, 1)
  const rows = await paneRows($)

  expect(rows).toContainEqual(expect.stringMatching(/^ {2}↗ shell git commit -m "fix… .* 078b71c *$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}1 failure → fixed · ↗ 078b71c *$/))
  expect(rows.some(r => /git add|±/.test(r))).toBe(false)
})

test('6. turn 7: the failing step is `× test bun test … 3 of 3`, never `test git mv …`', LONG, async ($, on) => {
  const clock = await manualSession($, on, true)
  await turns($, clock, 7)
  const rows = await paneRows($)

  expect(rows).toContainEqual(expect.stringMatching(/^ {2}× test bun test .* 3 of 3 *$/))
  expect(rows.some(r => /git mv/.test(r))).toBe(false)
})

test('10. turn 3: the denied step is `▍` in err with the result `denied`, its path project-relative', LONG, async ($, on) => {
  const clock = await manualSession($, on, true)
  await turns($, clock, 3)
  const rows = await paneRows($)

  expect(rows).toContainEqual(expect.stringMatching(/^ {2}▍ shell Remove-Item src\/wi… .* denied *$/))
  expect(rows.some(r => /✓ shell Remove-Item|LiteralPath/.test(r))).toBe(false)
})

test('9. turn 2: the failure`s drawer names the cleaned command and says `exit 1`', LONG, async ($, on) => {
  const clock = await manualSession($, on, true)
  await turns($, clock, 2)
  const id = MANUAL.turns[2]?.events.find(e => e.k === 'call' && JSON.stringify(e['input']).includes('bun test'))?.['id']
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  await pane.press({ key: `step:${String(id)}` })
  await pane.redraw()
  const rows = (await pane.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await pane.unmount()
  const drawer = rows.filter(r => / test {2,}bun test/.test(r))

  expect(drawer).toEqual([expect.stringMatching(/test {2,}bun test {2,}.*exit 1/)])
  expect(rows.some(r => /2>&1|\bfailed\b/.test(r))).toBe(false)
})

test('13. turn 1`s Files tab: one file, `src/width.ts +2 −2`, no `@` file from the commit`s here-string', LONG, async ($, on) => {
  const clock = await manualSession($, on, true)
  await turns($, clock, 1)
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  await pane.press({ key: 'key-2' })
  await pane.redraw()
  const rows = (await pane.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await pane.unmount()

  expect(rows).toContainEqual(expect.stringMatching(/FILES 1 /))
  expect(rows).toContainEqual(expect.stringMatching(/^ {4}src\/width\.ts +\+2 {3}−2 {2}■+ *$/))
  expect(rows.some(r => /^ {4}@ /.test(r))).toBe(false)
})

test('16. turn 6`s three agents, started from one message 2.5 s apart: `launched together at HH:MM:SS`', LONG, async ($, on) => {
  const clock = await manualSession($, on, true)
  await turns($, clock, 6)
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  await pane.press({ key: 'key-5' })
  await pane.redraw()
  const rows = (await pane.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await pane.unmount()

  expect(rows).toContainEqual(expect.stringMatching(/^ {2}launched together at \d\d:\d\d:\d\d *$/))
  expect(rows.some(r => /one by one/.test(r))).toBe(false)
})

test('4. turn 5`s Sources: `Test runner` for bun.sh, the fetch`s own title; the 404 with none reads its host and path', LONG, async ($, on) => {
  const clock = await manualSession($, on, true)
  await turns($, clock, 5)
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
  await pane.press({ key: 'key-3' })
  await pane.redraw()
  const rows = (await pane.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
  await pane.unmount()

  expect(rows).toContainEqual(expect.stringMatching(/^ {2}. bun\.sh {3}Test runner +200 *$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}. example\.com {3}example\.com\/missing-page +404 *$/))
  expect(rows.some(r => /bun\.sh · test/.test(r))).toBe(false)
})

test(
  '11. after /cockpit closes the pane two turns later, turn 2 redraws in fallback with its failure row, not just `◇ worked` and the receipt',
  LONG,
  async ($, on) => {
    const clock = await manualSession($, on, true)
    // As in the manual run: turns went on after turn 2 before the switch.
    await turns($, clock, 4)
    await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
    const c = MANUAL.turns[2]?.events.find(e => e.k === 'call' && JSON.stringify(e['input']).includes('bun test'))
    const call = { id: String(c?.['id']), tool: String(c?.['tool']), input: c?.['input'] as Record<string, unknown> }
    const rows = await rowsOf($, groupOf(call, 200, true))
    const [answer] = blocksOf(2, 'text', MANUAL)
    const left = await rowsOf($, site('AssistantMessage', blockRow(2, answer ?? '', MANUAL), 200, { text: answer, isFirstOfReply: true }))

    expect(rows).toContainEqual(expect.stringMatching(/×  test bun test .*1 of 3 fail/))
    expect(left.some(r => /◇  worked/.test(r))).toBe(true)
    expect(left.at(-1)).toMatch(/×  FAILED/)
  }
)

test('18. a rewind took turn 10 out: the pane shows turn 9, turn 10 leaves history, and the next turn is TURN 10 again', LONG, async ($, on) => {
  const gone = new Set<string>()
  const clock = await manualSession($, on, true, gone)
  await turns($, clock, 10)
  expect((await paneRows($)).some(r => /TURN 10 /.test(r))).toBe(true)

  // The rewind: turn 10's rows leave the conversation (its prompt and its answer).
  const t10 = MANUAL.turns[10]
  gone.add(t10?.row ?? '')
  for (const [i, e] of (t10?.events ?? []).entries()) if (e.k === 'text') gone.add(`t10-b${i}`)
  // The pane looks for a rewind at most every 1.5 s (wall clock).
  const until = Date.now() + 1_600

  while (Date.now() < until) await Promise.resolve()
  const rows = await paneRows($)

  expect(rows).toContainEqual(expect.stringMatching(/^ {2}▐ . [A-Z ]+ ▌ {2}TURN 9 /))
  expect(rows.some(r => /TURN 10\b/.test(r))).toBe(false)

  // The next typed turn follows the last that remains: TURN 10 again, not 11.
  await $.prompt.submit({ text: 'say hello', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'say hello', turnId: 't11' })
  expect(await paneRows($)).toContainEqual(expect.stringMatching(/^ {2}▐ ● LIVE ▌ {2}TURN 10 /))
})
