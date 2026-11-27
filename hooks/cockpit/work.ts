// What a typed turn worked on, for `[ TODO ]`, `[ FILES ]` and `[ SOURCES ]` (spec E.41 to E.43), kept in $.state.
// hooks/cockpit/log.ts calls these as the main loop's calls end and its turns start.
import { noticeSink } from './switch'
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { FileChange, TurnRecord, TurnWork } from '../../types'
import { filesFromCommand, filesFromDiff, noteFiles } from './sections/files'
import type { Counted } from './sections/files'
import { isAtHome, onDisk } from '../shared/url'
import { noteSources, sameUrl } from './sections/sources'
import type { SourcePage } from '../../types'
import { noteTodo, startTodo } from './sections/todo'
import type { Outcome } from './steps/log'
import { remember } from '../shared/held'

const EMPTY: TurnWork = { todo: [], isRevised: false, files: [], sources: [], cited: [] }

// The current (or last) typed turn's work. Change the tag when its fields change.
const work = atom({ plugin: 'ghostframe', key: 'work' } as const, EMPTY, { shape: 'work-1' })

const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

// What changed on disk outside Write and Edit (a shell's `printf >> f`, a formatter) is read from Git: the working
// tree against HEAD (`git diff --numstat -z HEAD`, and `git ls-files --others` for new files, their lines counted once) at
// the typed turn's start and after each call that can change files, a shell step's rows being what moved between the
// two. The engine's `$.vcs.diff` answers `unknown` unless another plugin implements it, so Git is run directly.
// Before its first commit Git has seen nothing: every file it lists, staged or not, is new. Outside a Git work tree,
// the files a shell command names as write targets.
// shortcut: the work tree and the last diff live in the module; a reload forgets them, and the next shell step then
// starts from a fresh diff, listing nothing it changed before. Move them to $.state if that matters.
/** A Git work tree as the session sees it: its root, the session's folder spelled the same way, and Git's path between. */
type Tree = { root: string; here: string; prefix: string }
/**
 * The session's Git work tree: unknown until asked, null where there is none (or it cannot be read). `root` and
 * `here` share one spelling, so a file's path from the root is placed against the session's folder; `prefix` is that
 * folder from the root as Git says it (`app/`, or empty).
 */
let copy: Tree | null | undefined
/** The session's folder, as the last turn or call gave it: where a file's diff is read (`workDiff`). */
let lastCwd: string | undefined
/** The work tree's diff after the last call that could change files. */
let lastDiff: Counted[] | undefined
/** The work tree's diff at the typed turn's start: what was changed before the turn. */
let startDiff: Diff | undefined
/** A diff: the work tree, its changed and new files, and how many new files the listing left out (`many`: not known). */
type Diff = Tree & { files: Counted[]; more: number | 'many' }

/** A path with forward slashes and no trailing one; Windows' long forms (`\\?\D:\…`, `\\?\UNC\host\…`) as plain ones. */
const slashed = (path: string): string =>
  path
    .replace(/^\\\\\?\\UNC\\/i, '\\\\')
    .replace(/^\\\\\?\\/, '')
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')

/** A folder as a command's `cwd` takes it: a drive's or the filesystem's root keeps its slash (`C:/`, `/`). */
const asFolder = (path: string): string => (path.length === 0 || /^[A-Za-z]:$/.test(path) ? `${path}/` : path)

/**
 * Whether the session's disk ignores case in a path: Windows' and macOS's do. Linux and WSL compare exactly, and so
 * does a platform not known: a path that differs only in case is then another one, outside, never read.
 * @param $ the engine interface
 * @returns true on Windows and macOS
 */
export async function ignoresCase($: EngineInterface): Promise<boolean> {
  try {
    const { platform } = await $.session.info()

    return platform === 'windows' || platform === 'macos'
  } catch {
    return false // a platform that cannot be read is not known: exact, the side that reads nothing it should not
  }
}

/** A path as it is compared: slashes and long forms aside, its case kept where the disk keeps it. */
const compared = (path: string, isCaseless: boolean): string => (isCaseless ? slashed(path).toLowerCase() : slashed(path))

/** Whether a real path is the path Git names, slashes and long forms aside, and case where the disk ignores it. */
const isSame = (real: string | null | undefined, path: string, isCaseless: boolean): boolean =>
  real !== undefined && real !== null && compared(real, isCaseless) === compared(path, isCaseless)

