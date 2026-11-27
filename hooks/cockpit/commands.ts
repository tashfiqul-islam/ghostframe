// Cockpit's own slash commands as they ran (spec 7.15): the whole command as typed and whether it did what was asked,
// kept so the `CommandOutput` row that prints its answer can say both. The engine hands the row empty `args` and its
// own `<plugin>: ` prefix on the text, so the row cannot tell them from its props. The runs are kept in `$.state` (a
// reload keeps them); each row is bound to its run by the row's id at its first draw, so a redraw or a later command
// with the same answer never changes which run a drawn row shows. A render may not write state, so the binding is the
// module's; after a reload the rows bind again in the order they draw, the oldest run first.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { CommandRuns } from '../../types'

/** A run of one of Cockpit's commands: the command as typed, its answer, and whether it did what was asked. */
export type Run = CommandRuns['runs'][number]

const RUNS_MAX = 50
const ROWS_MAX = 200
// Each output row's run, by the row's id.
const rows = new Map<string, Run>()
const state = atom({ plugin: 'ghostframe', key: 'commandRuns' } as const, { runs: [] } as CommandRuns, { shape: 'commandRuns-2' })

/**
 * A command answered: keeps the run for its row, and hands back the answer for `command.run` to return.
 * @param $ the engine interface
 * @param command its name, no slash
 * @param args its arguments as typed
 * @param text what it answers
 * @param isOk whether it did what was asked; an answer that says it could not is an error row (`×`)
 * @param turnNo for `/steps … all`, the turn it printed, kept so a later draw prints that turn
 * @returns `{ text }`, the hook's answer
 */
export async function answered($: EngineInterface, command: string, args: string, text: string, isOk: boolean, turnNo?: number): Promise<{ text: string }> {
  const typed = `/${command}${args.trim().length > 0 ? ` ${args.trim()}` : ''}`
  const run = { id: 0, command: typed, text, isOk, ...(turnNo === undefined ? {} : { turnNo }) }

  await update($, state, s => ({ ...s, runs: [...s.runs, { ...run, id: (s.runs.at(-1)?.id ?? 0) + 1 }].slice(-RUNS_MAX) }))

  return { text }
}

/**
 * The run a `CommandOutput` row prints: the one bound to the row, else the oldest run with its text (the engine's
 * `<plugin>: ` prefix taken off) that no row holds yet, bound to it from now on.
 * @param $ the engine interface
 * @param row the row's id (`requestId`)
 * @param shown the row's text
 * @param plugin this plugin's name, the prefix the engine adds
 * @returns the run, or undefined for a command Cockpit did not answer
 */
export async function runOf($: EngineInterface, row: string, shown: string, plugin: string): Promise<Run | undefined> {
  const bound = rows.get(row)

  if (bound !== undefined) return bound

  const text = withoutPrefix(shown, plugin)
  const held = new Set([...rows.values()].map(r => r.id))
  const run = (await read($, state)).runs.find(r => r.text.trim() === text && !held.has(r.id))

  if (run === undefined) return undefined

  rows.set(row, run)
  while (rows.size > ROWS_MAX) rows.delete(rows.keys().next().value ?? row)

  return run
}

/** A row's text without the `<plugin>: ` the engine puts before a plugin's answer. */
const withoutPrefix = (shown: string, plugin: string): string => shown.trim().replace(new RegExp(`^${plugin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`), '')
