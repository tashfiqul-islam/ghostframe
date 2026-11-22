// Cockpit's `[ FILES ]` (spec E.42): the files the turn changed, in order of first change, with their +/− lines
// updated in place, `new` and `del` tags, and the section's rows. Pure: hooks/cockpit/work.ts keeps the list and
// hooks/cockpit/fit.ts fits the rows.
import type { FileChange } from '../../../types'
import { obj, s } from '../../shared/calls/fields'
import { patchCounts } from '../../shared/calls/results'
import type { Part } from '../../shared/parts'
import { vw } from '../../shared/text'
import { C } from '../../shared/tokens'
import { clipPath, relPath } from '../../shared/url'
import { partsOf, plain } from '../line'
import type { Line } from '../line'
import { sectionLabel } from '../steps/rows'

const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const lineCount = (t: string) => (t.length === 0 ? 0 : t.replace(/\n+$/, '').split('\n').length)
// `rm a b`, `git rm a`, `del a`, `Remove-Item a`: each segment of a shell command that deletes files.
const DELETE = /^\s*(?:git\s+rm|rm|del|erase|Remove-Item|ri)\s+(.+)$/i

/**
 * A path as a shell command or a tool names it, from the project root: `$PWD`, `${PWD}`, `%CD%` and `./` are the
 * session's folder; `$HOME` and `${HOME}` are `~`, which stays as it is; a quoted path loses its quotes.
 * @param path the path as named
 * @param cwd the session's folder
 * @returns the path from the project root, or as it stands when it is outside
 */
