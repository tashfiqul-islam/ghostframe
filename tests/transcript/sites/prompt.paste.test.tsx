import { expect, test } from 'claude-code/testing'

import { TOKEN } from '../../../hooks/shared/look/palette'
import { pasteShown } from '../../../hooks/transcript/rows/turn'
import { OFF, ON, T0 } from '../../support/cockpit'
import type { Engine, On } from '../../support/engine'
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

/** The colour each drawn Text with this exact text has. */
async function colours($: Engine, text: string, of: string): Promise<unknown[]> {
  const ui = await $.ui.mount(prompt(text))
  const found = (await ui.findAll({ type: 'Text' })).filter(t => t.text.trim() === of.trim()).map(t => t.props['color'])
  await ui.unmount()

  return found
}

// A paste of a fake key, and one of blank lines only: both keep the plain label (7.2). The fake key is built from pieces:
// secret scanners (GitHub push protection) read the source text and block a whole key-shaped literal, fake or not.
const FAKE_KEY = ['sk-', 'ant-', 'api03-', 'FAKE', '0'.repeat(28)].join('')
const KEY = `use this\n${wrap('k1', `line one\nANTHROPIC_API_KEY=${FAKE_KEY}\nline three`)}`
const BLANK = `look\n${wrap('b1', '\n   \n\n')}`
const LONG = `cut\n${wrap('l1', `${'a'.repeat(200)}-the-end\nsecond`)}`

function engineFor(on: On): void {
  fallbackEngine(on, { now: T0 }, false)
  on('session.id', () => ({ value: 's1' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
}

for (const [mode, options] of [
  ['Cockpit on', ON],
  ['Cockpit off', OFF]
] as const) {
  test(`${mode}: a paste shows its first two lines behind a dim \`▏\`, then a muted \`+N lines\` row, in its place`, options, async ($, on) => {
    engineFor(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const only = await drawn($, ONLY)
    expect(only).not.toContain('pasted_content')
    expect(only).not.toContain('[Pasted text')
    expect(only).toMatch(/▏ brief line 1\n.*▏ brief line 2\n.*\+58 lines/)
    expect(only).not.toContain('brief line 3')

    const around = await drawn($, AROUND)
    const at = (s: string) => around.indexOf(s)
    expect(at('please read this first')).toBeGreaterThan(-1)
    expect(at('please read this first')).toBeLessThan(at('▏ log line 1'))
    expect(at('▏ log line 2')).toBeLessThan(at('+10 lines'))
    expect(at('+10 lines')).toBeLessThan(at('then fix what it says'))
    expect(around).not.toContain('log line 3')

    // Each paste in its place; a 3-line paste hides one line (`+1 line`).
    const two = await drawn($, TWO)
    const of = (s: string) => two.indexOf(s)
    expect(
      [of('compare'), of('▏ left line 1'), of('+1 line\n'), of('with'), of('▏ right line 1'), of('+3 lines')].every(
        (n, i, all) => n > -1 && (i === 0 || n > (all[i - 1] ?? 0))
      )
    ).toBe(true)

    // A one- or two-line paste shows whole, with no count.
    const one = await drawn($, `x ${wrap('c3', 'one line')}`)
    expect(one).toContain('▏ one line')
    expect(one).not.toMatch(/\+\d+ lines?/)

    expect(await drawn($, AROUND, true)).not.toContain('pasted_content')
  })

  test(`${mode}: a paste that looks like it holds a secret, or only blank lines, keeps the plain label`, options, async ($, on) => {
    engineFor(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const key = await drawn($, KEY)
    expect(key).toContain('[Pasted text #1 +2 lines]')
    expect(key).not.toContain('sk-ant')
    expect(key).not.toContain('line one')
    expect(await drawn($, BLANK)).toContain('[Pasted text #1 +3 lines]')
  })

  test(`${mode}: a preview line too long for the row is cut with \`…\`, never wrapped`, options, async ($, on) => {
    engineFor(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    const rows = (await drawn($, LONG)).split('\n')
    const cut = rows.filter(r => r.includes('▏ aaa'))
    expect(cut).toHaveLength(1)
    expect(cut[0]).toMatch(/a…\s*$/)
    expect(rows.some(r => r.includes('the-end'))).toBe(false)
    expect(rows.some(r => r.includes('▏ second'))).toBe(true)
  })

  test(`${mode}: with paste previews off, every paste is the plain label`, { options: { ...options.options, pastePreview: false } }, async ($, on) => {
    engineFor(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

    expect(await drawn($, AROUND)).toContain('[Pasted text #1 +11 lines]')
    expect(await drawn($, AROUND)).not.toContain('▏')
  })
}

test('Cockpit on: the preview is textBright, the marker dim, the count muted (7.2)', ON, async ($, on) => {
  engineFor(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect(await colours($, AROUND, 'log line 1')).toContain(TOKEN.textBright)
  expect(await colours($, AROUND, '▏')).toContain(TOKEN.dim)
  expect(await colours($, AROUND, '+10 lines')).toContain(TOKEN.muted)
})