/** The session's folder, as the last turn or call gave it. */
export const cwdNow = (): string | undefined => lastCwd

/**
 * Whether a file had changes from before the turn, as Git saw the work tree at the typed turn's start.
 * @param path the file, from the session's folder
 * @returns true or false; undefined where there is no Git work tree to say
 */
export function wasChangedBefore(path: string): boolean | undefined {
  if (startDiff === undefined) return undefined

  const fromRoot = `${startDiff.prefix}${path}`

  return startDiff.files.some(f => f.path === fromRoot)
}

// A big untracked folder (a cache, node_modules before its .gitignore, build output) lists tens of thousands of files,
// and every listed file would cost a FILES row, a link check and a read. So a listing keeps the first 2,000 and counts
// the rest (`+n more untracked`); a diff reads at most 50 new files to count their lines, 8 at a time, checks only
// those for links out of the project, never reads a file over 1 MB, and counts a file with a NUL byte (binary) as 0.
const UNTRACKED_MAX = 2_000
const COUNT_BYTES_MAX = 1_048_576 // a new file larger than this is listed and never read: its lines are not counted
const RECOUNT_MAX = 50 // the most new files one diff reads to count their lines; the rest are listed without a count
const AT_ONCE = 8 // link checks and reads in flight at once
const GIT_TIMEOUT_MS = 5_000 // a git call that takes longer is given up: FILES falls back to the commands' targets
const COUNTS_MAX = 5_000 // new files whose counts are kept between diffs

/** A new file's lines as last read, with the size and modified time it had then: unchanged, it is not read again. */
type Count = { size: number; mtimeMs: number; lines: number }
const counts = new Map<string, Count>()
/** The last listing of new files: the paths it kept and how many it left out. An Edit reuses it: it adds no file. */
let listed: { paths: string[]; more: number | 'many' } | undefined

/**
 * The records of `git diff --numstat -z`: `added TAB removed TAB path NUL`, each path as it is (no quotes, no escapes);
 * a rename's path field is empty and its old and new paths follow, each ended by NUL. A binary file's `-` counts as 0.
 */
function numstat(text: string): Counted[] {
  const fields = text.split('\0')
  const files: Counted[] = []

  for (let i = 0; i < fields.length; i++) {
    const [added, removed, ...rest] = (fields[i] ?? '').split('\t')
    let path = rest.join('\t')

    if (rest.length > 0 && path.length === 0) {
      i += 2 // a rename: the new path is the second field after it
      path = fields[i] ?? ''
    }

    if (path.length > 0) files.push({ path, added: Number(added) || 0, removed: Number(removed) || 0, isUntracked: false })
  }

  return files
}

/**
 * A text's lines; 0 for an empty text or one with a NUL byte (a binary file).
 * @param text the file's content
 * @returns its lines
 */
export function linesOf(text: string): number {
  if (text.length === 0 || text.includes('\0')) return 0

  return text.replace(/\n+$/, '').split('\n').length
}

/**
 * The new files a listing keeps: the first 2,000 under the session's folder, from git's `-z` output, and how many it
 * leaves out (`many` when git's output was cut, so the total is not known).
 * @param stdout `git ls-files --others -z`'s output
 * @param prefix the session's folder from the root
 * @param isCut whether the output was cut short
 * @returns the paths and the count left out
 */
export function untrackedIn(stdout: string, prefix: string, isCut: boolean): { paths: string[]; more: number | 'many' } {
  const paths: string[] = []
  let more = 0

  for (let from = 0, end = stdout.indexOf('\0'); end >= 0; from = end + 1, end = stdout.indexOf('\0', from)) {
    const path = stdout.slice(from, end)

    if (path.length === 0 || !path.startsWith(prefix)) continue
    if (paths.length < UNTRACKED_MAX) paths.push(path)
    else more++
  }

  return { paths, more: isCut ? 'many' : more }
}

/**
 * Runs `run` on each path, at most `n` at once.
 * @param paths the paths
 * @param n how many at once
 * @param run what to do with one
 * @returns each path with its result
 */
async function atMost<R>(paths: readonly string[], n: number, run: (path: string) => Promise<R>): Promise<Map<string, R>> {
  const out = new Map<string, R>()
  let next = 0
  // Each worker takes the next path when its last one is done.
  const worker = async (): Promise<void> => {
    const path = paths[next++]

    if (path === undefined) return
    out.set(path, await run(path))

    return worker()
  }

  await Promise.all(Array.from({ length: Math.min(n, paths.length) }, worker))

  return out
}

