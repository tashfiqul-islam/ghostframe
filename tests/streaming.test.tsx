import { expect, test } from 'claude-code/testing'

const FULL = `Prose cells in tables now wrap instead of being cut, and Phase 3 (the activity timeline and the diff card) is built. Validate passes (warnings only), tsc exits 0 even with unused-variable checks on, and all 32 tests pass. None of it has been checked on screen yet.

## Table change

| Item | Status |
|---|---|
| Prose cells wrap inside their column, up to 4 lines, hanging under the first line | done |
| Numbers never wrap | done |

Stopping here.`

/** Every visible line the drawing holds, in order. */
async function drawnLines(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; text: string }[]> }) {
  const texts = await ui.findAll({ type: 'Text' })

  // Top-level line holders only: our block Texts (wrap) and the gutter label.
  return texts
    .filter(t => t.props['wrap'] === 'wrap')
    .flatMap(t => t.text.split('\n'))
    .map(l => l.trimEnd())
    .filter(l => l.length > 0)
}

test('a reply re-drawn as it streams never repeats or drops a line', async $ => {
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 120, rows: 40 },
    props: { text: FULL.slice(0, 40), isFirstOfReply: true }
  })

  // Grow the text the way a stream does, re-drawing the same mounted row each time.
  const cuts = [80, 150, 200, 260, 280, 300, 320, 345, 380, 420, 470, FULL.length]

  for (const cut of cuts) {
    await ui.redraw({ text: FULL.slice(0, cut), isFirstOfReply: true })
    const lines = await drawnLines(ui)
    const seen = new Set<string>()

    for (const l of lines) {
      if (/^─+$/.test(l)) continue // the table hairline
      expect(seen.has(l)).toBe(false)
      seen.add(l)
    }
  }

  const final = await drawnLines(ui)
  expect(final.slice(0, 3)).toEqual([
    'Prose cells in tables now wrap instead of being cut, and Phase 3 (the activity timeline and the',
    'diff card) is built. Validate passes (warnings only), tsc exits 0 even with unused-variable',
    'checks on, and all 32 tests pass. None of it has been checked on screen yet.'
  ])
  expect(final).toContain('Table change')
  expect(final[final.length - 1]).toBe('Stopping here.')
  await ui.unmount()
})
