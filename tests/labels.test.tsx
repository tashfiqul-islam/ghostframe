import { expect, test } from 'claude-code/testing'

import { layoutStep } from '../hooks/activity'
import { describe as describeCall } from '../hooks/shared/calls/describe'
import { vw } from '../hooks/shared/text'
import { C } from '../hooks/shared/tokens'
import { sourceLabel } from '../hooks/shared/url'
import { clipLabel, footnoteLines, sourceTitle, sourcesFrame } from '../hooks/research'
import { clipRuns, headerAlign, parseTable } from '../hooks/table'
import { textAt } from './text'

// ─── 1. Header alignment follows a mostly-numeric column ─────────────────────

const RELEASES = [
  '| Version | Released | Released by | Issues fixed | Contributors |',
  '|---|---|---|---|---|',
  '| v1.4.4 | Oct 22, 2026 | Jarred-Sumner | 271 | 39 |',
  '| v1.4.3 | Oct 10, 2026 | Jarred-Sumner | 166 | 8 |',
  '| v1.4.2 | Sep 5, 2026 | dylan-conway | not stated | 3 |'
].join('\n')

test('a header right-aligns over a column whose non-empty cells are mostly numbers', async ($, on) => {
  const t = parseTable(RELEASES.split('\n'))
  if (t === undefined) throw new Error('no table')

  expect(headerAlign(t, 3)).toBe('right') // 2 of 3 numbers
  expect(headerAlign(t, 4)).toBe('right') // all numbers
  expect(headerAlign(t, 0)).toBe('left') // v1.4.4 is a version, not a number
  expect(headerAlign(t, 2)).toBe('left')

  // Exactly half is not "more than half".
  const half = parseTable(['| a | b |', '|---|---|', '| x | 1 |', '| y | n/a |'])
  if (half === undefined) throw new Error('no table')
  expect(headerAlign(half, 1)).toBe('left')

  // On screen: the header ends on the same column as the numbers under it.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const ui = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 140, rows: 40 },
    props: { text: RELEASES, isFirstOfReply: false }
  } as never)
  const lines = textAt(await ui.drawn(), 140)
  await ui.unmount()
  const head = lines.find(l => l.includes('Contributors')) ?? ''
  const row = lines.find(l => l.includes('v1.4.4')) ?? ''

  expect(head.indexOf('Issues fixed') + 'Issues fixed'.length).toBe(row.indexOf('271') + 3)
  expect(head.indexOf('Contributors') + 'Contributors'.length).toBe(row.indexOf('39') + 2)
})

// ─── 2. Generic and repeated titles get their URL's last part ───────────────

test('sources titles: generic or repeated → "<title> · <short label>"; specific ones unchanged', () => {
  const cites = [
    { n: 1, url: 'https://bun.com/blog/bun-v1.4.4', title: 'post' },
    { n: 2, url: 'https://bun.com/blog/bun-v1.4.3', title: 'Release notes' },
    { n: 3, url: 'https://github.com/oven-sh/bun/releases', title: 'GitHub releases' },
    { n: 4, url: 'https://en.wikipedia.org/wiki/Bun_(software)', title: 'Bun (software)' },
    { n: 5, url: 'https://www.gitwatchman.com/track/oven-sh/bun', title: 'gitwatchman.com' },
    { n: 6, url: 'https://newreleases.io/project/github/oven-sh/bun/release/bun-v1.4.0', title: 'Bun release' },
    { n: 7, url: 'https://releasealert.dev/github/oven-sh/bun', title: 'Bun release' }
  ]
  const shown = cites.map(c => sourceTitle(c, cites))

  expect(shown).toEqual([
    'post · bun-v1.4.4',
    'Release notes · bun-v1.4.3',
    'GitHub releases',
    'Bun (software)',
    'gitwatchman.com · bun',
    'Bun release · bun-v1.4.0',
    'Bun release · bun'
  ])

  // Every generic word, any case.
  for (const g of ['post', 'page', 'here', 'link', 'docs', 'release notes', 'article', 'blog', 'source', 'DOCS']) {
    expect(sourceTitle({ n: 1, url: 'https://x.dev/a/b-c', title: g }, [])).toBe(`${g} · b-c`)
  }

  // The frame and a Sources footnote line both draw them.
  const frame = sourcesFrame(cites, 96).map(l => l.map(p => p.t).join(''))
  expect(frame.some(l => l.includes('post · bun-v1.4.4'))).toBe(true)
  expect(frame.some(l => l.includes('Bun (software) '))).toBe(true)
  const notes =
    footnoteLines(cites.slice(0, 2), 96, true)[0]
      ?.map(p => p.t)
      .join('') ?? ''
  expect(notes).toContain('post · bun-v1.4.4')
})

