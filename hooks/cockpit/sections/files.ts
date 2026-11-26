// The files a turn changed (spec E.42; spec 8.7): in order of first change, with their +/− lines updated in place and
// whether each is new or deleted. Pure: hooks/cockpit/work.ts keeps the list and hooks/cockpit/rows/views.ts draws it.
import type { FileChange } from '../../../types'
import { obj, s } from '../../shared/calls/fields'
import { patchCounts } from '../../shared/calls/results'
import { isOffProject, relPath } from '../../shared/url'

const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const lineCount = (t: string) => (t.length === 0 ? 0 : t.replace(/\n+$/, '').split('\n').length)
// `rm a b`, `git rm a`, `del a`, `Remove-Item a`: each segment of a shell command that deletes files.
const DELETE = /^\s*(?:git\s+rm|rm|del|erase|Remove-Item|ri)\s+(.+)$/i

/**
 * A path as a shell command or a tool names it, from the project root: `$PWD`, `${PWD}`, `%CD%` and `./` are the
 * session's folder; `$HOME`, `${HOME}`, `%USERPROFILE%` and `$env:USERPROFILE` are `~`, which stays as it is; a quoted
 * path loses its quotes.
 * @param path the path as named
 * @param cwd the session's folder
 * @returns the path from the project root, or as it stands when it is outside
 */
export function shownPath(path: string, cwd: string | undefined): string {
  const bare = path.replace(/^["']|["']$/g, '')
  const here = cwd ?? '.'
  const expanded = bare
    .replace(/^(?:\$\{PWD\}|\$PWD|%CD%)(?=[\\/]|$)/i, here)
    .replace(/^(?:\$\{HOME\}|\$HOME|%USERPROFILE%|\$env:USERPROFILE|\$\{env:USERPROFILE\})(?=[\\/]|$)/i, '~')
    .replace(/^\.(?=[\\/])/, here)

  return relPath(expanded.replaceAll('\\', '/'), cwd)
}

/** Adds `change` to the list: a file seen before keeps its row and sums its lines; a new one goes last. */
function add(files: readonly FileChange[], change: FileChange): FileChange[] {
  const at = files.findIndex(f => f.path === change.path)
  const had = files[at]

  if (had === undefined) return [...files, change]

  const tag = change.tag === 'del' ? 'del' : had.tag === 'del' ? '' : had.tag

  return files.with(at, { ...had, tag, adds: had.adds + change.adds, dels: had.dels + change.dels, ...by(had.isAgent === true || change.isAgent === true) })
}

/** The mark of a change an agent made (phase 11): `◇` at column 0, once set never taken back. */
const by = (isAgent: boolean) => (isAgent ? { isAgent: true as const } : {})

// What a shell command writes: `> f`, `>> f` (not `2>&1` or `/dev/null`), `tee [-a] f`, `touch f`, and PowerShell's
// `Out-File`, `Set-Content` and `Add-Content`.
const REDIRECT = /(?:^|[^0-9&>])>>?[ \t]*([^\s&|;<>]+)/g
// A here-string's body (PowerShell's `@'…'@`, `@"…"@`) and a heredoc's (`<<'EOF' … EOF`) are text, not commands: a `>`
// inside one writes nothing. A heredoc's opener line keeps what follows it (`cat <<'EOF' > notes.md`).
const HERE_STRING = /@(['"])\r?\n[\s\S]*?\r?\n\1@/g
const HEREDOC = /<<-?[ \t]*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2(?=\r?\n|$)/g
const TEE = /\b(?:tee|touch)\s+(?:-a\s+)?([^\s&|;<>]+)/g
const PS_WRITE = /\b(?:Out-File|Set-Content|Add-Content)\s+(?:-(?:Path|FilePath|LiteralPath)\s+)?([^\s&|;<>]+)/gi

/** The files a shell command writes, as it names them; `/dev/null`, `NUL` and `$null` left out. */
export function writeTargets(command: string): string[] {
  const code = command.replace(HERE_STRING, "''").replace(HEREDOC, '$3')
  const named = [...code.matchAll(REDIRECT), ...code.matchAll(TEE), ...code.matchAll(PS_WRITE)].map(m => m[1] ?? '')

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
 * @param isAgent whether an agent's step changed them
 * @returns the list after it
 */
export function filesFromDiff(
  files: readonly FileChange[],
  before: readonly Counted[],
  after: readonly Counted[],
  root: string,
  cwd: string | undefined,
  isAgent = false
): FileChange[] {
  return after.reduce(
    (list, now) => {
      const was = before.find(b => b.path === now.path)
      const adds = Math.max(0, now.added - (was?.added ?? 0))
      const dels = Math.max(0, now.removed - (was?.removed ?? 0))
      const isNew = was === undefined && now.isUntracked

      if (was !== undefined && adds === 0 && dels === 0) return list

      return add(list, { path: shownPath(`${root.replace(/[\\/]+$/, '')}/${now.path}`, cwd), tag: isNew ? 'new' : '', adds, dels, ...by(isAgent) })
    },
    [...files]
  )
}

/**
 * What a shell step wrote, where no working copy can say (or outside the working copy): each file it names as a write
 * target, with no counts.
 * @param files the list before the step
 * @param command the shell command
 * @param cwd the session's folder
 * @param isAgent whether an agent's step wrote them
 * @param isOffOnly only the targets outside the project: the working copy's diff counted the rest
 * @returns the list after it
 */
export function filesFromCommand(files: readonly FileChange[], command: string, cwd: string | undefined, isAgent = false, isOffOnly = false): FileChange[] {
  return writeTargets(command)
    .map(path => shownPath(path, cwd))
    .filter(path => !isOffOnly || isOffProject(path))
    .reduce((list, path) => add(list, { path, tag: '', adds: 0, dels: 0, ...by(isAgent) }), [...files])
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
 * @param isAgent whether the call was an agent's own
 * @returns the list after it
 */
export function noteFiles(files: readonly FileChange[], tool: string, input: unknown, result: unknown, cwd?: string, isAgent = false): FileChange[] {
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

    const shown = shownPath(path, cwd)
    // A file outside the project is listed as written, with no counts: it is never diffed (8.5).
    const isOff = isOffProject(shown)

    return add(files, { path: shown, tag: isCreate ? 'new' : '', adds: isOff ? 0 : adds, dels: isOff ? 0 : dels, ...by(isAgent) })
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    return deleted(s(i['command']) ?? '').reduce(
      (list, path) => add(list, { path: shownPath(path, cwd), tag: 'del', adds: 0, dels: 0, ...by(isAgent) }),
      [...files]
    )
  }

  return [...files]
}
