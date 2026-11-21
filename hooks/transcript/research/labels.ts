import { clipMiddle, vw } from '../../shared/text'
import { sourceLabel } from '../../shared/url'
import type { Cite } from './cites'

const SLUG_LABEL = /^(.+?) · (.+)$/

/**
 * The longest head of a `host · slug` label that fits `n` cells, no ellipsis: the host
 * whole, the slug cut at its last hyphen or underscore (a hard cut when it has none in
 * reach), no separator left at the end. Any other label → undefined.
 */
function cutSlug(label: string, n: number): string | undefined {
  const m = SLUG_LABEL.exec(label)

  if (m === null) return undefined

  const head = `${m[1]} · `
  const room = n - vw(head)

  if (room < 3) return undefined

  let slug = ''

  for (const ch of m[2] ?? '') {
    if (vw(slug + ch) > room) break
    slug += ch
  }

  const rest = (m[2] ?? '').slice(slug.length)

  if (rest.length > 0 && !/^[-_]/.test(rest)) {
    const at = Math.max(slug.lastIndexOf('-'), slug.lastIndexOf('_'))

    if (at > 0) slug = slug.slice(0, at)
  }

  slug = slug.replace(/[-_.]+$/, '')

  return slug.length > 0 ? head + slug : undefined
}

/** A URL label's head for a clipped run (tables): see `cutSlug`; other labels cut hard. */
export function cutLabel(label: string, n: number): string {
  const slug = cutSlug(label, n)

  if (slug !== undefined) return slug

  let out = ''

  for (const ch of label) {
    if (vw(out + ch) > n) break
    out += ch
  }

  return out
}

/**
 * A URL label at `n` cells (§0.2 URLs): `host · slug` keeps its host and clips the slug at
 * the end, at a word boundary, then `…`. `repo#123`, `owner/repo` and a bare host (or a host
 * too wide for any slug) clip in the middle, so the issue number or the host's end stays.
 */
export function clipLabel(label: string, n: number): string {
  if (vw(label) <= n) return label

  const slug = cutSlug(label, n - 1)

  return slug === undefined ? clipMiddle(label, n) : `${slug}…`
}

// Titles that name the kind of page, not the page: they get the URL's last part beside them.
const GENERIC_TITLE = /^(post|page|here|link|docs|release notes|article|blog|source)$/i

/**
 * A source's title as a list shows it: a generic title (`post`, `docs`, the bare host…) or
 * one used by another source in the same list → `<title> · <last part of its URL label>`
 * (`post · bun-v1.4.4`). A unique, specific title is unchanged.
 */
export function sourceTitle(c: Cite, all: readonly Cite[]): string {
  return titled(c, all.filter(x => titleKey(x.title) === titleKey(c.title)).length > 1)
}

/** Every source's list title, in order: `sourceTitle` for each, the titles counted once. */
export function sourceTitles(all: readonly Cite[]): string[] {
  const counts = all.reduce((m, x) => m.set(titleKey(x.title), (m.get(titleKey(x.title)) ?? 0) + 1), new Map<string, number>())

  return all.map(c => titled(c, (counts.get(titleKey(c.title)) ?? 0) > 1))
}

const titleKey = (title: string) => title.trim().toLowerCase()

/** `c`'s list title; `repeated`: another source in the list has the same title. */
function titled(c: Cite, repeated: boolean): string {
  const title = c.title.trim()
  const key = title.toLowerCase()
  const label = sourceLabel(c.url)
  const host = label.split(' · ')[0] ?? label
  const short = label.split(' · ').pop() ?? label
  const generic = GENERIC_TITLE.test(title) || key.replace(/^www\./, '') === host.toLowerCase()

  return (generic || repeated) && short.toLowerCase() !== key ? `${title} · ${short}` : title
}
