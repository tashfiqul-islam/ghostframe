// Each file's content at the typed turn's start, read just before the first call that could change it (an Edit or a
// Write naming it, a shell command naming it as a write or delete target), so a file's diff is the whole turn's change,
// a shell's included: that content against the file now (spec E.42, phase 8). A file no call named falls back to Git
// when it was clean at the turn's start; else its diff says why there is none.
import type { EngineInterface } from 'claude-code'

import type { FileDiff } from '../../../types'
import { obj, s } from '../../shared/calls/fields'
import { deleted, shownPath, writeTargets } from '../sections/files'
import { wasChangedBefore, workDiff } from '../work'
import { DIFF_LINES_MAX, lineDiff } from './linediff'

const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const SNAPSHOT_MAX = 2_000_000 // characters of a file kept; a larger one is not snapshotted, and its diff says so
const DIFF_MAX = 400 // diff rows kept

// shortcut: the turn's snapshots live in the module; a reload forgets them, and a file's diff then falls back to Git
// or says why it has none. The turn's diffs go to history (store.ts) when it ends.
/** Each file's content at the turn's start, by its path from the session's folder; null where it did not exist. */
let snapshots = new Map<string, string | null>()
/** The files too large to snapshot. */
let tooLarge = new Set<string>()

/** A typed turn starts: no file has been read for it yet. */
export function resetSnapshots(): void {
  snapshots = new Map()
  tooLarge = new Set()
}

/** Where a path the pane shows is on disk. */
const onDisk = (path: string, cwd: string): string => (/^(?:[A-Za-z]:)?\//.test(path) ? path : `${cwd.replace(/[\\/]+$/, '')}/${path}`)

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

  const fresh = [...new Set(targets(tool, input, cwd))].filter(path => !snapshots.has(path) && !tooLarge.has(path) && !path.startsWith('~'))

  await Promise.all(
    fresh.map(async path => {
      try {
        const text = await $.fs.read(onDisk(path, cwd))

        if (text.length > SNAPSHOT_MAX) tooLarge.add(path)
        else snapshots.set(path, text)
      } catch {
        snapshots.set(path, null) // not there yet: the turn creates it
      }
    })
  )
}

/**
 * A file's diff over the turn: its snapshot against its content now; else, for a file Git saw clean at the turn's
 * start, Git's diff; else none, and why.
 * @param $ the engine interface
 * @param path the file, as the pane names it
 * @param cwd the session's folder
 * @returns the diff, or its note when there is none
 */
export async function fileDiff($: EngineInterface, path: string, cwd: string | undefined): Promise<FileDiff> {
  const snap = snapshots.get(path)

  if (cwd !== undefined && snap !== undefined) {
    let now = ''

    try {
      now = await $.fs.read(onDisk(path, cwd))
    } catch {
      now = '' // removed by the turn
    }

    const patch = lineDiff(snap ?? '', now)

    return patch === undefined ? { path, patch: [], note: `no diff · over ${DIFF_LINES_MAX} lines` } : { path, patch: patch.slice(0, DIFF_MAX) }
  }

  if (tooLarge.has(path)) return { path, patch: [], note: 'no diff · the file was too large to keep a copy of' }

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