/**
 * A git command in the work tree, given up after 5 s: a hung git (a lock, a network drive) never holds the session.
 * @param $ the engine interface
 * @param args git's arguments
 * @param cwd where it runs
 * @returns what it printed
 */
async function git($: EngineInterface, args: readonly string[], cwd: string): Promise<Awaited<ReturnType<EngineInterface['process']['run']>>> {
  const ran = $.process.run(['git', ...args], { cwd, timeoutMs: GIT_TIMEOUT_MS })
  // The engine kills a child past its timeout; this also gives up on a call that never comes back. A timer, not a
  // `$.clock.sleep`: a sleep is the hook's own time, and one left running would charge the hook's budget for it.
  let timer: { cancel: () => void } | undefined
  const late = new Promise<never>((_, reject) => {
    timer = $.clock.after(GIT_TIMEOUT_MS, () => reject(new Error(`git ${args.join(' ')} timed out after ${GIT_TIMEOUT_MS} ms`)))
  })

  try {
    return await Promise.race([ran, late])
  } finally {
    timer?.cancel()
  }
}

/**
 * A new file's lines, read only when its size and time moved since it was last counted, never past 1 MB, and never
 * through a link out of the project (SEC-T3).
 * @param $ the engine interface
 * @param tree the work tree
 * @param path the file, from the root
 * @param caseless whether the disk ignores case
 * @returns its lines, or 0 when it is not counted
 */
async function countOf($: EngineInterface, tree: Tree, path: string, caseless: boolean): Promise<number> {
  try {
    if (await landsOutside($, path.slice(tree.prefix.length), tree.here, caseless)) return 0

    const file = `${tree.root.replace(/\/$/, '')}/${path}`
    const { size, mtimeMs } = await $.fs.stat(file)
    const had = counts.get(path)

    if (had !== undefined && had.size === size && had.mtimeMs === mtimeMs) return had.lines

    const lines = size > COUNT_BYTES_MAX ? 0 : linesOf(await $.fs.read(file))
    remember(counts, path, { size, mtimeMs, lines }, COUNTS_MAX)

    return lines
  } catch {
    return 0 // a file that cannot be read (locked, gone) keeps its row without a count
  }
}

/**
 * The work tree's diff against HEAD now, with its new files: listed again, or for a call that adds no file (an Edit),
 * the last listing's.
 * @param $ the engine interface
 * @param cwd the session's folder
 * @param isRelisted whether to list the new files again
 * @returns its root and files, or undefined where there is no Git work tree to read
 */
