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
