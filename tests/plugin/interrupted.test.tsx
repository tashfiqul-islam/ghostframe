import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0 } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { Engine } from '../support/engine'
import { fallbackEngine } from '../support/fallback'
import type { Clock } from '../support/fallback'
import { respond } from '../support/respond'

// Screen 06: turn 11 is interrupted; Esc sends nothing a row could draw from and an interrupted turn raises no
// TurnDuration, but once turn 12 starts its pane knows, and names turn 11 above the ruler for as long as turn 12 shows.
const CUT = /^ {2}TURN 11 {3}◼ INTERRUPTED after 3 steps · 2 files changed +\d\d:\d\d:\d\d $/

/** A typed turn: a prompt, its calls (two edits and a shell call), then its end, or none. */
async function turn($: Engine, clock: Clock, n: number, end: 'done' | 'aborted' | 'none'): Promise<void> {
  const prompt = `turn ${n}`
  await $.prompt.submit({ text: prompt, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: prompt, turnId: `t${n}` })
  const calls = [
    { id: `a${n}`, tool: 'Edit', input: { file_path: `src/a${n}.ts`, old_string: 'a', new_string: 'b' } },
    { id: `b${n}`, tool: 'Edit', input: { file_path: `src/b${n}.ts`, old_string: 'a', new_string: 'b' } },
    { id: `c${n}`, tool: 'Bash', input: { command: 'echo hi' } }
  ]

  for (const c of calls) {
    await $.session.append(respond([text(`Step ${c.id}.`), use(c.id, c.tool, c.input)], `m-${c.id}`))
    await $.tool.call({ tool: c.tool, ...c.input, tool_use_id: c.id } as never)
  }

  if (end === 'none') return

  clock.now += 1_000
  await $.turn.complete({ answer: '', durationMs: 5_000, isAborted: end === 'aborted', turnId: `t${n}`, reason: end === 'aborted' ? 'aborted' : 'answer' })
}

const paneRows = async ($: Engine) => {
  const pane = await $.ui.mount(PANE)
  const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text)
  await pane.unmount()

  // A row's Text holds its parts' Texts: keep the outer ones.
  return texts.filter((t, i) => !texts.slice(0, i).some(o => o !== t && o.includes(t)))
}

async function docked($: Engine, on: Parameters<typeof fallbackEngine>[0], clock: Clock): Promise<void> {
  fallbackEngine(on, clock, true)
  await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })
  // Ten turns before, so the cut one is turn 11 as on the screen.
  for (let n = 1; n <= 10; n++) await turn($, clock, n, 'done')
}

for (const end of ['aborted', 'none'] as const) {
  test(`screen 06: turn 11 ${end === 'aborted' ? 'ended interrupted' : 'never ended'}; turn 12's pane names it above the ruler`, ON, async ($, on) => {
    const clock = { now: T0 }
    await docked($, on, clock)
    await turn($, clock, 11, end)
    // Before turn 12 starts nothing says turn 11 was cut: no row is drawn that would have to change.
    expect((await paneRows($)).some(r => r.includes('INTERRUPTED'))).toBe(false)

    clock.now += 30_000
    await turn($, clock, 12, 'done')
    const rows = await paneRows($)
    const at = rows.findIndex(r => CUT.test(r))
    expect(at).toBeGreaterThan(0)
    // Above the ruler: the next rows are a blank one, then the ruler's times.
    expect(rows.slice(at + 1).find(r => r.trim().length > 0)).toMatch(/^ {31}\d\d:\d\d:\d\d/)
    expect(rows.find(r => r.includes('TURN 12'))).toBeDefined()

    // Turn 13 follows a turn that ended as it should: no line.
    await turn($, clock, 13, 'done')
    expect((await paneRows($)).some(r => r.includes('INTERRUPTED'))).toBe(false)
  })
}
