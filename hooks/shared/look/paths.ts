// The one path formatter (spec 13.2, 5.4): forward slashes, project-relative inside the project, `~/` under the home
// folder outside it, absolute otherwise; and the cut from the middle that keeps the file name (13.5).
import { widthOf } from './width'

const slashes = (p: string) => p.replace(/\\/g, '/')
const trimEnd = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)
// A home folder in a path: `C:/Users/<name>`, `/Users/<name>`, `/home/<name>`.
const HOME = /^(?:[A-Za-z]:)?\/(?:Users|home)\/[^/]+(?=\/|$)/i

/** Whether `p` is `root` or inside it; Windows drive paths compare without case. */
function within(p: string, root: string): boolean {
  const isDrive = /^[A-Za-z]:/.test(root)
  const a = isDrive ? p.toLowerCase() : p
  const b = isDrive ? root.toLowerCase() : root

  return a === b || a.startsWith(`${b}/`)
}

/** Where a path is shown from: the project root and, when known, the home folder. */
export type PathRoots = { project?: string | undefined; home?: string | undefined }

/**
 * A path as Cockpit shows it (13.2). A `~/…` path keeps its `~` and is never read against the project; a project path
 * never gets one, even when the project is under the home folder. A worktree beside the project
 * (`D:\Projects\ghostframe-v8`) is not inside it.
 * @param p the path as the tool gave it
 * @param roots the project root and the home folder
 * @returns the path to show, before any cut
 */
export function showPath(p: string, roots: PathRoots = {}): string {
  const a = trimEnd(slashes(p.trim()))

  if (a === '~' || a.startsWith('~/')) return a
  // Relative already: project-relative, without a leading `./`.
  if (!/^(?:[A-Za-z]:)?\//.test(a)) return a.replace(/^(?:\.\/)+/, '')

  const project = roots.project === undefined || roots.project.length === 0 ? undefined : trimEnd(slashes(roots.project))

  if (project !== undefined && within(a, project)) return a.length === project.length ? '.' : a.slice(project.length + 1)

  const home = roots.home === undefined || roots.home.length === 0 ? undefined : trimEnd(slashes(roots.home))

  if (home !== undefined) return within(a, home) ? `~${a.slice(home.length)}` : a

  return a.replace(HOME, '~')
}

/** The folder of a shown path, with its last `/`, and its file name, for drawing them in two colours (5.4). */
export function splitPath(p: string): { folder: string; file: string } {
  const at = p.lastIndexOf('/')

  return at < 0 ? { folder: '', file: p } : { folder: p.slice(0, at + 1), file: p.slice(at + 1) }
}

/** The head of `s` that fits `n` cells, cut hard. */
function headOf(s: string, n: number): string {
  let out = ''
  let w = 0

  for (const ch of s) {
    const cw = widthOf(ch)

    if (w + cw > n) break
    out += ch
    w += cw
  }

  return out
}

/** The tail of `s` that fits `n` cells, cut hard. */
function tailOf(s: string, n: number): string {
  const chars = Array.from(s)
  let out = ''
  let w = 0

  for (let i = chars.length - 1; i >= 0; i--) {
    const cw = widthOf(chars[i] ?? '')

    if (w + cw > n) break
    out = (chars[i] ?? '') + out
    w += cw
  }

  return out
}

/** A plain cut from the middle: as much of each end as fits around one `…`. */
function middle(s: string, n: number): string {
  if (n <= 1) return n === 1 ? '…' : ''

  const tail = Math.ceil((n - 1) / 2)

  return `${headOf(s, n - 1 - tail)}…${tailOf(s, tail)}`
}

/**
 * Keeps `first` and `last`, with `…` between, and as much of what lies between them as fits next to `last`.
 * @returns the cut, or undefined when even `first…last` does not fit
 */
function keepEnds(first: string, between: readonly string[], last: string, sep: string, n: number): string | undefined {
  let tail = last

  if (widthOf(`${first}${sep}…${sep}${tail}`) > n) return undefined

  for (let i = between.length - 1; i >= 0; i--) {
    const next = `${between[i] ?? ''}${sep}${tail}`

    if (widthOf(`${first}${sep}…${sep}${next}`) > n) break
    tail = next
  }

  return `${first}${sep}…${sep}${tail}`
}

/**
 * A path cut from the middle (13.5): its first segment and its file name stay, `hooks/…/width.test.tsx`.
 * @param p the shown path
 * @param n the cells it may take
 * @returns the path, at most `n` cells
 */
export function cutPath(p: string, n: number): string {
  if (widthOf(p) <= n) return p

  const parts = p.split('/')
  const file = parts.at(-1) ?? p

  if (parts.length >= 3) {
    // A root (`~`, `D:`, ``) and the folder after it count as the first segment.
    const lead = parts[0] === '~' || parts[0] === '' || /^[A-Za-z]:$/.test(parts[0] ?? '') ? 2 : 1
    const first = parts.slice(0, lead).join('/')
    const kept = parts.length > lead + 1 ? keepEnds(first, parts.slice(lead, -1), file, '/', n) : undefined

    if (kept !== undefined) return kept
  }

  return widthOf(`…/${file}`) <= n && parts.length > 1 ? `…/${file}` : middle(p, n)
}

/**
 * A URL cut from the middle (13.5): the host and the last segment stay, `docs.github.com/…/setup-bun`.
 * @param url the URL, with or without its scheme
 * @param n the cells it may take
 * @returns the URL, at most `n` cells
 */
export function cutUrl(url: string, n: number): string {
  if (widthOf(url) <= n) return url

  const m = /^([a-z][a-z0-9+.-]*:\/\/)?([^/]*)(\/.*)?$/i.exec(url)
  const host = `${m?.[1] ?? ''}${m?.[2] ?? url}`
  const segs = (m?.[3] ?? '').split('/').filter(s => s.length > 0)
  const last = segs.at(-1)

  if (last !== undefined && segs.length > 1) {
    const kept = keepEnds(host, segs.slice(0, -1), last, '/', n)

    if (kept !== undefined) return kept
  }

  return middle(url, n)
}

/**
 * A command cut from the middle (13.5): the program, its subcommand and the last argument stay,
 * `bun test … hooks/width`.
 * @param cmd the command, its `cd` prefix stripped
 * @param n the cells it may take
 * @returns the command, at most `n` cells
 */
export function cutCommand(cmd: string, n: number): string {
  if (widthOf(cmd) <= n) return cmd

  const words = cmd.split(/\s+/).filter(w => w.length > 0)
  const lead = words.length > 2 && !(words[1] ?? '').startsWith('-') ? 2 : 1

  if (words.length > lead + 1) {
    const kept = keepEnds(words.slice(0, lead).join(' '), words.slice(lead, -1), words.at(-1) ?? '', ' ', n)

    if (kept !== undefined) return kept
  }

  return middle(cmd, n)
}

/**
 * A title cut at its end (13.5, the one case): its start says what it is, `browser · read the tab s…`.
 * @param t the title
 * @param n the cells it may take
 * @returns the title, at most `n` cells
 */
export function cutTitle(t: string, n: number): string {
  if (widthOf(t) <= n) return t
  if (n <= 1) return n === 1 ? '…' : ''

  return `${headOf(t, n - 1)}…`
}
