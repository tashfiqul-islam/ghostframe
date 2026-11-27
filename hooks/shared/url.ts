import { clipMiddle, vw } from './text'

// ─── Paths and URLs as shown ─────────────────────────────────────────────────

const HOME = /^(?:[A-Za-z]:)?\/(?:Users|home)\/[^/]+(?=\/|$)/i

const norm = (x: string) => x.replace(/\\/g, '/').replace(/\/+$/, '')

/**
 * A path as shown: forward slashes only; relative inside the session's folder;
 * `~` for the home folder outside it (`~/AppData/Local/Temp/x.txt`).
 */
export function relPath(p: string, cwd: string | undefined): string {
  const a = norm(p)

  if (cwd !== undefined && cwd.length > 0) {
    const b = norm(cwd)

    if (a.toLowerCase().startsWith(`${b.toLowerCase()}/`)) return a.slice(b.length + 1)
  }

  return a.replace(HOME, '~')
}

/**
 * Whether a path as shown (`relPath`) is outside the session's folder: the home folder's `~/…`, an absolute path, or
 * one that climbs out (`../x`, `sub/../../x`). Such a file is listed, never diffed or counted (8.5).
 */
// The home folder as a path or a shell names it, at a path's start.
const HOME_VAR = /^(?:~|%USERPROFILE%|\$env:USERPROFILE|\$\{env:USERPROFILE\}|\$HOME|\$\{HOME\})(?=\/|$)/i

/** Whether a path starts at the home folder (`~/…`, `%USERPROFILE%\…`, `$HOME/…`). */
export const isAtHome = (path: string): boolean => HOME_VAR.test(path.replaceAll('\\', '/'))

export function isOffProject(shown: string): boolean {
  if (/^(?:~|[A-Za-z]:|)(?:\/|$)/.test(shown)) return true

  // `..` folded: a path that climbs above the session's folder anywhere along it (`sub/../../x`) is outside it.
  let depth = 0

  for (const part of shown.split('/')) {
    depth += part === '..' ? -1 : part === '.' || part === '' ? 0 : 1

    if (depth < 0) return true
  }

  return false
}

/**
 * Where a path is on disk, for a `$.fs` call: `~` (and `%USERPROFILE%`, `$env:USERPROFILE`, `$HOME`) is the home
 * folder, on Windows and POSIX alike; an absolute path stays; any other is from the session's folder.
 * @param path the path, as shown or as a call named it
 * @param cwd the session's folder
 * @param home the home folder, absolute
 * @returns the absolute path
 * @throws when the path is in the home folder and no home folder is known: never joined onto the session's folder
 */
export function onDisk(path: string, cwd: string, home: string | undefined): string {
  const slashed = path.replaceAll('\\', '/')
  const lead = HOME_VAR.exec(slashed)?.[0]

  if (lead !== undefined && home === undefined) throw new Error(`no home folder to expand ${lead} in ${path}`)

  const p = lead === undefined || home === undefined ? slashed : `${home.replaceAll('\\', '/').replace(/\/+$/, '')}${slashed.slice(lead.length)}`

  return /^(?:[A-Za-z]:)?\//.test(p) ? p : `${cwd.replaceAll('\\', '/').replace(/\/+$/, '')}/${p}`
}

/**
 * Clip a path in the middle at folder boundaries: keep its head (`~/AppData`, `src`)
 * and as many trailing segments as fit (`~/AppData/…/Temp/notebook-scratch.txt`).
 * Falls back to a plain middle clip when even the file name doesn't fit.
 */
