import { expect, test } from 'claude-code/testing'

import { VIEW } from '../../../support/view'
import type { Found } from '../../../support/engine'
import { OFF } from '../../../support/cockpit'

// The report that showed the staircase: a table whose last prose cell is still streaming.
const HEAD = `Phase 3 fixes and Phase 4 are both built.

| Item | Status |
|---|---|
| 1. Header kept when a turn's first tool is a fallback engine group | **Done.** The header and label are now drawn separately from the engine's line. |
| 1b. \`claude\` exactly once per turn | `
const CELL =
  "**Done, with one fallback.** If the turn's opening text later shows up as a summary row, the label can only be matched when the summary starts with that text."

/** Every visible line our block Texts draw, in order (blank lines kept, trailing spaces dropped). */
async function lines(ui: { findAll: (q: { type: string }) => Promise<Found[]> }) {
  return (await ui.findAll({ type: 'Text' }))
    .filter(t => t.props['wrap'] === 'wrap')
    .flatMap(t => t.text.split('\n'))
    .map(l => l.trimEnd())
}

const textAt = (n: number) => `${HEAD}${CELL.slice(0, n)} |`

test('a table whose last prose cell streams: every render is a fresh render, no line repeats', OFF, async $ => {
  const mount = (text: string) =>
    $.ui.mount({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', viewport: VIEW, props: { text, isFirstOfReply: true } })

  const cuts = Array.from({ length: 12 }, (_, i) => Math.round(((i + 1) * CELL.length) / 12))
  const live = await mount(textAt(10))

  for (const cut of cuts) {
    await live.redraw({ text: textAt(cut), isFirstOfReply: true })
    const got = await lines(live)

    // No line twice (blank lines and the header hairline aside).
    const shown = got.filter(l => l.trim().length > 0 && !/^─+$/.test(l))
    expect(new Set(shown).size).toBe(shown.length)

    // Exactly what a single render of the same text draws.
    const fresh = await mount(textAt(cut))
    expect(got).toEqual(await lines(fresh))
    await fresh.unmount()
  }

  // The finished cell ends once, on its own last line.
  const final = await lines(live)
  expect(final.filter(l => /\bthat text\.$/.test(l))).toHaveLength(1)
  expect(final[final.length - 1]?.trim()).toBe('with that text.')
  await live.unmount()
})