async function diffNow($: EngineInterface, cwd: string | undefined, isRelisted = true): Promise<Diff | undefined> {
  if (cwd === undefined || copy === null) return undefined

  try {
    const caseless = await ignoresCase($)

    if (copy === undefined) {
      const top = await git($, ['rev-parse', '--show-toplevel'], cwd)

      if (top.exitCode === 0 && top.stdout.trim().length > 0) {
        // Git names the root with every link resolved (macOS `/tmp`, a Windows junction), where the session's folder
        // may keep its link. Where that folder ends with Git's path down to it, and the folder less that path lands
        // at Git's root (a link to the root, or above it), the root is spelled from the folder. Else (a link below
        // the root, or one named as its target: `~/app` to `/repo/app`) the folder's real path stands for it, beside
        // Git's root, and the two must agree.
        const at = await git($, ['rev-parse', '--show-prefix'], cwd)

        if (at.exitCode !== 0) throw new Error(at.stderr.trim())

        const prefix = at.stdout.trim()
        const down = prefix.replace(/\/+$/, '')
        const gitRoot = slashed(top.stdout.trim())
        const here = slashed(cwd)
        const isBelow = down.length === 0 || compared(here, caseless).endsWith(`/${compared(down, caseless)}`)
        const derived = isBelow ? here.slice(0, here.length - (down.length === 0 ? 0 : down.length + 1)) : undefined

        if (derived !== undefined && isSame(await realPath($, asFolder(derived)), gitRoot, caseless)) {
          copy = { root: asFolder(derived), here: asFolder(here), prefix }
        } else {
          const real = await realPath($, cwd)
          const wanted = down.length === 0 ? gitRoot : `${gitRoot}/${down}`

          if (real === undefined || real === null) throw new Error(`cannot resolve the session's folder ${cwd}`)
          if (!isSame(real, wanted, caseless)) throw new Error(`the session's folder ${real} is not ${down} under Git's root ${gitRoot}`)

          copy = { root: asFolder(gitRoot), here: asFolder(wanted), prefix }
        }
      } else copy = null
    }

    if (copy === null) return undefined

    const tree = copy
    const { root, here, prefix } = tree
    // No commit yet (asked again until there is one): nothing to diff against, so no tracked rows, and the index's
    // files count as new beside the untracked ones.
    const hasHead = (await git($, ['rev-parse', '--verify', '--quiet', 'HEAD'], root)).exitCode === 0
    const tracked = hasHead ? await git($, ['diff', '--numstat', '-z', '--no-renames', 'HEAD', '--'], root) : { exitCode: 0, stdout: '', stderr: '' }

    if (tracked.exitCode !== 0) throw new Error(tracked.stderr.trim())

    if (isRelisted || listed === undefined) {
      const others = await git($, ['ls-files', ...(hasHead ? [] : ['--cached']), '--others', '--exclude-standard', '-z'], root)

      if (others.exitCode !== 0) throw new Error(others.stderr.trim())

      // Git lists the whole work tree's new files: only the session's folder's are kept (a session in a repo's
      // subfolder, a dotfiles repo at the home folder).
      listed = untrackedIn(others.stdout, prefix, others.isStdoutTruncated)
    }

    const { paths, more } = listed
    // The files to count: every one while there are few (an append to one counts), else the ones not counted yet.
    const toCount = new Set((paths.length <= RECOUNT_MAX ? paths : paths.filter(p => !counts.has(p))).slice(0, RECOUNT_MAX))
    const counted = await atMost([...toCount], AT_ONCE, async path => countOf($, tree, path, caseless))
    const untracked = paths.map(path => ({ path, added: counted.get(path) ?? counts.get(path)?.lines ?? 0, removed: 0, isUntracked: true }))

    return { root, here, prefix, files: [...numstat(tracked.stdout), ...untracked], more }
  } catch (error: unknown) {
    copy = null
    $.ui.log(`cockpit: git work tree unreadable, [ FILES ] falls back to command targets: ${String(error)}`, noticeSink())

    return undefined
  }
}

/**
 * What a shell step changed on disk: the working copy's movement since the last diff and its targets outside the
 * project, else the command's targets.
 * @param $ the engine interface
 * @param command the shell command
 * @param cwd the session's folder
 * @returns how it changes the files list, applied when the list is written
 */
async function shellFiles(
  $: EngineInterface,
  command: string,
  cwd: string | undefined,
  isAgent: boolean
): Promise<{ apply: (files: readonly FileChange[]) => FileChange[]; more: number | 'many' | undefined }> {
  const before = lastDiff
  const now = await diffNow($, cwd)
  lastDiff = now?.files
  // The new files past the listing, since the turn's start: FILES counts them in one row.
  const was = startDiff?.more ?? 0
  const more = now === undefined ? undefined : now.more === 'many' || was === 'many' ? now.more : Math.max(0, now.more - was)

  // shortcut: a shell step is credited with every change since the last diff, so an agent's shell running beside the
  // main loop's may take the other's `◇` mark. The counts stay right: calls are noted one at a time (`noteWork`).
  return now !== undefined && before !== undefined
    ? { apply: files => filesFromCommand(filesFromDiff(files, before, now.files, now.root, now.here, isAgent), command, cwd, isAgent, true), more }
    : { apply: files => filesFromCommand(files, command, cwd, isAgent), more }
}

/** Each page's place in the order its fetch started this turn (8.7), by `sameUrl`: fetches in parallel end out of order. */
let fetchOrder = new Map<string, number>()

/**
 * A call is about to run: a fetch takes its place in the turn's fetch order.
 * @param tool the call's tool
 * @param input the call's input
 */
export function noteFetchStart(tool: string, input: unknown): void {
  const url = tool === 'WebFetch' && typeof input === 'object' && input !== null && 'url' in input && typeof input.url === 'string' ? input.url : undefined

  if (url !== undefined && !fetchOrder.has(sameUrl(url))) fetchOrder.set(sameUrl(url), fetchOrder.size)
}

