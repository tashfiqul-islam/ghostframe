import { expect, test } from 'claude-code/testing'

import { ON, PANE } from '../../support/cockpit'
import type { Engine, On } from '../../support/engine'
import { textAt } from '../../support/text'

// A task's notice (`task-notification`) that is not an agent's: a background command, a monitor's event. Cockpit on,
// it draws on the left's grid (6.1): no label, its glyph in the spine column, its words in the text column from
// column 16, wrapped there by words, the duration kept at its end.
const COMMAND = 'Background command "bun test hooks/cockpit/history/store.test.ts --rerun-each 5 --timeout 120000" completed (exit code 0)'
const MONITOR = 'Monitor event: "CI run 1234567 for fix/task-notification-rows" changed state from in_progress to completed with conclusion success'

const notice = (text: string, columns: number, durationMs?: number) =>
  ({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: `n-${columns}-${text.length}`,
    viewport: { columns, rows: 50, isFullscreen: true },
    props: {
      text,
      origin: { kind: 'task-notification' },
      isExpanded: false,
      task: { id: 'b7', status: 'completed', ...(durationMs === undefined ? {} : { durationMs }) }
    }
  }) as never

function engine(on: On, isPlaced: boolean): void {
  on('ui.open', () => ({ value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'unasked below 144 columns' } }))
  on('ui.log', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] as never }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

async function rows($: Engine, text: string, columns: number, durationMs?: number): Promise<string[]> {
  const ui = await $.ui.mount(notice(text, columns, durationMs))
  const drawn = textAt(await ui.drawn(), columns).filter(r => r.trim().length > 0)
  await ui.unmount()

  return drawn
}

/** The words a row set holds, the duration's ` · ` split off: what the notice said, nothing cut. */
const words = (drawn: readonly string[]) => drawn.map(r => r.slice(16).trim()).join(' ')

for (const [mode, isDocked] of [
  ['docked', true],
  ['no pane docked', false]
] as const) {
  for (const terminal of [80, 120, 280]) {
    // Docked, the left is the terminal less the 72-column pane and its divider; no dock under 144 columns.
    const columns = isDocked && terminal >= 144 ? terminal - 73 : terminal

    test(`${mode}, ${terminal} columns: a background command's notice sits on the grid, wrapped by words, its duration kept`, ON, async ($, on) => {
      engine(on, isDocked)
      if (isDocked) await (await $.ui.mount(PANE)).unmount()
      const drawn = await rows($, COMMAND, columns, 122_000)
      const width = Math.min(columns - 17, isDocked || columns >= 110 ? 86 : 78)

      // The glyph in the spine column (13), the words from column 16; nothing at column 0.
      expect(drawn[0]).toMatch(/^ {13}● {2}Background command /)
      for (const r of drawn.slice(1)) expect(r).toMatch(/^ {13}│ {2}\S/)
      for (const r of drawn) expect(r.trimEnd().length).toBeLessThanOrEqual(16 + width)
      // Never cut: every word is there, no `…`, and the duration ends it.
      expect(drawn.join('')).not.toContain('…')
      expect(words(drawn)).toBe(`${COMMAND} · 2m 02s`)
    })

    test(`${mode}, ${terminal} columns: a monitor's event wraps the same way, with no duration when it has none`, ON, async ($, on) => {
      engine(on, isDocked)
      if (isDocked) await (await $.ui.mount(PANE)).unmount()
      const drawn = await rows($, MONITOR, columns)

      expect(drawn[0]).toMatch(/^ {13}● {2}Monitor event: /)
      expect(words(drawn)).toBe(MONITOR)
    })
  }
}

test('a command name wider than the text column is broken where it must, never cut off', ON, async ($, on) => {
  engine(on, false)
  const long = `Background command "${'x'.repeat(120)}" completed`
  const drawn = await rows($, long, 100, 3_000)

  expect(words(drawn).replaceAll(' ', '')).toBe(`${long} · 3s`.replaceAll(' ', ''))
})
