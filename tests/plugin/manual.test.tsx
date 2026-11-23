import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import type { Engine } from '../support/engine'
import { liveEngine, liveTurn, MANUAL } from '../support/live'

// The person's own manual run (tests/fixtures/manual.ts), replayed: each test is something they saw on screen, at
// 200 columns docked (127 for the transcript beside the 72-column pane) or at 100 in fallback.
const LONG = { ...ON, timeoutMs: 120_000 }

/** The engine for the manual run, its session started in the run's project, the pane docked at 200 columns or not. */
async function manualSession($: Engine, on: Parameters<typeof liveEngine>[0], isDocked: boolean): Promise<{ now: number }> {
  const clock = { now: T0 }
  liveEngine(on, clock, isDocked, MANUAL)
  await $.session.start({ cwd: String.raw`D:\Projects\cockpit-live`, surface: 'terminal', isInteractive: true } as never)
  if (isDocked) await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
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