/** The pages in the order their fetches started; one with no start seen (a resume) keeps its place after them. */
const inFetchOrder = (pages: readonly SourcePage[]): SourcePage[] =>
  pages.toSorted((a, b) => (fetchOrder.get(sameUrl(a.url)) ?? Infinity) - (fetchOrder.get(sameUrl(b.url)) ?? Infinity))

/**
 * A typed turn starts: its files, pages and citations start empty; the to-do list stays unless every item was done.
 * The working copy's diff now is where the turn's own changes are counted from.
 * @param $ the engine interface
 * @param cwd the session's folder
 */
export async function startWork($: EngineInterface, cwd?: string): Promise<void> {
  lastCwd = cwd ?? lastCwd
  fetchOrder = new Map()
  // FILES says it is reading while the work tree's diff is worked out; the pane draws meanwhile.
  await update($, work, w => {
    const todo = startTodo({ items: w.todo, isRevised: w.isRevised })

    return { ...EMPTY, todo: todo.items, isRevised: todo.isRevised, isReading: true as const }
  })
  startDiff = await diffNow($, cwd)
  lastDiff = startDiff?.files
  await update($, work, w => ({ ...w, isReading: undefined }))
}

/**
 * A main-loop call ended: what it adds to the turn's to-dos and files (when it succeeded) and pages (a failed fetch
 * too, with its status).
 * @param $ the engine interface
 * @param tool the call's tool
 * @param input the call's input
 * @param outcome what the call came back with
 * @param cwd the session's folder, for paths from the project root
 * @param isAgent whether the call was an agent's own: its files and pages are marked `◇`, and its to-dos are its own
 */
export async function noteWork($: EngineInterface, tool: string, input: unknown, outcome: Outcome, cwd: string | undefined, isAgent = false): Promise<void> {
  // One call at a time: each reads the work tree's last diff and moves it on, and agents' calls end beside the main
  // loop's. Two at once would both count the change between the last diff and the first of theirs.
  const run = noting.then(async () => noteWorkNow($, tool, input, outcome, cwd, isAgent))
  noting = run.catch(() => undefined) // a call that fails is the caller's to log; the next one still runs

  return run
}

/** The calls being noted, in the order they ended. */
let noting: Promise<void> = Promise.resolve()

/** `noteWork`'s body, run one call at a time. */
async function noteWorkNow($: EngineInterface, tool: string, input: unknown, outcome: Outcome, cwd: string | undefined, isAgent: boolean): Promise<void> {
  lastCwd = cwd ?? lastCwd
  const isOk = outcome.isError !== true && outcome.deny === undefined
  const isShell = tool === 'Bash' || tool === 'PowerShell'
  const command = typeof input === 'object' && input !== null && 'command' in input && typeof input.command === 'string' ? input.command : ''
  // A shell step that failed may still have written: its diff counts. Its own `rm` targets come last, so `del` stands.
  const shell = isShell && outcome.deny === undefined ? await shellFiles($, command, cwd, isAgent) : undefined

  // A Write may add a file; an Edit changes one that is there: the new files' listing is reused.
  if (isOk && EDITS.has(tool)) lastDiff = (await diffNow($, cwd, tool === 'Write'))?.files

  await update($, work, w => {
    const todo = isOk && !isAgent ? noteTodo({ items: w.todo, isRevised: w.isRevised }, tool, input, outcome.result) : { items: w.todo, isRevised: w.isRevised }
    const files = shell === undefined ? w.files : shell.apply(w.files)
    const more = shell?.more === undefined ? {} : shell.more === 0 ? { moreUntracked: undefined } : { moreUntracked: shell.more }

    return {
      ...w,
      todo: todo.items,
      isRevised: todo.isRevised,
      files: isOk ? noteFiles(files, tool, input, outcome.result, cwd, isAgent) : files,
      sources: outcome.deny === undefined ? inFetchOrder(noteSources(w.sources, tool, input, outcome, isAgent)) : w.sources,
      ...more
    }
  })
}

/**
 * The answer's cited pages, in mark order: the marks `[ SOURCES ]` shows once the turn ends.
 * @param $ the engine interface
 * @param cited the pages, as the transcript numbers them
 */
