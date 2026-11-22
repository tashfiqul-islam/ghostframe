// A `/tui` switch of screen (probe 19, F.40): the command switches fullscreen on or off mid-session, and the engine
// remounts the transcript and loads the hooks module again. The switch is kept here as the command runs, said once by
// the copy of the module loaded after it, and cleared by the next typed turn. It is kept in `$.store`, not `$.state`:
// the copy loaded after a switch read the state as it was before a write made just ahead of it (probe 19).
import type { EngineInterface } from 'claude-code'

import { paneColumns } from './seat'

type Switch = { isFullscreen: boolean; columns: number }

const KEY = 'switch:'

const isSwitch = (v: unknown): v is Switch =>
  typeof v === 'object' && v !== null && 'isFullscreen' in v && typeof v.isFullscreen === 'boolean' && 'columns' in v && typeof v.columns === 'number'

/** Whether this copy of the module has said the kept switch. */
let isSaid = false
/** The screen this copy last looked for a switch on: a copy loaded after a switch draws on one screen, so it looks once. */
let lookedOn: boolean | undefined

/**
 * Keeps a switch as `/tui` runs: the copy that runs it is replaced while it does, so nothing after the command is sure
 * to run in it.
 * @param $ the engine interface
 * @param sw the screen asked for, and the terminal's columns
 */
export async function keepSwitch($: EngineInterface, sw: Switch): Promise<void> {
  await $.store.set(`${KEY}${await $.session.id()}`, sw)
}

/**
 * A typed turn after a switch: the switch is old news, and a reload later says nothing.
 * @param $ the engine interface
 */
export async function clearSwitch($: EngineInterface): Promise<void> {
  const key = `${KEY}${await $.session.id()}`

  if ((await $.store.get(key)) !== undefined) await $.store.delete(key)
}

/**
 * The notice of a kept switch, once per copy of the module and only on the screen it switched to: off, that the dock
 * is gone and worked nodes take its place; on, that the pane is back, its width and how many turns its log keeps.
 * @param $ the engine interface
 * @param isFullscreen the screen this draw is on
 * @param keptTurns how many turns the log keeps, read only when there is a switch to say
 * @returns the notice, or undefined when there is none to say
 */
export async function switchNotice($: EngineInterface, isFullscreen: boolean | undefined, keptTurns: () => Promise<number>): Promise<string | undefined> {
  if (isSaid || isFullscreen === undefined || isFullscreen === lookedOn) return undefined

  lookedOn = isFullscreen

  const sw: unknown = await $.store.get(`${KEY}${await $.session.id()}`)

  if (!isSwitch(sw) || sw.isFullscreen !== isFullscreen) return undefined

  isSaid = true

  if (!sw.isFullscreen) return 'fullscreen off · no dock on the main screen · worked nodes from here · /steps opens the log above the prompt'

  const kept = await keptTurns()

  return `fullscreen on · cockpit docked at ${paneColumns(sw.columns)} columns · step logs for ${kept} ${kept === 1 ? 'turn' : 'turns'}`
}
