import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import { MIXED, answerOf, fallbackEngine, groupOf, mixedTurn, must, rowsOf, site } from '../support/fallback'
import type { Engine } from '../support/engine'

// Principle 11 (spec B, F.31): the same turn shows the same counts in every mode; only the place changes. Docked at
// 200 columns the receipt and the pane carry them; at 100 columns, with no pane, the capsule and the receipt do.
type Counts = Record<'steps' | 'agents' | 'files' | 'sources' | 'failures', number | undefined> & { time: string | undefined }

const count = (rows: readonly string[], word: string): number | undefined => {
  const hit = rows.map(r => new RegExp(String.raw`\b(\d+) ${word}s?\b`).exec(r)?.[1]).find(n => n !== undefined)

  return hit === undefined ? undefined : Number(hit)
}

/** The counts the left and the pane show for a turn, wherever each is drawn, and the turn's time. */
function countsOf(rows: readonly string[]): Counts {
  const receipt = rows.find(r => /✓  DONE|×  FAILED/.test(r))

  return {
    steps: count(rows, 'step'),
    agents: count(rows, 'agent'),
    files: count(rows, 'file'),
    sources: count(rows, 'source'),
    failures: count(rows, 'still failing'),
    // The receipt's label is the turn's time (7.12).
    time: /^ *(\S+(?: \S+s)?) [✓×]/.exec(receipt ?? '')?.[1]
  }
}

async function answerRows($: Engine, n: number, columns: number): Promise<string[]> {
  return rowsOf($, site('AssistantMessage', `m${n}-answer`, columns, { text: answerOf(n), isFirstOfReply: true }))
}

test('the same turn at 200 columns docked and at 100 columns in fallback shows the same steps, agents, files, sources and time', ON, async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock, true)

  // Turn 1, docked at 200 columns: the transcript region is 127 wide beside a 72-column pane.
  await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  const pane = await $.ui.mount(PANE)
  await mixedTurn($, clock, 1)
  const docked = await answerRows($, 1, 127)
  const paneRows = (await pane.findAll({ type: 'Text' })).map(t => t.text)
  await pane.unmount()

  // The person closes the pane (`/cockpit`), and the window is 100 columns: turn 2, the same turn, in fallback.
  await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  clock.now += 60_000
  await mixedTurn($, clock, 2)
  const failure = await rowsOf($, groupOf(must(MIXED(2)[3]), 100, true))
  const fallback = await answerRows($, 2, 100)

  const left = countsOf(docked)
  expect(left).toEqual({ steps: 5, agents: 1, files: 1, sources: 1, failures: 1, time: '17s' })
  expect(countsOf(fallback)).toEqual(left)
  // Docked, the pane's head counted the same steps; in fallback the failure drew its own row at once.
  expect(paneRows.some(r => /^ {2}5 steps {4}1 still failing/.test(r))).toBe(true)
  expect(failure[0]).toBe('             ×  shell ls /nope   exit 2   1s')
  expect(failure[1]).toBe("             │  └ ls: cannot access '/nope': No such file or directory")
  // Fallback: the worked node opens the answer; both receipts say the same.
  expect(fallback[0]).toMatch(/^ {9}16s ◇  worked   [⣀-⣿]+   5 steps · 1 agent$/)
  expect(fallback.at(-1)).toMatch(/^ +17s ×  FAILED   [⣀-⣿]+   5 steps · 1 still failing · 1 file · 1 source · 1 agent$/)
  expect(docked.at(-1)).toMatch(/^ +17s ×  FAILED   [⣀-⣿]+   5 steps · 1 still failing · 1 file · 1 source · 1 agent$/)
})

test('off, the same turn draws as it does on main: narration, the engine`s rows and the old footer, no capsule', async ($, on) => {
  const clock = { now: T0 }
  fallbackEngine(on, clock)
  await mixedTurn($, clock, 3)

  const answer = await answerRows($, 3, 100)
  expect(answer.some(r => r.startsWith('│ worked'))).toBe(false)
  expect(answer.some(r => r.startsWith('─ '))).toBe(false)
  expect((await rowsOf($, groupOf(must(MIXED(3)[3]), 100, true))).some(r => r.startsWith('✕ failed'))).toBe(false)
})
