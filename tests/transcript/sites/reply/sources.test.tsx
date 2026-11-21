import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { textAt } from '../../../support/text'
import { respond } from '../../../support/respond'
import { FOOTNOTED, SOURCED } from '../../../support/sources'

// Footnotes vs Sources, on the specimen's own reply (tests/plugin/specimen.test.tsx, turn 2):
// a reply split over several messages numbers its sources once, through the turn.

const VIEW = { columns: 90, rows: 400 }
const rows = async ($: Parameters<TestBody>[0], text: string) => {
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text, isFirstOfReply: false }
  } as never)
  const out = textAt(await ui.drawn(), VIEW.columns).map(l => l.trimEnd())
  await ui.unmount()

  return out
}
const SUP: Record<string, string> = { '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5' }

test('a web turn: frames carry the markers’ numbers, no footnote line; each message frames what it adds', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.start({ text: 'fix it', turnId: 't1' })
  // A web search first: the turn draws frames (§0.2).
  await $.session.append(respond([{ type: 'tool_use', id: 'w1', name: 'WebSearch', input: { query: 'vitest dedupe' } }], 'w'))
  await $.session.append(respond([{ type: 'text', text: FOOTNOTED }], 'a1'))
  await $.session.append(respond([{ type: 'text', text: SOURCED }], 'a2'))
  await $.turn.complete({ answer: SOURCED, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', usage: { output_tokens: 10 } } as never)

  const list = await rows($, FOOTNOTED)
  const frame = await rows($, SOURCED)

  // No footnote line anywhere in the reply.
  expect([...list, ...frame].some(l => l.includes('┄┄┄┄ ¹'))).toBe(false)

  // Each inline marker names the frame row of the same source.
  const frameRow = (n: string) => list.find(l => new RegExp(`^\\s*┆ ${n}  `).test(l)) ?? ''
  const marks = [
    { line: list.find(l => l.includes('vitest')) ?? '', label: 'vitest.dev · cli' },
    { line: list.find(l => l.includes('bun#9123')) ?? '', label: 'bun#9123' }
  ]

  for (const { line, label } of marks) {
    const sup = /[¹²³⁴⁵]/.exec(line)?.[0] ?? ''
    expect(`${label} → ${frameRow(SUP[sup] ?? '?').includes(label)}`).toBe(`${label} → true`)
  }
  // The list message frames its two numbered sources; the Sources message frames only what
  // it adds: the three it names with no marker, no number each.
  expect(list.some(l => l.includes('[ SOURCES ]') && l.includes('2 cited'))).toBe(true)
  expect(frame.some(l => l.includes('[ SOURCES ]') && l.includes(' 3 listed ') && !l.includes('cited'))).toBe(true)
  expect(frame.some(l => /┆ [12] {2}/.test(l))).toBe(false)
  for (const title of ['Bun test runner', 'Playwright actionability', 'Node timers']) expect(frame.find(l => l.includes(title))).toMatch(/┆ · {2}/)
})

test('a reply without a frame: the footnote line sits right under the block holding its markers', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.session.append(respond([{ type: 'text', text: FOOTNOTED }], 'a1'))

  const list = (await rows($, FOOTNOTED)).filter(l => l.length > 0)
  const lastBullet = list.findLastIndex(l => /^\s*· /.test(l))
  const note = list.findIndex(l => l.includes('┄┄┄┄ ¹'))

  // Under the bullets that hold ¹ and ², before the numbered list starts.
  expect(note).toBe(lastBullet + 1)
  expect(list[note]).toContain('¹ vitest.dev · cli')
  expect(list[note]).toContain('² bun#9123')
  expect(list[note + 1]).toMatch(/^\s*1\. run the suite/)
})
