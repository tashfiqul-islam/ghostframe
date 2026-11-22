// What a typed turn worked on, for `[ TODO ]`, `[ FILES ]` and `[ SOURCES ]` (spec E.41 to E.43), kept in $.state.
// hooks/cockpit/log.ts calls these as the main loop's calls end and its turns start.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { FileChange, TurnRecord, TurnWork } from '../../types'
import { filesFromCommand, filesFromDiff, noteFiles } from './sections/files'
import type { Counted } from './sections/files'
import { noteSources } from './sections/sources'
import { noteTodo, startTodo } from './sections/todo'
import type { Outcome } from './steps/log'

const EMPTY: TurnWork = { todo: [], isRevised: false, files: [], sources: [], cited: [] }

// The current (or last) typed turn's work. Change the tag when its fields change.
const work = atom({ plugin: 'ghostframe', key: 'work' } as const, EMPTY, { shape: 'work-1' })

const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

// What changed on disk outside Write and Edit (a shell's `printf >> f`, a formatter) is read from Git: the working
// tree against HEAD (`git diff --numstat HEAD`, and `git ls-files --others` for new files, their lines counted once) at
// the typed turn's start and after each call that can change files, a shell step's rows being what moved between the
// two. The engine's `$.vcs.diff` answers `unknown` unless another plugin implements it, so Git is run directly.
// Before its first commit Git has seen nothing: every file it lists, staged or not, is new. Outside a Git work tree,
// the files a shell command names as write targets.
// shortcut: the work tree and the last diff live in the module; a reload forgets them, and the next shell step then
// starts from a fresh diff, listing nothing it changed before. Move them to $.state if that matters.
/** The session's Git work tree: unknown until asked, null where there is none (or it cannot be read). */
let copy: { root: string } | null | undefined
/** The session's folder, as the last turn or call gave it: where a file's diff is read (`workDiff`). */
let lastCwd: string | undefined
/** The work tree's diff after the last call that could change files. */
let lastDiff: Counted[] | undefined
/** The work tree's diff at the typed turn's start: what was changed before the turn. */
let startDiff: { root: string; files: Counted[] } | undefined

/** The session's folder, as the last turn or call gave it. */
export const cwdNow = (): string | undefined => lastCwd

/**
 * Whether a file had changes from before the turn, as Git saw the work tree at the typed turn's start.
 * @param path the file, from the session's folder
 * @returns true or false; undefined where there is no Git work tree to say
 */
