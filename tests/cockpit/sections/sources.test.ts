import { expect, test } from 'claude-code/testing'

import { noteSources } from '../../../hooks/cockpit/sections/sources'
import type { SourcePage } from '../../../types'

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

test('a research turn with 8 pages and 1 failed fetch: kept in fetch order, the 404 with its status', () => {
  expect(research().map(p => [p.url, p.status])).toEqual(URLS.map((url, i) => [url, i === 7 ? '404' : '200']))
})

test('an agent`s fetch joins the pages marked as the agent`s; a failed one keeps its status; a page read again keeps its place', () => {
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
})
