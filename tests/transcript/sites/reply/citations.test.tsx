import { expect, test } from 'claude-code/testing'

import { sourcesFrame } from '../../../../hooks/transcript/research/sources'
import { partsWidth } from '../../../../hooks/shared/parts'
import { respond } from '../../../support/respond'
import { rows } from '../../../support/narrow'
import { VIEW } from '../../../support/view'

const MANY = [
  'The newest is v1.4.4 [v1.4.4](https://bun.com/blog/release-notes/bun-v1.4.4).',
  '',
  'Sources:',
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `- [Source ${n}](https://example.dev/s/${n})`)
].join('\n')

test('a source cited only in the first paragraph is in the frame; no footnote lines; frame count = footer count', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'q' }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: 'p'
  } as never)
  await $.turn.start({ text: 'q', turnId: 't1' })
  // A web search first: the turn draws a frame (§0.2).
  await $.session.append(respond([{ type: 'tool_use', id: 'w1', name: 'WebSearch', input: { query: 'bun' } }], 'w'))
  await $.session.append(respond([{ type: 'text', text: MANY }], 'r'))
  // A narrow sources hit so the turn is a run (the tally shows from level 3).
  await $.turn.complete({ answer: MANY, durationMs: 4321, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 120, rows: 60 },
    props: { text: MANY, isFirstOfReply: true }
  })
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  // One source has a marker; the list's other nine are listed, unnumbered.
  expect(all).toContain('1 cited · 9 listed')
  expect(all.some(t => t.startsWith('┄┄┄┄ '))).toBe(false)
  // ¹ is listed in the frame: its row's number and its label.
  expect(all.some(t => /^ ?1  $/.test(t))).toBe(true)
  expect(all).toContain('bun.com · bun-v1.4.4')
  await ui.unmount()

  const close = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'TurnDuration',
    viewport: { columns: 120, rows: 40 },
    props: { word: 'Baked', durationMs: 4321 }
  })
  expect(await close.find({ type: 'Text', text: /10 sources/ })).toBeDefined()
  await close.unmount()
})
test('footnotes: a list lists its own ³ even when a later paragraph reuses it', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const text = [
    '**Options**',
    '- one [a](https://bun.com/docs/test/runtime-behavior) with `timeoutMs`; ok',
    '- two [b](https://bun.sh/guides/test/timeout.md)',
    '- three [c](https://github.com/anthropics/claude-code/issues/108931)',
    '',
    'Background: https://github.com/anthropics/claude-code/issues/108931'
  ].join('\n')
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 120, rows: 40 },
    props: { text, isFirstOfReply: false }
  })
  const notes = (await rows(ui)).filter(l => l.startsWith('┄┄┄┄'))
  expect(notes).toHaveLength(2)
  expect(notes[0]).toMatch(/¹ .*² .*³ /)
  expect(notes[1]).toMatch(/^┄┄┄┄ ³ claude-code#108931/)
  await ui.unmount()
})

test('a web turn’s reply with links: markers in prose; one [ SOURCES ] frame lists them all, no footnote lines', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'research', turnId: 't1' })
  // A fetch first: the turn draws a frame (§0.2); the reply below is still streaming.
  await $.session.append(respond([{ type: 'tool_use', id: 'f1', name: 'WebFetch', input: { url: 'https://vitest.dev/a', prompt: 'x' } }], 'f'))
  const text = [
    'Dedupe by key [v](https://vitest.dev/a) and wait on the queue [p](https://playwright.dev/b).',
    '',
    'Sources:',
    ...['one', 'two', 'three', 'four', 'five'].map(n => `- [${n}](https://example.dev/${n})`)
  ].join('\n')
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text, isFirstOfReply: false }
  })
  expect(await ui.find({ type: 'Text', text: /^¹$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^SOURCES$/ })).toBeDefined()
  // Every source in the reply: the paragraph's two numbered, the list's five listed.
  expect(await ui.find({ type: 'Text', text: /^2 cited · 5 listed$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^┄┄┄┄ / })).toBeUndefined()
  expect(await ui.findAll({ type: 'Link' })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /https:\/\// })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  await ui.unmount()

  for (const width of [96, 60, 40]) {
    for (const l of sourcesFrame([{ n: 1, url: 'https://a.dev/' + 'x'.repeat(200), title: 'T'.repeat(90) }], width)) expect(partsWidth(l)).toBe(width)
  }
})
