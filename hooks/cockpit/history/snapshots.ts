// Each file's content at the typed turn's start, read just before the first call that could change it (an Edit or a
// Write naming it, a shell command naming it as a write or delete target), so a file's diff is the whole turn's change,
// a shell's included: that content against the file now (spec E.42, phase 8). A file no call named falls back to Git
// when it was clean at the turn's start; else its diff says why there is none.
import type { EngineInterface } from 'claude-code'

import type { FileDiff } from '../../../types'
import { obj, s } from '../../shared/calls/fields'
import { deleted, shownPath, writeTargets } from '../sections/files'
import { isOffProject } from '../../shared/url'
import { COUNT_BYTES_MAX, cwdNow, diskPath, ignoresCase, landsOutside, placeOf, wasChangedBefore, workDiff } from '../work'
import { DIFF_CHANGES_MAX, DIFF_LINES_MAX, lineDiff } from './linediff'

const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const DIFF_MAX = 400 // diff rows kept

// shortcut: the turn's snapshots live in the module; a reload forgets them, and a file's diff then falls back to Git
// or says why it has none. The turn's diffs go to history (store.ts) when it ends.
/** Each file's content at the turn's start, by its path from the session's folder; null where it did not exist. */
let snapshots = new Map<string, string | null>()
/** The files too large to snapshot. */
let tooLarge = new Set<string>()
/** The reads under way, by path. */
let reading = new Map<string, Promise<void>>()

/** A typed turn starts: no file has been read for it yet. */
export function resetSnapshots(): void {
  snapshots = new Map()
  tooLarge = new Set()
  reading = new Map()
}

/** The files a call may change, as the pane names them. */
function targets(tool: string, input: unknown, cwd: string): string[] {
  const i = obj(input) ?? {}

  if (EDITS.has(tool)) {
    const path = s(i['file_path']) ?? s(i['notebook_path'])

    return path === undefined ? [] : [shownPath(path, cwd)]
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    const command = s(i['command']) ?? ''

    return [...writeTargets(command), ...deleted(command)].map(p => shownPath(p, cwd))
  }

  return []
}

/**
 * A main-loop call is about to run: each file it may change that the turn has not read yet is read now, its content
 * at the turn's start (or null when it does not exist yet).
 * @param $ the engine interface
 * @param tool the call's tool
 * @param input the call's input
 * @param cwd the session's folder
 */
export async function snapshotBefore($: EngineInterface, tool: string, input: unknown, cwd: string | undefined): Promise<void> {
  if (cwd === undefined) return

  const named = [...new Set(targets(tool, input, cwd))].filter(path => !isOffProject(path))
  // Read before the paths are claimed: no wait may fall between finding them unread and claiming them.
  const caseless = named.length > 0 && (await ignoresCase($))
  const fresh = named.filter(path => !snapshots.has(path) && !tooLarge.has(path) && !reading.has(path))

  // Each path is claimed before its read: a call of an agent beside the main loop's waits for the first read rather
  // than reading the file again, maybe after the other call changed it.
  for (const path of fresh) {
    reading.set(
      path,
      (async () => {
        try {
          // One look says both: through a link to elsewhere, it is outside the project after all and never read (its
          // diff says so); over 1 MB, it is never read into memory. Nothing there yet: the turn creates it.
          const { isOutside, size } = await placeOf($, path, cwd, caseless)

          if (isOutside) return
          if (size === undefined) {
            snapshots.set(path, null)

            return
          }
          if (size > COUNT_BYTES_MAX) {
            tooLarge.add(path)

            return
          }

          const text = await $.fs.read(await diskPath($, path, cwd))

          // A NUL byte: a binary file, of which no copy is kept.

          if (text.includes('\0')) tooLarge.add(path)
          else snapshots.set(path, text)
        } catch {
          snapshots.set(path, null) // not there yet: the turn creates it
        } finally {
          reading.delete(path)
        }
      })()
    )
  }

  await Promise.all(named.map(async path => reading.get(path)))
}

/**
 * A file's diff over the turn, none for a file outside the project: its snapshot against its content now; else, for a
 * file Git saw clean at the turn's start, Git's diff; else none, and why.
 * @param $ the engine interface
 * @param path the file, as the pane names it
 * @param cwd the session's folder
 * @returns the diff, or its note when there is none
 */
export async function fileDiff($: EngineInterface, path: string, cwd: string | undefined): Promise<FileDiff> {
  // Outside the project (the home folder, temp, a scratchpad, or through a link to there): listed, never diffed (8.5).
  // The folder Git's fallback reads from is checked when the caller names none.
  const here = cwd ?? cwdNow()

  if (isOffProject(path) || (here !== undefined && (await landsOutside($, path, here, await ignoresCase($)))))
    return { path, patch: [], note: 'no diff · outside the project' }

  const snap = snapshots.get(path)

  if (cwd !== undefined && snap !== undefined) {
    let now = ''

    try {
      now = await $.fs.read(await diskPath($, path, cwd))
    } catch {
      now = '' // removed by the turn
    }

    const patch = lineDiff(snap ?? '', now)

    if (Array.isArray(patch)) return { path, patch: patch.slice(0, DIFF_MAX) }

    return { path, patch: [], note: patch.over === 'lines' ? `no diff · over ${DIFF_LINES_MAX} lines` : `no diff · over ${DIFF_CHANGES_MAX} changed lines` }
  }

  if (tooLarge.has(path)) return { path, patch: [], note: 'no diff · the file was too large or binary to keep a copy of' }

  const before = wasChangedBefore(path)

  if (before === false) return { path, patch: await workDiff($, path) }

  return {
    path,
    patch: [],
    note:
      before === true
        ? 'no snapshot · no call named this file before it changed, and it had changes from before the turn'
        : 'no snapshot · no call named this file before it changed, and this is not a Git work tree'
  }
}
