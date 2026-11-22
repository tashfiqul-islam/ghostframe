// The pages a turn read (spec E.43; v8 8.8): each with its title and HTTP status, in order of first read. Pure:
// hooks/cockpit/work.ts keeps the pages and hooks/cockpit/v8/views.ts draws them.
import type { SourcePage } from '../../../types'
import { num, obj, s } from '../../shared/calls/fields'

/** A URL as the pane and the answer both know it: no `www.`, no hash, no trailing slash, the host in lower case. */
export function sameUrl(url: string): string {
  try {
    const u = new URL(url)

    return `${u.host.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`
  } catch {
    return url.trim().replace(/\/+$/, '')
  }
}

/** Adds a page, or settles one fetched again: a page keeps its row; a later status or title replaces an empty one. */
function add(pages: readonly SourcePage[], page: SourcePage): SourcePage[] {
  const at = pages.findIndex(p => sameUrl(p.url) === sameUrl(page.url))
  const had = pages[at]

  if (had === undefined) return [...pages, page]

  const by = had.isAgent === true || page.isAgent === true ? { isAgent: true as const } : {}

  return pages.with(at, { ...had, status: page.status.length > 0 ? page.status : had.status, title: had.title.length > 0 ? had.title : page.title, ...by })
}

/**
 * A web call ended: the pages it leaves. A fetch adds its page with its status (an error's code, or `failed`); a
 * search adds nothing, but its results name the pages it found, which titles a page already read.
 * @param pages the pages before the call
 * @param tool the call's tool
 * @param input the call's input
 * @param outcome what the call came back with
 * @param isAgent whether the call was an agent's own (its page is marked `◇`)
 * @returns the pages after it
 */
export function noteSources(
  pages: readonly SourcePage[],
  tool: string,
  input: unknown,
  outcome: { result?: unknown; text?: string | undefined; isError?: true | undefined },
  isAgent = false
): SourcePage[] {
  const o = obj(outcome.result)

  if (tool === 'WebFetch') {
    const url = s(o?.['url']) ?? s(obj(input)?.['url'])

    if (url === undefined) return [...pages]

    const code = num(o?.['code'])
    const said = /\b([1-5]\d\d)\b/.exec(outcome.text ?? '')?.[1]
    const status = code !== undefined ? String(code) : outcome.isError === true ? (said ?? 'failed') : ''

    return add(pages, { url, title: '', status, ...(isAgent ? { isAgent: true as const } : {}) })
  }

  if (tool === 'WebSearch') {
    const found = (Array.isArray(o?.['results']) ? o['results'] : []).flatMap(r => {
      const content: unknown = obj(r)?.['content']

      return Array.isArray(content) ? content : []
    })

    return pages.map(p => {
      const hit = found.find(f => sameUrl(s(obj(f)?.['url']) ?? '') === sameUrl(p.url))
      const title = s(obj(hit)?.['title'])

      return p.title.length === 0 && title !== undefined ? { ...p, title } : p
    })
  }

  return [...pages]
}
