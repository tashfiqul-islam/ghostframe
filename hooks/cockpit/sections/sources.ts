// Cockpit's `[ SOURCES ]` (spec E.43): every page the turn read, its host, a short title and its HTTP status, the
// answer's footnote mark on a cited one, and the section's rows. Pure: hooks/cockpit/work.ts keeps the pages and
// hooks/cockpit/fit.ts fits the rows.
import type { SourcePage } from '../../../types'
import { num, obj, s } from '../../shared/calls/fields'
import { fitParts } from '../../shared/parts'
import type { Part } from '../../shared/parts'
import { sup, vw } from '../../shared/text'
import { C } from '../../shared/tokens'
import { sourceLabel } from '../../shared/url'
import { partsOf, plain } from '../line'
import type { Line } from '../line'
import { sectionLabel } from '../steps/rows'

/** A URL as the pane and the answer both know it: no `www.`, no hash, no trailing slash, the host in lower case. */
export function sameUrl(url: string): string {
  try {
    const u = new URL(url)

    return `${u.host.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`
  } catch {
    return url.trim().replace(/\/+$/, '')
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return sourceLabel(url)
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

/** A page's title, or a short label from its URL, without its host (the row shows the host already). */
function titleOf(p: SourcePage): string {
  const said = p.title.length > 0 ? p.title : sourceLabel(p.url)
  const host = hostOf(p.url)

  return said.startsWith(host) ? said.slice(host.length).replace(/^\s*·\s*/, '') : said
}

const isOk = (status: string) => status.length === 0 || /^2\d\d$/.test(status)

/** The pages as drawn: while the turn runs, in fetch order, none marked; once it ends, cited first in mark order. */
function ordered(pages: readonly SourcePage[], cited: readonly { url: string; title: string }[], isRunning: boolean) {
  const all = [...pages, ...cited.filter(c => !pages.some(p => sameUrl(p.url) === sameUrl(c.url))).map(c => ({ url: c.url, title: c.title, status: '' }))]
  const citeOf = (p: SourcePage) => cited.findIndex(c => sameUrl(c.url) === sameUrl(p.url))
  // A cited page is titled as the answer links it.
  const titled = (p: SourcePage) => ({ ...p, title: cited[citeOf(p)]?.title ?? p.title })
  const rows = all.map(p => ({ page: titled(p), mark: isRunning ? 0 : citeOf(p) + 1 }))

  return isRunning ? rows : [...rows.filter(r => r.mark > 0).toSorted((a, b) => a.mark - b.mark), ...rows.filter(r => r.mark === 0)]
}

/** One page's row, exactly `width` cells: the mark (or `·`), the host, the title (wide panes), the status. */
function pageRow(page: SourcePage, mark: number, title: string, width: number): Part[] {
  const status = page.status
  const right: Part = isOk(status) ? { t: status, color: C.dim } : { t: status, color: C.err, bold: true }
  const left: Part[] = [
    { t: page.isAgent === true ? '◇ ' : '  ', color: C.dim },
    mark > 0 ? { t: sup(mark), color: C.link } : { t: '·', color: C.dim },
    { t: ' ', color: C.muted },
    { t: hostOf(page.url), color: C.web },
    ...(width >= 56 && title.length > 0 ? [{ t: `  ${title}`, color: C.text }] : [])
  ]

  return [...fitParts(left, width - vw(status) - 1), { t: ' ', color: C.muted }, right]
}

/**
 * `[ SOURCES ]`: the label, `N read · M cited`, then a row per page up to `cap`; past it, `cap − 1` rows and
 * `… n more`. A failed fetch keeps its status, in err.
 * @param pages the pages read, in fetch order
 * @param cited the answer's cited pages, in mark order
 * @param isRunning whether the turn runs (no marks, fetch order) or has ended (cited first)
 * @param width the pane's body columns
 * @param cap the rows (3, or 4 in a tall pane)
 * @param isLabel only the label fits
 * @param title the label (`SOURCES · TURN n` for a pinned turn)
 * @returns one Part list per row; none when the turn read no page
 */
export function sourceRows(
  pages: readonly SourcePage[],
  cited: readonly { url: string; title: string }[],
  isRunning: boolean,
  width: number,
  cap: number,
  isLabel = false,
  title = 'SOURCES'
): Part[][] {
  return partsOf(sourceLines(pages, cited, isRunning, width, cap, isLabel, title))
}

const URL_INDENT = 4

/** A page's whole URL under its row (`u`), in dim from column 4, cut into rows of the pane's width. */
function urlRows(url: string, width: number): Line[] {
  const room = Math.max(1, width - URL_INDENT)
  const chars = [...url]
  const rows: Line[] = []

  for (let at = 0; at < chars.length; at += room) {
    const t = ' '.repeat(URL_INDENT) + chars.slice(at, at + room).join('')
    rows.push(plain([{ t: t + ' '.repeat(Math.max(0, width - vw(t))), color: C.dim }]))
  }

  return rows
}

/**
 * `[ SOURCES ]` as `sourceRows` draws it, each page's row under its id (`source:<url>`) so Enter and `c` copy its URL
 * (A2: no key opens a browser). Shown whole (`u`), each page's whole URL follows its row.
 * @param pages the pages read, in fetch order
 * @param cited the answer's cited pages, in mark order
 * @param isRunning whether the turn runs
 * @param width the pane's body columns
 * @param cap the rows; `Infinity` for every page (`u`)
 * @param isLabel only the label fits
 * @param title the label
 * @param withUrls whether each page's URL follows it (`u`)
 * @returns the rows
 */
export function sourceLines(
  pages: readonly SourcePage[],
  cited: readonly { url: string; title: string }[],
  isRunning: boolean,
  width: number,
  cap: number,
  isLabel = false,
  title = 'SOURCES',
  withUrls = false
): Line[] {
  const rows = ordered(pages, cited, isRunning)

  if (rows.length === 0) return []

  // Marks come with the answer, once the turn ends: until then nothing is counted as cited.
  const citedCount = rows.filter(r => r.mark > 0).length
  const label = plain(sectionLabel(title, [{ t: `${rows.length} read · ${citedCount} cited`, color: C.muted }], width))

  if (isLabel) return [label]

  const draw = (r: (typeof rows)[number]): Line[] => [
    { parts: pageRow(r.page, r.mark, titleOf(r.page), width), id: `source:${r.page.url}` },
    ...(withUrls ? urlRows(r.page.url, width) : [])
  ]

  if (rows.length <= cap) return [label, ...rows.flatMap(draw)]

  const more = `  … ${rows.length - (cap - 1)} more`

  return [label, ...rows.slice(0, cap - 1).flatMap(draw), plain([{ t: more + ' '.repeat(Math.max(0, width - vw(more))), color: C.dim }])]
}