export function wasChangedBefore(path: string): boolean | undefined {
  if (startDiff === undefined || lastCwd === undefined) return undefined

  const root = startDiff.root.replaceAll('\\', '/').replace(/\/+$/, '')
  const here = lastCwd.replaceAll('\\', '/').replace(/\/+$/, '')
  const fromRoot = here.toLowerCase().startsWith(root.toLowerCase()) ? `${here.slice(root.length + 1)}/${path}`.replace(/^\//, '') : path

  return startDiff.files.some(f => f.path === fromRoot)
}

const NEW_FILE_MAX = 2_000_000 // a new file past this many characters is listed, its lines not counted
const RECOUNT_MAX = 50 // up to this many new files are read again at every diff; past it, each is read once

/** `added, removed, path` lines of `git diff --numstat`; a binary file's `-` counts as 0. */
function numstat(text: string): Counted[] {
  return text.split('\n').flatMap(line => {
    const [added, removed, ...rest] = line.split('\t')
    const path = rest.join('\t')

    return path.length === 0 ? [] : [{ path, added: Number(added) || 0, removed: Number(removed) || 0, isUntracked: false }]
  })
}

/**
 * A new file's lines. Read at every diff while the work tree has few new files, so an append to one counts; past
 * that, read once, a file the last diff already counted keeping that count.
 * @param $ the engine interface
 * @param root the work tree's root
 * @param path the file, from the root
 * @param isRecount whether to read it even when it was counted before
 * @returns its lines, or 0 when it cannot be read or is too large to count
 */
async function newLines($: EngineInterface, root: string, path: string, isRecount: boolean): Promise<number> {
  const had = lastDiff?.find(f => f.isUntracked && f.path === path)

  if (had !== undefined && !isRecount) return had.added

  try {
    const text = await $.fs.read(`${root}/${path}`)

    return text.length > NEW_FILE_MAX || text.length === 0 ? 0 : text.replace(/\n+$/, '').split('\n').length
  } catch {
    return 0 // a file that cannot be read (binary, locked, gone) keeps its row without a count
  }
}

/**
 * The work tree's diff against HEAD now, with its new files.
 * @param $ the engine interface
 * @param cwd the session's folder
 * @returns its root and files, or undefined where there is no Git work tree to read
 */
async function diffNow($: EngineInterface, cwd: string | undefined): Promise<{ root: string; files: Counted[] } | undefined> {
  if (cwd === undefined || copy === null) return undefined

  try {
    if (copy === undefined) {
      const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
      copy = top.exitCode === 0 && top.stdout.trim().length > 0 ? { root: top.stdout.trim() } : null
    }

    if (copy === null) return undefined

    const root = copy.root
    // No commit yet (asked again until there is one): nothing to diff against, so no tracked rows, and the index's
    // files count as new beside the untracked ones.
    const hasHead = (await $.process.run(['git', 'rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: root })).exitCode === 0
    const tracked = hasHead
      ? await $.process.run(['git', 'diff', '--numstat', '--no-renames', 'HEAD', '--'], { cwd: root })
      : { exitCode: 0, stdout: '', stderr: '' }
    const others = await $.process.run(['git', 'ls-files', ...(hasHead ? [] : ['--cached']), '--others', '--exclude-standard', '-z'], { cwd: root })

    if (tracked.exitCode !== 0 || others.exitCode !== 0) throw new Error((tracked.stderr || others.stderr).trim())

    const fresh = others.stdout.split('\0').filter(p => p.length > 0)
    const isRecount = fresh.length <= RECOUNT_MAX
    const untracked = await Promise.all(fresh.map(async path => ({ path, added: await newLines($, root, path, isRecount), removed: 0, isUntracked: true })))

    return { root, files: [...numstat(tracked.stdout), ...untracked] }
  } catch (error: unknown) {
    copy = null
    $.ui.log(`cockpit: git work tree unreadable, [ FILES ] falls back to command targets: ${String(error)}`)

    return undefined
  }
}

/**
 * What a shell step changed on disk: the working copy's movement since the last diff, else the command's targets.
 * @param $ the engine interface
 * @param command the shell command
 * @param cwd the session's folder
 * @returns how it changes the files list, applied when the list is written
 */
async function shellFiles($: EngineInterface, command: string, cwd: string | undefined): Promise<(files: readonly FileChange[]) => FileChange[]> {
  const before = lastDiff
  const now = await diffNow($, cwd)
  lastDiff = now?.files

  return now !== undefined && before !== undefined
    ? files => filesFromDiff(files, before, now.files, now.root, cwd)
    : files => filesFromCommand(files, command, cwd)
}

/**
 * A typed turn starts: its files, pages and citations start empty; the to-do list stays unless every item was done.
 * The working copy's diff now is where the turn's own changes are counted from.
 * @param $ the engine interface
 * @param cwd the session's folder
 */
export async function startWork($: EngineInterface, cwd?: string): Promise<void> {
  lastCwd = cwd ?? lastCwd
  lastDiff = (await diffNow($, cwd))?.files
  startDiff = lastDiff === undefined ? undefined : { root: copy?.root ?? '', files: lastDiff }
  await update($, work, w => {
    const todo = startTodo({ items: w.todo, isRevised: w.isRevised })

    return { ...EMPTY, todo: todo.items, isRevised: todo.isRevised }
  })
}

/**
 * A main-loop call ended: what it adds to the turn's to-dos and files (when it succeeded) and pages (a failed fetch
 * too, with its status).
 * @param $ the engine interface
 * @param tool the call's tool
 * @param input the call's input
 * @param outcome what the call came back with
 * @param cwd the session's folder, for paths from the project root
 */
export async function noteWork($: EngineInterface, tool: string, input: unknown, outcome: Outcome, cwd: string | undefined): Promise<void> {
  lastCwd = cwd ?? lastCwd
  const isOk = outcome.isError !== true && outcome.deny === undefined
  const isShell = tool === 'Bash' || tool === 'PowerShell'
  const command = typeof input === 'object' && input !== null && 'command' in input && typeof input.command === 'string' ? input.command : ''
  // A shell step that failed may still have written: its diff counts. Its own `rm` targets come last, so `del` stands.
  const shell = isShell && outcome.deny === undefined ? await shellFiles($, command, cwd) : undefined

  if (isOk && EDITS.has(tool)) lastDiff = (await diffNow($, cwd))?.files

  await update($, work, w => {
    const todo = isOk ? noteTodo({ items: w.todo, isRevised: w.isRevised }, tool, input, outcome.result) : { items: w.todo, isRevised: w.isRevised }
    const files = shell === undefined ? w.files : shell(w.files)

    return {
      ...w,
      todo: todo.items,
      isRevised: todo.isRevised,
      files: isOk ? noteFiles(files, tool, input, outcome.result, cwd) : files,
      sources: outcome.deny === undefined ? noteSources(w.sources, tool, input, outcome) : w.sources
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

    const text = await $.fs.read(`${cwd}/${path}`)
    const lines = text.replace(/\n$/, '').split('\n')

    return [`@@ -0,0 +1,${lines.length} @@`, ...lines.map(l => `+${l}`)].slice(0, DIFF_MAX)
  } catch (error: unknown) {
    $.ui.log(`cockpit: no diff for ${path}: ${String(error)}`)

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
