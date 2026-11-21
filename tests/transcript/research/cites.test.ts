import { expect, test } from 'claude-code/testing'

import { parseCited } from '../../../hooks/transcript/research/cites'
import { sup } from '../../../hooks/shared/text'
import { footnoteLines } from '../../../hooks/transcript/research/footnotes'
import { partsWidth } from '../../../hooks/shared/parts'
import { LINEAR_MS, ms, RUN } from '../../support/linear'
import { W } from '../../support/view'

test('linear: a parenthesised URL after a long run of spaces', () => {
  expect(ms(() => parseCited(`a${RUN}b [x](https://x.dev/a)`, new Map()))).toBeLessThan(LINEAR_MS)
})

test('linear: a repo ref scan over a long slash-less word', () => {
  expect(ms(() => parseCited(`${'a'.repeat(40000)} [x](https://x.dev/a)`, new Map()))).toBeLessThan(LINEAR_MS)
})

test('linear patterns read the same as before', () => {
  expect(parseCited('Bun has a default (https://bun.com/docs/test/runtime-behavior).', new Map())?.cites.map(c => c.url)).toEqual([
    'https://bun.com/docs/test/runtime-behavior'
  ])
  expect(
    parseCited('see anthropics/claude-code#1 (https://github.com/anthropics/claude-code/issues/1)', new Map())
      ?.runs.map(r => r.t)
      .join('')
  ).toBe('see anthropics/claude-code#1¹')
})

test('link markers: text with private-use glyphs falls back; a fallback takes no number', () => {
  expect(parseCited('icon  and [b](https://b.dev/y)', new Map())).toBe(undefined)
  const n = new Map<string, number>()
  expect(parseCited('see [a](https://a.dev/x) then ', n)).toBe(undefined)
  expect(n.size).toBe(0)
})

test('bare URLs, `(https://…)` and `owner/repo#123 (https://…)` become markers; code keeps its URL', async () => {
  const n = new Map<string, number>()
  const a = parseCited('Same report in anthropics/claude-code#108931 (https://github.com/anthropics/claude-code/issues/108931).', n)
  expect(a?.runs.map(r => r.t).join('')).toBe('Same report in anthropics/claude-code#108931¹.')
  const b = parseCited('Bun has a 5000 ms default (https://bun.com/docs/test/runtime-behavior), see https://bun.sh/guides/test/timeout.md.', n)
  expect(b?.runs.map(r => r.t).join('')).toBe('Bun has a 5000 ms default², see bun.sh · timeout³.')
  expect(b?.cites.map(c => c.url)).toEqual(['https://bun.com/docs/test/runtime-behavior', 'https://bun.sh/guides/test/timeout.md'])
  expect(parseCited('run `curl https://x.dev/a` first', new Map())).toBe(undefined) // the only URL is code
})

test('citations: links become blue superscripts numbered through the message; one footnote line', async () => {
  const numbering = new Map<string, number>()
  const a = parseCited('Retry only hides it; dedupe by key [vitest](https://vitest.dev/guide/cli#retry).', numbering)
  const b = parseCited('Wait on the queue [pw](https://playwright.dev/docs/actionability) and see [vitest](https://vitest.dev/guide/cli#retry).', numbering)
  expect(a?.runs.map(r => r.t).join('')).toBe('Retry only hides it; dedupe by key vitest¹.')
  expect(b?.runs.filter(r => r.s === 'cite').map(r => r.t)).toEqual(['²', '¹'])
  expect(b?.cites.map(c => c.n)).toEqual([2, 1])
  expect(sup(12)).toBe('¹²')

  const line = footnoteLines(b?.cites ?? [], W)[0] ?? []
  expect(line.map(p => p.t).join('')).toBe('┄┄┄┄ ² playwright.dev · actionability   ¹ vitest.dev · cli')
  expect(line.filter(p => p.href !== undefined).map(p => p.href)).toEqual(['https://playwright.dev/docs/actionability', 'https://vitest.dev/guide/cli#retry'])
  for (const width of [96, 50, 30]) for (const l of footnoteLines(b?.cites ?? [], width)) expect(partsWidth(l)).toBeLessThanOrEqual(width)

  expect(parseCited('no links here', new Map())).toBe(undefined)
  expect(parseCited('a [rel](./x.md) link', new Map())).toBe(undefined)
})
