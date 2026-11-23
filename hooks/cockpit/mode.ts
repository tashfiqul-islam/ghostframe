// Whether the left is quiet (phase 4) for the turn running now: Cockpit on, its pane docked, and its tab the one
// shown. Another pane in the dock (the engine's Diff view, say) hides Cockpit's tab: the turns that start then draw
// the full view on the left. Read by left.tsx, set by pane.tsx (the seat) and log.ts (each turn's start).
import { noticeSink } from './switch'
import type { EngineInterface } from 'claude-code'

/** Cockpit's pane id: its `$.ui.open` id and its `Pane` render's `requestId`. */
export const PANE = 'cockpit'

/** The command that pins a past turn (E.45): `/steps <n>`, `/steps` for live. */
export const STEPS = 'steps'

/** The pane is docked now (its last `Pane` render's placement). */
let isDocked = false

/**
 * Whether Cockpit's tab was the one shown when the running turn started (`$.ui.panes()`'s `isShown`; the engine
 * raises no event when the shown tab changes, so each turn asks once). Unknown before the first turn.
 */
let isShownAtTurn: boolean | undefined

/** Whether the session has not started yet: the rows drawn until then are the transcript a resume brings back. */
let isBeforeStart = true

/** Whether the pane has been placed yet: until then, the resumed transcript's mode is not known. */
let isSeated = false

/** Whether the pane is docked now. */
export const docked = (): boolean => isDocked

/** Whether the session has not started yet (a row drawn now is the resumed transcript's). */
export const beforeStart = (): boolean => isBeforeStart

/** Whether the pane has been placed yet. */
export const seated = (): boolean => isSeated

/** The session starts: the rows drawn from now on are its own. */
export function markStarted(): void {
  isBeforeStart = false
}

/**
 * Keeps whether the pane is docked.
 * @param value whether it is
 * @returns whether that changed
 */
export function setDockedFlag(value: boolean): boolean {
  const isChanged = value !== isDocked || !isSeated
  isSeated = true
  isDocked = value

  return isChanged
}

/** Whether Cockpit's tab was shown when the running turn started; true before the first turn. */
export const shownAtTurn = (): boolean => isShownAtTurn ?? true

/**
 * A turn starts: whether Cockpit's tab is the one the dock shows decides the left's mode for that turn. A list the
 * engine cannot give keeps the last answer.
 * @param $ the engine interface
 */
export async function noteShown($: EngineInterface): Promise<void> {
  try {
    const pane = (await $.ui.panes()).find(p => p.id === PANE)

    // Only Cockpit's placed pane with another tab in front is hidden. With no pane placed (the main screen, too narrow,
    // closed) the left is in fallback, whatever this says, and a turn started then is not held to the full view when
    // the pane comes back (live: `/tui classic`, a turn, `/tui fullscreen` drew both turns unquiet).
    isShownAtTurn = pane?.isPlaced !== true || pane.isShown
  } catch (error: unknown) {
    $.ui.log(`cockpit: pane list unavailable: ${String(error)}`, noticeSink())
  }
}
