// What a typed turn worked on, for `[ TODO ]`, `[ FILES ]` and `[ SOURCES ]` (spec E.41 to E.43), kept in $.state.
// hooks/cockpit/log.ts calls these as the main loop's calls end and its turns start.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { TurnWork } from '../../types'
import { noteFiles } from './sections/files'
import { noteSources } from './sections/sources'
import { noteTodo, startTodo } from './sections/todo'
import type { Outcome } from './steps/log'

const EMPTY: TurnWork = { todo: [], isRevised: false, files: [], sources: [], cited: [] }

// The current (or last) typed turn's work. Change the tag when its fields change.
const work = atom({ plugin: 'ghostframe', key: 'work' } as const, EMPTY, { shape: 'work-1' })

/**
 * A typed turn starts: its files, pages and citations start empty; the to-do list stays unless every item was done.
 * @param $ the engine interface
 */
export async function startWork($: EngineInterface): Promise<void> {
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
  const isOk = outcome.isError !== true && outcome.deny === undefined

  await update($, work, w => {
    const todo = isOk ? noteTodo({ items: w.todo, isRevised: w.isRevised }, tool, input, outcome.result) : { items: w.todo, isRevised: w.isRevised }

    return {
      ...w,
      todo: todo.items,
      isRevised: todo.isRevised,
      files: isOk ? noteFiles(w.files, tool, input, outcome.result, cwd) : w.files,
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

/**
 * The turn's work; read while drawing, so the drawing follows it.
 * @param $ the engine interface
 * @returns the work
 */
export async function readWork($: EngineInterface): Promise<TurnWork> {
  return read($, work)
}
