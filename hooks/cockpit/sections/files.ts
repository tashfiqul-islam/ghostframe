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
import { sectionLabel } from '../steps/rows'

const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const lineCount = (t: string) => (t.length === 0 ? 0 : t.replace(/\n+$/, '').split('\n').length)
// `rm a b`, `git rm a`, `del a`, `Remove-Item a`: each segment of a shell command that deletes files.
const DELETE = /^\s*(?:git\s+rm|rm|del|erase|Remove-Item|ri)\s+(.+)$/i

/** Adds `change` to the list: a file seen before keeps its row and sums its lines; a new one goes last. */
function add(files: readonly FileChange[], change: FileChange): FileChange[] {
  const at = files.findIndex(f => f.path === change.path)
  const had = files[at]

  if (had === undefined) return [...files, change]

  const tag = change.tag === 'del' ? 'del' : had.tag === 'del' ? '' : had.tag

  return files.with(at, { ...had, tag, adds: had.adds + change.adds, dels: had.dels + change.dels })
}

/** The paths a shell command deletes: the arguments of each deleting segment, less its flags. */
function deleted(command: string): string[] {
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

    return add(files, { path: relPath(path, cwd), tag: isCreate ? 'new' : '', adds, dels })
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    return deleted(s(i['command']) ?? '').reduce((list, path) => add(list, { path: relPath(path, cwd), tag: 'del', adds: 0, dels: 0 }), [...files])
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
  if (files.length === 0) return []

  const total = sum(files)
  const label = sectionLabel(
    'FILES',
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

  if (isLabel) return [label]
  if (files.length <= cap) return [label, ...files.map(f => fileRow(f, width))]

  const keep = files.slice(0, cap - 1)
  const rest = sum(files.slice(cap - 1))
  const more = `  … ${files.length - keep.length} more files · +${rest.adds} −${rest.dels}`

  return [label, ...keep.map(f => fileRow(f, width)), [{ t: more + spaces(width - vw(more)), color: C.dim }]]
}
