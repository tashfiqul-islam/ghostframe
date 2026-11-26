import { expect, test } from 'claude-code/testing'

import { VIEW } from '../../../support/view'
import { textAt } from '../../../support/text'
import { engineText } from '../../../support/engine'
import { OFF } from '../../../support/cockpit'

/** Every visible line of a reply's own blocks (the one-Text-per-block holders). */
async function linesOf(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; text: string }[]> }) {
  return (await ui.findAll({ type: 'Text' }))
    .filter(t => t.props['wrap'] === 'wrap')
    .flatMap(t => t.text.split('\n'))
    .map(l => l.trimEnd())
}

test('a list draws `·` and numbers muted, a hanging indent, chips and bright bold; the title as a heading', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const long = 'this item is long enough that it has to wrap onto a second line under its own text, not under the marker'
  const text = `**Why it's close**\n- the limit is \`5000 ms\` per test\n- **slower** now: ${long}\n  - nested one\n2. numbered`
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text, isFirstOfReply: false }
  })
  const lines = await linesOf(ui)
  expect(lines[0]).toBe("Why it's close")
  expect(lines[1]).toBe('· the limit is  5000 ms  per test')
  expect(lines[2]?.startsWith('· slower now: this item is long')).toBe(true)
  expect(lines[3]?.startsWith('  ')).toBe(true) // hangs under the text, two cells in
  expect(lines[3]?.[2]).not.toBe(' ')
  expect(lines.some(l => l.startsWith('  · nested one'))).toBe(true)
  expect(lines.some(l => l.startsWith('2. numbered'))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^ 5000 ms $/ })).toBeDefined() // the chip
  expect((await ui.find({ type: 'Text', text: /^slower$/ }))?.props['weight']).toBe('bold')
  expect((await ui.find({ type: 'Text', text: /^Why it's close$/ }))?.props['weight']).toBe('bold')
  expect((await ui.find({ type: 'Text', text: /^· $/ }))?.props['color']).toBe('#686874')
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  await ui.unmount()
})

test('a list streams stable: a finished item never re-lays out, a half-written last item never sends the list to the engine', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const FULL = [
    '**Findings**',
    '- the suite passes **three** times in a row on a quiet machine with `bun test`',
    '- under load one test times out at [5 s](https://github.com/anthropics/claude-code/issues/108931) because each redraw reads more state',
    '- nested:',
    '  - a probe showed the card cache does not leak between tests',
    '- the fix is a per-test `timeoutMs` or cheaper redraws'
  ].join('\n')
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: FULL.slice(0, 20), isFirstOfReply: false }
  })
  let prev: string[] = []

  for (let cut = 25; ; cut = Math.min(FULL.length, cut + 7)) {
    await ui.redraw({ text: FULL.slice(0, cut), isFirstOfReply: false })
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
    const lines = await linesOf(ui)
    // Every item but the last (the one being written), and the title, hold still.
    const itemStarts = prev.flatMap((l, i) => (/^\s*· /.test(l) ? [i] : []))
    const settled = prev.slice(0, itemStarts[itemStarts.length - 1] ?? 1)
    expect(lines.slice(0, settled.length)).toEqual(settled)
    prev = lines.filter(l => !l.startsWith('┄┄┄┄'))
    if (cut === FULL.length) break
  }
  await ui.unmount()
})

test('a list item with a link gets its marker; the list gets one footnote line under it', OFF, async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const text = '- see anthropics/claude-code#108931 (https://github.com/anthropics/claude-code/issues/108931)\n- and https://bun.com/docs/test'
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text, isFirstOfReply: false }
  })
  expect(await ui.find({ type: 'Text', text: /^¹$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^²$/ })).toBeDefined()
  // The labels alone: no engine Link (its fallback appends the raw URL), no raw URL.
  expect(await ui.findAll({ type: 'Link' })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /^claude-code#108931$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /https:\/\// })).toBeUndefined()
  await ui.unmount()
})

test('rhythm: a bulleted list running into a numbered one gets one blank row between', OFF, async ($, on) => {
  on('ui.render', engineText as never)
  const text = 'Two kinds:\n\n- alpha\n- beta\n1. first\n2. second'
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 120, rows: 40 },
    props: { text, isFirstOfReply: false }
  })
  const rows = textAt(await ui.drawn(), 120).map(r => r.trim())
  const beta = rows.indexOf('· beta')
  expect(beta).toBeGreaterThan(0)
  expect(rows[beta + 1]).toBe('')
  expect(rows[beta + 2]).toBe('1. first')
  expect(rows[rows.indexOf('1. first') + 1]).toBe('2. second')
  await ui.unmount()
})