export function clipPath(p: string, n: number): string {
  if (vw(p) <= n) return p

  const parts = p.split('/')
  const headCount = parts[0] === '~' || /^[A-Za-z]:$/.test(parts[0] ?? '') || parts[0] === '' ? 2 : 1

  // Keep `lead` + `…/` + as many trailing segments as fit (always the file name).
  const keepTail = (lead: string, stop: number): string | undefined => {
    let tail = parts[parts.length - 1] ?? ''

    if (vw(`${lead}…/${tail}`) > n) return undefined

    for (let i = parts.length - 2; i >= stop; i--) {
      const next = `${parts[i]}/${tail}`

      if (vw(`${lead}…/${next}`) > n) break
      tail = next
    }

    return `${lead}…/${tail}`
  }

  if (parts.length > headCount + 1) {
    const withHead = keepTail(`${parts.slice(0, headCount).join('/')}/`, headCount)

    if (withHead !== undefined) return withHead
  }

  if (parts.length > 1) {
    const bare = keepTail('', 1)

    if (bare !== undefined) return bare
  }

  return clipMiddle(p, n)
}

/**
 * A source as a footnote names it:
 * - a GitHub issue or PR → `repo#123` (`claude-code#108931`)
 * - a GitHub repo page → `owner/repo`
 * - anything else → host without `www.`, ` · `, its last meaningful path segment
 *   (`bun.com · runtime-behavior`); a bare host stays the host.
 * A trailing hash or ID on the slug is dropped (`…-f8381f2fbd79`). Only what still
 * doesn't fit is clipped, by `clipLabel`.
 */
export function sourceLabel(url: string): string {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:www\.)?([^/?#]+)([^?#]*)/i.exec(url.trim())
  const host = cleanHost(urlHost(url) ?? m?.[1] ?? url)
  const segs = (m?.[2] ?? '')
    .split('/')
    .map(x => {
      try {
        return decodeURIComponent(x)
      } catch {
        return x
      }
    })
    .map(x => x.replace(INVISIBLE, ''))
    .filter(x => x.length > 0)

  if (host === 'github.com' && segs.length >= 2) {
    const [, repo, kind, n] = segs

    if ((kind === 'issues' || kind === 'pull') && n !== undefined && /^\d+$/.test(n)) return `${repo}#${n}`
    if (segs.length === 2) return `${segs[0]}/${repo}`
  }

  const meaningful = segs.map(x => x.replace(/\.(html?|md|php|aspx?)$/i, '')).filter(x => x.length > 0 && !/^(index|default)$/i.test(x))
  const last = meaningful[meaningful.length - 1]

  return last === undefined ? host : `${host} · ${dropId(last)}`
}

// Control and format characters (U+202E and the like) would reorder or hide a label.
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu

/**
 * A host as a label shows it, whichever path read it: no invisible characters, no
 * `user@` (the last `@` wins, as in the URL parser), no `www.`, lower case.
 */
const cleanHost = (host: string) =>
  host
    .replace(INVISIBLE, '')
    .replace(/^.*@/, '')
    .replace(/^www\./i, '')
    .toLowerCase()

/** The host the URL parser reads (no `user@`, keeps a port), without `www.`; not a URL → undefined. */
export function urlHost(url: string): string | undefined {
  try {
    const { host } = new URL(url.trim())

    return host.length > 0 ? host.replace(/^www\./, '') : undefined
  } catch {
    return undefined // not an absolute URL (`bun.sh/x`): the pattern reads it
  }
}

// A slug's trailing hash or ID: a final `-`/`_` chunk of 8+ hex characters or digits, with
// at least one digit (so an English word made of a–f letters stays).
const TRAILING_ID = /[-_](?=[0-9a-f]*\d)[0-9a-f]{8,}$/i

/** `bun-1-4-is-it-ready-f8381f2fbd79` → `bun-1-4-is-it-ready`; a slug that is all ID stays. */
const dropId = (slug: string) => {
  const t = slug.replace(TRAILING_ID, '')

  return t.length > 0 ? t : slug
}

/** `https://localhost:5173/products?page=6` → [`localhost:5173`, `/products?page=6`]. */
export function splitUrl(url: string): [string, string] {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#]*)(.*)$/i.exec(url.trim())

  return [m?.[1] ?? url, m?.[2] ?? '']
}