// ─── 3. Slugs: trailing IDs dropped, clipped at the end at a hyphen ─────────

test('URL labels: a trailing hash or ID is dropped; a long slug clips at its end, at a hyphen', () => {
  const medium = 'https://medium.com/@mernstackdevbykevin/bun-1-4-is-it-finally-ready-for-production-f8381f2fbd79'
  expect(sourceLabel(medium)).toBe('medium.com · bun-1-4-is-it-finally-ready-for-production')
  expect(sourceLabel('https://x.dev/posts/my-post_20261117')).toBe('x.dev · my-post')
  expect(sourceLabel('https://x.dev/notes/my_note_0a1b2c3d4e')).toBe('x.dev · my_note')
  // Short tails, English a–f words and versions stay; a slug that is all ID stays.
  expect(sourceLabel('https://x.dev/a/release-2026')).toBe('x.dev · release-2026')
  expect(sourceLabel('https://x.dev/a/cafe-deadbeef')).toBe('x.dev · cafe-deadbeef')
  expect(sourceLabel('https://bun.com/blog/bun-v1.4.4')).toBe('bun.com · bun-v1.4.4')
  expect(sourceLabel('https://x.dev/p/f8381f2fbd79')).toBe('x.dev · f8381f2fbd79')
  // GitHub labels are unchanged.
  expect(sourceLabel('https://github.com/oven-sh/bun/issues/12345678')).toBe('bun#12345678')

  // Clipped at the end at a word boundary, the host whole, no separator before `…`.
  const label = sourceLabel(medium)
  for (const n of [24, 30, 40, 48]) {
    const c = clipLabel(label, n)
    expect(vw(c)).toBeLessThanOrEqual(n)
    expect(c.startsWith('medium.com · bun')).toBe(true)
    expect(c.endsWith('…')).toBe(true)
    expect(c).not.toMatch(/[-_]…$/)
    expect(label.startsWith(c.slice(0, -1))).toBe(true) // a head, never a middle cut
    expect(label.charAt(c.length - 1)).toMatch(/[-_]/) // it stopped at a hyphen
  }
  expect(clipLabel(label, 30)).toBe('medium.com · bun-1-4-is-it…')
  // No hyphen in reach: a hard cut at the end.
  expect(clipLabel('x.dev · abcdefghijklmnop', 14)).toBe('x.dev · abcde…')
  // Labels with no slug keep the middle clip (the issue number stays).
  expect(clipLabel('claude-code#108931', 12)).toBe('claud…108931')

  // Every place a label shows uses it: the frame, a footnote line, a fetch row, a table cell.
  const cite = [{ n: 1, url: medium, title: 'Bun 1.4: Is It Ready for Production in 2026?' }]
  const note =
    footnoteLines(cite, 34)[0]
      ?.map(p => p.t)
      .join('') ?? ''
  expect(note).toMatch(/¹ medium\.com · bun[\w-]*…$/)
  expect(note).not.toMatch(/[-_]…$/)
  const frame = sourcesFrame([...cite, ...[2, 3, 4, 5].map(n => ({ n, url: `https://x.dev/${n}`, title: `T${n}` }))], 60)
  expect(frame.some(l => l.some(p => /^medium\.com · bun[\w-]*…$/.test(p.t)))).toBe(true)

  const fetchCall = describeCall('WebFetch', { url: medium, prompt: 'x' })
  if (fetchCall === undefined) throw new Error('no step')
  const step = { ...fetchCall, dot: { text: '●', color: C.ok }, result: [{ text: '200', color: C.ok }] }
  const laid = layoutStep(step, '0.7s', 60)
  expect(laid.target).toMatch(/^medium\.com · bun[\w-]*…$/)

  const cell = clipRuns([{ t: label, s: 'label' }], 30)
    .map(r => r.t)
    .join('')
  expect(cell).toBe('medium.com · bun-1-4-is-it…')
})
