import { expect, test } from 'claude-code/testing'

import { noteSources, sourceLines, sourceRows } from '../../../hooks/cockpit/sections/sources'
import type { Part } from '../../../hooks/shared/parts'
import { vw } from '../../../hooks/shared/text'
import { C } from '../../../hooks/shared/tokens'
import type { SourcePage } from '../../../types'

const W = 72
const line = (r: readonly Part[]) => r.map(p => p.t).join('')
const URLS = [
  'https://docs.github.com/en/actions/writing-workflows/workflow-syntax',
  'https://docs.github.com/en/actions/sharing-automations/reusing-workflows',
  'https://docs.zizmor.sh/audits/',
  'https://docs.npmjs.com/trusted-publishers',
  'https://bun.sh/docs/cli/publish',
  'https://github.blog/changelog/immutable-releases',
  'https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/',
  'https://docs.sigstore.dev/cosign/signing/overview/'
]

/** A research turn: 8 pages fetched, the last a 404. */
function research(): SourcePage[] {
  return URLS.reduce<SourcePage[]>(
    (pages, url, i) =>
      i === 7
        ? noteSources(pages, 'WebFetch', { url, prompt: 'x' }, { isError: true, text: 'Request failed with status code 404' })
        : noteSources(pages, 'WebFetch', { url, prompt: 'x' }, { result: { url, code: 200, codeText: 'OK', bytes: 1, result: '', durationMs: 1 } }),
    []
  )
}

// The answer cites five of them, in this order (the transcript's numbering).
const CITED = [0, 1, 2, 3, 4].map(i => ({
  url: URLS[i] ?? '',
  title: ['Workflow syntax', 'Reusing workflows', 'Audit rules', 'Trusted publishing', 'bun publish'][i] ?? ''
}))

test('a research turn with 8 pages and 1 failed fetch: while it runs, fetch order, all `·`; the 404 in err', () => {
  const rows = sourceRows(research(), CITED, true, W, 8)
  expect(rows.map(line)).toEqual([expect.stringMatching(/^┄ \[ SOURCES \] ┄+ 8 read · 0 cited$/), ...URLS.map(() => expect.stringMatching(/^ {2}· \S/))])
  const failed = rows.at(-1) ?? []
  expect(line(failed)).toMatch(/^ {2}· docs\.sigstore\.dev .* 404$/)
  expect(failed.at(-1)).toEqual({ t: '404', color: C.err, bold: true })
  expect(rows[1]?.at(-1)).toEqual({ t: '200', color: C.dim })
  for (const r of rows) expect(vw(line(r))).toBe(W)
})

test('once the turn ends: the cited pages first, with the answer`s marks in its order; `8 read · 5 cited`', () => {
  const rows = sourceRows(research(), CITED, false, W, 8).map(line)
  expect(rows[0]).toMatch(/ 8 read · 5 cited$/)
  expect(rows.slice(1).map(r => r.slice(0, 22))).toEqual([
    '  ¹ docs.github.com  W',
    '  ² docs.github.com  R',
    '  ³ docs.zizmor.sh  Au',
    '  ⁴ docs.npmjs.com  Tr',
    '  ⁵ bun.sh  bun publis',
    expect.stringMatching(/^ {2}· github\.blog/),
    expect.stringMatching(/^ {2}· securitylab\.github/),
    expect.stringMatching(/^ {2}· docs\.sigstore\.dev/)
  ])
  // The mark is link-blue; the host web-teal.
  const first = sourceRows(research(), CITED, false, W, 8)[1] ?? []
  expect(first.find(p => p.t === '¹')?.color).toBe(C.link)
  expect(first.find(p => p.t === 'docs.github.com')?.color).toBe(C.web)

  // The section's cap: 3 rows, then `… n more`; narrow, the title goes.
  expect(sourceRows(research(), CITED, false, W, 3).map(line).at(-1)?.trimEnd()).toBe('  … 6 more')
  expect(sourceRows(research(), CITED, false, 40, 8).map(line)[1]).toBe('  ¹ docs.github.com                  200')
})

test('an agent`s fetch joins the pages marked ◇ at column 0; a failed one keeps its status in err', () => {
  let pages = noteSources([], 'WebFetch', { url: 'https://example.com/a' }, { result: { url: 'https://example.com/a', code: 200 }, text: 'ok' }, true)
  pages = noteSources(
    pages,
    'WebFetch',
    { url: 'https://example.com/b' },
    { result: 'Request failed with status code 404', isError: true, text: 'Request failed with status code 404' },
    true
  )
  pages = noteSources(pages, 'WebFetch', { url: 'https://example.com/a' }, { result: { url: 'https://example.com/a', code: 200 }, text: 'ok' })
  expect(pages).toEqual([
    { url: 'https://example.com/a', title: '', status: '200', isAgent: true },
    { url: 'https://example.com/b', title: '', status: '404', isAgent: true }
  ])

  const rows = sourceRows(pages, [], true, W, 4)
  expect(rows.slice(1).map(line)).toEqual([expect.stringMatching(/^◇ · example\.com +a +200$/), expect.stringMatching(/^◇ · example\.com +b +404$/)])
  expect(rows[2]?.at(-1)).toMatchObject({ t: '404', color: C.err, bold: true })
})

test('`u` lists each page, then its whole URL from column 4 in dim, wrapped to the pane; each page is a row that opens (A2)', () => {
  const long = `https://docs.github.com/en/actions/${'writing-workflows/'.repeat(5)}workflow-syntax`
  const pages: SourcePage[] = [
    { url: 'https://bun.sh/docs/cli/publish', title: 'bun publish', status: '200' },
    { url: long, title: 'Workflow syntax', status: '200' }
  ]
  const lines = sourceLines(pages, [], false, W, Infinity, false, 'SOURCES', true)
  const rows = lines.map(l => line(l.parts))

  // 145 characters in rows of 68: three URL rows.
  expect(lines.map(l => l.id)).toEqual([undefined, 'source:https://bun.sh/docs/cli/publish', undefined, `source:${long}`, undefined, undefined, undefined])
  expect(rows[2]).toBe(`    https://bun.sh/docs/cli/publish`.padEnd(W))
  expect(
    rows
      .slice(4)
      .map(r => r.trim())
      .join('')
  ).toBe(long)
  expect(rows.every(r => vw(r) === W)).toBe(true)
  expect(lines[2]?.parts[0]).toMatchObject({ color: C.dim })

  // Fitted (no `u`), no URL rows.
  expect(sourceLines(pages, [], false, W, 4).map(l => l.id)).toEqual([undefined, 'source:https://bun.sh/docs/cli/publish', `source:${long}`])
})
