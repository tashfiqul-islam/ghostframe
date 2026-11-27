import { expect, test } from 'claude-code/testing'

import { pasteShown } from '../../../hooks/transcript/rows/turn'
import { OFF, ON, T0 } from '../../support/cockpit'
import type { Engine } from '../../support/engine'
import { fallbackEngine } from '../../support/fallback'
import { textAt } from '../../support/text'

// A long paste reaches the prompt's row expanded, inside the engine's wrapper, as the session stores it:
// `<pasted_content id="022a">\n…\n</pasted_content id="022a">`. Claude Code's composer shows it as
// `[Pasted text #1 +60 lines]`; the card shows the same, and ctrl+o the text, never the tags.
const lines = (n: number, word: string) => Array.from({ length: n }, (_, i) => `${word} line ${i + 1}`).join('\n')
const wrap = (id: string, body: string) => `<pasted_content id="${id}">\n${body}\n</pasted_content id="${id}">`

const ONLY = `\n\n${wrap('022a', lines(60, 'brief'))}\n`
const AROUND = `please read this first\n\n${wrap('b986', lines(12, 'log'))}\n\nthen fix what it says`
const TWO = `compare\n${wrap('aa11', lines(3, 'left'))}\nwith\n${wrap('bb22', lines(5, 'right'))}`

test('collapsed: each paste is `[Pasted text #n +lines lines]` in its place, the typed words around it kept', () => {
  expect(pasteShown(ONLY, false)).toBe('[Pasted text #1 +59 lines]')
  expect(pasteShown(AROUND, false)).toBe('please read this first\n\n[Pasted text #1 +11 lines]\n\nthen fix what it says')
  expect(pasteShown(TWO, false)).toBe('compare\n[Pasted text #1 +2 lines]\nwith\n[Pasted text #2 +4 lines]')
  expect(pasteShown(`x ${wrap('c3', 'one line')}`, false)).toBe('x [Pasted text #1]')
  expect(pasteShown('no paste here', false)).toBe('no paste here')
})

test('expanded (ctrl+o): the pasted text whole, the tags gone', () => {
  expect(pasteShown(ONLY, true)).toBe(lines(60, 'brief'))
  expect(pasteShown(AROUND, true)).toBe(`please read this first\n\n${lines(12, 'log')}\n\nthen fix what it says`)
  expect(pasteShown(TWO, true)).not.toContain('pasted_content')
})

const prompt = (text: string, isExpanded = false) =>
  ({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: `p-${text.length}-${String(isExpanded)}`,
    viewport: { columns: 120, rows: 50, isFullscreen: true },
    props: { text, origin: { kind: 'composer' }, isExpanded }
  }) as never

async function drawn($: Engine, text: string, isExpanded = false): Promise<string> {
  const ui = await $.ui.mount(prompt(text, isExpanded))
  const rows = textAt(await ui.drawn(), 120).join('\n')
  await ui.unmount()

  return rows
}

for (const [mode, options] of [
  ['Cockpit on', ON],
  ['Cockpit off', OFF]
] as const) {
  test(`${mode}: the prompt card never draws the paste's wrapper tags`, options, async ($, on) => {
    fallbackEngine(on, { now: T0 }, false)
    on('session.id', () => ({ value: 's1' }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('session.messages', () => ({ value: [] }))
    on('command.register', (_, e) => ({ value: { command: e.name } }))
    on('store.keys', () => ({ value: [] }))
    on('store.get', () => ({ value: undefined }))
    on('store.set', () => ({ value: undefined }))
    on('ui.log', () => ({ value: undefined }))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const only = await drawn($, ONLY)
    expect(only).not.toContain('pasted_content')
    expect(only).toContain('[Pasted text #1 +59 lines]')
    expect(only).not.toContain('brief line 2')

    const around = await drawn($, AROUND)
    expect(around).not.toContain('pasted_content')
    expect(around.indexOf('please read this first')).toBeLessThan(around.indexOf('[Pasted text #1 +11 lines]'))
    expect(around.indexOf('[Pasted text #1 +11 lines]')).toBeLessThan(around.indexOf('then fix what it says'))

    const two = await drawn($, TWO)
    expect(two).not.toContain('pasted_content')
    expect(two).toContain('[Pasted text #1 +2 lines]')
    expect(two).toContain('[Pasted text #2 +4 lines]')

    expect(await drawn($, AROUND, true)).not.toContain('pasted_content')
  })
}