export async function noteCited($: EngineInterface, cited: readonly { url: string; title: string }[]): Promise<void> {
  await update($, work, w => ({ ...w, cited: cited.map(c => ({ url: c.url, title: c.title })) }))
}

const DIFF_MAX = 400 // diff rows a file's diff view keeps

/** The home folder, read once: where `~` is for a `$.fs` call. */
let home: Promise<string | undefined> | undefined

/**
 * Where a path is on disk, for a `$.fs` call: `~` and the home variables expand to the home folder (`USERPROFILE` on
 * Windows, `HOME` on POSIX, read only for such a path); any other relative path is from the session's folder.
 * @param $ the engine interface
 * @param path the path, as shown or as a call named it
 * @param cwd the session's folder
 * @returns the absolute path
 */
export async function diskPath($: EngineInterface, path: string, cwd: string): Promise<string> {
  if (!isAtHome(path)) return onDisk(path, cwd, undefined)

  home ??= (async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')))()

  return onDisk(path, cwd, await home)
}

/** Where a path lands, every link followed (`$.fs.stat`); null when nothing is there, undefined when it cannot be told. */
async function realPath($: EngineInterface, path: string): Promise<string | null | undefined> {
  try {
    return (await $.fs.stat(path, { resolve: true })).realPath
  } catch (error: unknown) {
    // A look that failed for another reason cannot place the file: the guard denies it, as it denies a refused look.
    return error instanceof Error && error.message.endsWith(' failed: ENOENT') ? null : undefined
  }
}

/**
 * Whether a file the session's folder names lands outside that folder once links are followed (a link or junction in
 * the project to elsewhere, SEC-T3), or where it lands cannot be told. A file not there yet lands nowhere: nothing to
 * read.
 * @param $ the engine interface
 * @param path the file, as the pane names it
 * @param cwd the session's folder
 * @param isCaseless whether the disk ignores case (`ignoresCase`), read once for the whole diff
 * @returns true when it must not be read
 */
export async function landsOutside($: EngineInterface, path: string, cwd: string, isCaseless: boolean): Promise<boolean> {
  const [file, root] = await Promise.all([realPath($, await diskPath($, path, cwd)), realPath($, cwd)])

  if (file === null) return false
  if (file === undefined || root === undefined || root === null) return true

  return !compared(file, isCaseless).startsWith(`${compared(root, isCaseless)}/`)
}

/**
 * One file's diff against HEAD as unified rows from its first `@@`, for a FILES row no Write or Edit patch covers (a
 * shell wrote it): `git diff HEAD -- <path>`, or a new file's content as `+` rows. Asked when the row is opened.
 * @param $ the engine interface
 * @param path the file, from the session's folder
 * @returns the rows; none where Git and the file give nothing
 */
export async function workDiff($: EngineInterface, path: string): Promise<string[]> {
  const cwd = lastCwd

  if (cwd === undefined) return []

  try {
    const diff = await $.process.run(['git', 'diff', 'HEAD', '--', path], { cwd })
    const rows = diff.exitCode === 0 ? diff.stdout.split('\n') : []
    const from = rows.findIndex(r => r.startsWith('@@'))

    if (from >= 0) return rows.slice(from, from + DIFF_MAX).filter((r, i, all) => i < all.length - 1 || r.length > 0)

    const text = await $.fs.read(await diskPath($, path, cwd))
    const lines = text.replace(/\n$/, '').split('\n')

    return [`@@ -0,0 +1,${lines.length} @@`, ...lines.map(l => `+${l}`)].slice(0, DIFF_MAX)
  } catch (error: unknown) {
    // A diff that cannot be read is the debug log's, never the main screen's, Cockpit on or off.
    $.ui.log(`cockpit: no diff for ${path}: ${String(error)}`, { to: 'debug' })

    return []
  }
}

/**
 * A resumed session: the last kept turn's files and pages come back (its to-dos are the engine's to restore).
 * @param $ the engine interface
 * @param record the turn
 */
export async function restoreWork($: EngineInterface, record: TurnRecord): Promise<void> {
  await update($, work, w => (w.files.length > 0 || w.sources.length > 0 ? w : { ...w, files: record.files, sources: record.sources, cited: record.cited }))
}

/**
 * The turn's work; read while drawing, so the drawing follows it.
 * @param $ the engine interface
 * @returns the work
 */
export async function readWork($: EngineInterface): Promise<TurnWork> {
  return read($, work)
}