export function shownPath(path: string, cwd: string | undefined): string {
  const bare = path.replace(/^["']|["']$/g, '')
  const here = cwd ?? '.'
  const expanded = bare
    .replace(/^(?:\$\{PWD\}|\$PWD|%CD%)(?=[\\/]|$)/i, here)
    .replace(/^(?:\$\{HOME\}|\$HOME)(?=[\\/]|$)/, '~')
    .replace(/^\.(?=[\\/])/, here)

  return relPath(expanded.replaceAll('\\', '/'), cwd)
}

/** Adds `change` to the list: a file seen before keeps its row and sums its lines; a new one goes last. */
function add(files: readonly FileChange[], change: FileChange): FileChange[] {
  const at = files.findIndex(f => f.path === change.path)
  const had = files[at]

  if (had === undefined) return [...files, change]

  const tag = change.tag === 'del' ? 'del' : had.tag === 'del' ? '' : had.tag

  return files.with(at, { ...had, tag, adds: had.adds + change.adds, dels: had.dels + change.dels })
}

// What a shell command writes: `> f`, `>> f` (not `2>&1` or `/dev/null`), `tee [-a] f`, `touch f`, and PowerShell's
// `Out-File`, `Set-Content` and `Add-Content`.
const REDIRECT = /(?:^|[^0-9&>])>>?\s*([^\s&|;<>]+)/g
const TEE = /\b(?:tee|touch)\s+(?:-a\s+)?([^\s&|;<>]+)/g
const PS_WRITE = /\b(?:Out-File|Set-Content|Add-Content)\s+(?:-(?:Path|FilePath|LiteralPath)\s+)?([^\s&|;<>]+)/gi

/** The files a shell command writes, as it names them; `/dev/null`, `NUL` and `$null` left out. */
export function writeTargets(command: string): string[] {
  const named = [...command.matchAll(REDIRECT), ...command.matchAll(TEE), ...command.matchAll(PS_WRITE)].map(m => m[1] ?? '')

  return [...new Set(named.filter(p => p.length > 0 && !/^(?:\/dev\/null|nul|\$null)$/i.test(p)))]
}

/** One file of the working copy's diff against its base, as `$.vcs.diff` gives it (stat only). */
export type Counted = { path: string; added: number; removed: number; isUntracked: boolean }

/**
 * What a shell step changed on disk, from the working copy's diff before and after it: each file whose counts
 * moved adds its difference to its row (a file the diff did not hold before and git does not track is `new`).
 * Rows are only added or updated, never reordered.
 * @param files the list before the step
 * @param before the diff before the step
 * @param after the diff after it
 * @param root the working copy's root, absolute
 * @param cwd the session's folder
 * @returns the list after it
 */
export function filesFromDiff(
  files: readonly FileChange[],
  before: readonly Counted[],
  after: readonly Counted[],
  root: string,
  cwd: string | undefined
): FileChange[] {
  return after.reduce(
    (list, now) => {
      const was = before.find(b => b.path === now.path)
      const adds = Math.max(0, now.added - (was?.added ?? 0))
      const dels = Math.max(0, now.removed - (was?.removed ?? 0))
      const isNew = was === undefined && now.isUntracked

      if (was !== undefined && adds === 0 && dels === 0) return list

      return add(list, { path: shownPath(`${root.replace(/[\\/]+$/, '')}/${now.path}`, cwd), tag: isNew ? 'new' : '', adds, dels })
    },
    [...files]
  )
}

/**
 * What a shell step wrote, where no working copy can say: each file it names as a write target, with no counts.
 * @param files the list before the step
 * @param command the shell command
 * @param cwd the session's folder
 * @returns the list after it
 */
export function filesFromCommand(files: readonly FileChange[], command: string, cwd: string | undefined): FileChange[] {
  return writeTargets(command).reduce((list, path) => add(list, { path: shownPath(path, cwd), tag: '', adds: 0, dels: 0 }), [...files])
}

/** The paths a shell command deletes: the arguments of each deleting segment, less its flags. */
export function deleted(command: string): string[] {
  return command.split(/&&|\|\||;|\n/).flatMap(part => {
    const m = DELETE.exec(part)

    return m === null ? [] : (m[1] ?? '').split(/\s+/).flatMap(a => (a.length === 0 || a.startsWith('-') ? [] : [a.replace(/^["']|["']$/g, '')]))
  })
}

/**
 * A call succeeded: the files list it leaves. An edit or write adds its +/− lines (a write that created its file
 * is `new`); a shell command that deletes files marks each `del`.
 * @param files the list before the call
 * @param tool the call's tool
 * @param input the call's input
 * @param result the call's record
 * @param cwd the session's folder, for paths from the project root
 * @returns the list after it
 */
export function noteFiles(files: readonly FileChange[], tool: string, input: unknown, result: unknown, cwd?: string): FileChange[] {
  const i = obj(input) ?? {}
  const o = obj(result)

  if (EDITS.has(tool)) {
    const path = s(i['file_path']) ?? s(i['notebook_path'])

    if (path === undefined) return [...files]

    const counts = patchCounts(o?.['structuredPatch'])
    const isCreate = tool === 'Write' && o?.['type'] === 'create'
    const content = s(o?.['content']) ?? s(i['content']) ?? ''
    const adds = counts !== undefined && (counts.adds > 0 || counts.dels > 0) ? counts.adds : isCreate ? lineCount(content) : 0
    const dels = counts?.dels ?? 0

    return add(files, { path: shownPath(path, cwd), tag: isCreate ? 'new' : '', adds, dels })
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    return deleted(s(i['command']) ?? '').reduce((list, path) => add(list, { path: shownPath(path, cwd), tag: 'del', adds: 0, dels: 0 }), [...files])
  }

  return [...files]
}

const spaces = (n: number) => ' '.repeat(Math.max(0, n))
const RIGHT_W = 19 // `    new  +141  −238`: the tag in 7, then +n and −n in 5 each

/** One file's row, exactly `width` cells: the path cut in the middle (the file name kept), the tag, +n, −n. */
function fileRow(f: FileChange, width: number): Part[] {
  const room = width - 2 - RIGHT_W - 1
  const path = clipPath(f.path, room)
  const plus = f.adds > 0 ? `+${f.adds}` : ''
  const minus = f.dels > 0 ? `−${f.dels}` : ''

  return [
    { t: `  ${path}${spaces(room - vw(path) + 1)}`, color: C.text },
    { t: f.tag.padStart(7), color: C.muted },
    { t: ` ${plus.padStart(5)}`, color: C.add },
    { t: ` ${minus.padStart(5)}`, color: C.del }
  ]
}

const sum = (files: readonly FileChange[]) => files.reduce((n, f) => ({ adds: n.adds + f.adds, dels: n.dels + f.dels }), { adds: 0, dels: 0 })

/**
 * `[ FILES ]`: the label, `N changed · +a −d`, then a row per file up to `cap`; past it, `cap − 1` rows and
 * `… n more files · +a −b`.
 * @param files the files, in order of first change
 * @param width the pane's body columns
 * @param cap the rows (4, or 6 in a tall pane)
 * @param isLabel only the label fits
 * @returns one Part list per row; none when the turn changed no file
 */
export function fileRows(files: readonly FileChange[], width: number, cap: number, isLabel = false): Part[][] {
  return partsOf(fileLines(files, width, cap, isLabel))
}

/**
 * `[ FILES ]` as `fileRows` fits it, each file's row under its id (`file:<path>`) so the pane can open its diff.
 * @param files the files, in order of first change
 * @param width the pane's body columns
 * @param cap the rows; `Infinity` for every file (`f`)
 * @param isLabel only the label fits
 * @param title the label (`FILES · TURN n` for a pinned turn)
 * @returns the rows
 */
export function fileLines(files: readonly FileChange[], width: number, cap: number, isLabel = false, title = 'FILES'): Line[] {
  if (files.length === 0) return []

  const total = sum(files)
  const label = sectionLabel(
    title,
    [
      { t: `${files.length} changed`, color: C.muted },
      // A side with no lines is left out: a turn that only deleted says `1 changed`.
      ...(total.adds > 0
        ? [
            { t: ` · `, color: C.muted },
            { t: `+${total.adds}`, color: C.add }
          ]
        : []),
      ...(total.dels > 0
        ? [
            { t: total.adds > 0 ? ' ' : ' · ', color: C.muted },
            { t: `−${total.dels}`, color: C.del }
          ]
        : [])
    ],
    width
  )

  const line = (f: FileChange): Line => ({ parts: fileRow(f, width), id: `file:${f.path}` })

  if (isLabel) return [plain(label)]
  if (files.length <= cap) return [plain(label), ...files.map(line)]

  const keep = files.slice(0, cap - 1)
  const rest = sum(files.slice(cap - 1))
  const more = `  … ${files.length - keep.length} more files · +${rest.adds} −${rest.dels}`

  return [plain(label), ...keep.map(line), plain([{ t: more + spaces(width - vw(more)), color: C.dim }])]
}
