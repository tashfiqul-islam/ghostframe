import { expect, test } from 'claude-code/testing'

import { ON, PANE } from '../../../support/cockpit'
import type { Engine, On } from '../../../support/engine'
import { textAt } from '../../../support/text'

// The wide left (6.1): prose keeps its 86-cell measure; a table, a code card and a diff card grow to the room the left
// has past the text column's start, at most 140: max(86, min(140, left − 17)). Under 110 columns with no pane, all of
// it keeps the narrow 78.
const PROSE =
  'Three of the five release jobs pin their actions by tag, not by commit. The table lists each job, the action it runs, and the pin it should use; the change is below.'
const TABLE = [
  '| Job | Action | Should pin | Source |',
  '| --- | --- | --- | --- |',
  '| release-please | googleapis/release-please-action | 16a9c90856f42705d54a6fda1823352bdc62cf38 | https://github.com/googleapis/release-please-action/releases/tag/v4.2.0 |',
  '| build | oven-sh/setup-bun | 735343b667d3e6f658f44d0eca948eb6282f2b76 | https://github.com/oven-sh/setup-bun/releases/tag/v2.0.2 |'
].join('\n')
const CODE = [
  '```yaml .github/workflows/release.yml',
  '      - uses: googleapis/release-please-action@16a9c90856f42705d54a6fda1823352bdc62cf38 # v4.2.0',
  '        with: { config-file: release-please-config.json, manifest-file: .release-please-manifest.json }',
  '```'
].join('\n')
const SAID = `${PROSE}\n\n${TABLE}\n\n${CODE}`

function engine(on: On, isPlaced: boolean): void {
  on('ui.open', () => ({ value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'unasked below 144 columns' } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'wide' }))
  on('store.get', () => ({ value: undefined as never }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

/** The answer's rows at a left this wide, docked or not. */
async function rows($: Engine, on: On, left: number, isDocked: boolean): Promise<string[]> {
  engine(on, isDocked)
  if (isDocked) await (await $.ui.mount(PANE)).unmount()
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: `wide-${left}`,
    viewport: { columns: left, rows: 60, isFullscreen: true },
    props: { text: SAID, isFirstOfReply: true }
  } as never)
  const drawn = textAt(await ui.drawn(), left)
  await ui.unmount()

  return drawn
}

/** The cells a row reaches: its last non-space cell, counting from 1. */
const reach = (row: string) => row.trimEnd().length

for (const [terminal, left, isDocked, block] of [
  [100, 100, false, 78],
  [120, 120, false, 103],
  [200, 127, true, 110],
  [280, 207, true, 140]
] as const) {
  test(`${terminal} columns (left ${left}): prose stays at ${Math.min(86, block)}; the table and the code card take ${block}`, ON, async ($, on) => {
    const drawn = await rows($, on, left, isDocked)
    const prose = drawn.filter(r => /^ {13}│ {2}[A-Za-z]/.test(r) && /release jobs|lists each|action it runs|change is below/.test(r))
    const tableHead = drawn.find(r => /Job {2,}Action/.test(r)) ?? ''
    const codeHead = drawn.find(r => /YAML/.test(r)) ?? ''

    expect(prose.length).toBeGreaterThan(0)
    for (const r of prose) expect(reach(r)).toBeLessThanOrEqual(16 + (block === 78 ? 78 : 86))
    // The table's header band and the code card's head strip span the block width exactly.
    expect(tableHead.length).toBeGreaterThan(0)
    expect(reach(tableHead.replace(/\s+$/, '')) <= 16 + block).toBe(true)
    expect(drawn.some(r => r.length >= 16 + block && /[▄▀]{20}/.test(r.slice(16, 16 + block)) && r.slice(16 + block).trim() === '')).toBe(true)
    expect(codeHead).toMatch(/c copy\s*$/)
    expect(reach(codeHead)).toBe(16 + block - 2)
  })
}

test('280 columns: the table shows what an 86-cell one cuts, and no row passes 16 + 140', ON, async ($, on) => {
  const drawn = await rows($, on, 207, true)

  // At 86 the four columns share 82 cells and the URL cell keeps about 20 of them; at 140 it keeps more than 45.
  expect(drawn.some(r => r.includes('https://github.com/googleapis/release-please-'))).toBe(true)
  for (const r of drawn) expect(reach(r)).toBeLessThanOrEqual(16 + 140)
})
