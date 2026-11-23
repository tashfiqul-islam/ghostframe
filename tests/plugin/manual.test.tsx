import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import type { Engine } from '../support/engine'
import { liveEngine, MANUAL } from '../support/live'

// The person's own manual run (tests/fixtures/manual.ts), replayed: each test is something they saw on screen, at
// 200 columns docked (127 for the transcript beside the 72-column pane) or at 100 in fallback.
export const LONG = { ...ON, timeoutMs: 120_000 }

/** The engine for the manual run, its session started in the run's project, the pane docked at 200 columns or not. */
export async function manualSession($: Engine, on: Parameters<typeof liveEngine>[0], isDocked: boolean): Promise<{ now: number }> {
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
