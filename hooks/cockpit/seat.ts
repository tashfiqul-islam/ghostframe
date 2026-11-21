// The Cockpit pane's width rule (spec C.1, with corrections A, B and K of the amendments).

/** The body widths the pane is designed at, widest first. */
const DESIGNED = [72, 56, 40] as const
const NARROWEST = DESIGNED[2]

/** Below this many terminal columns the engine seats a pane inline, not in the dock. */
export const DOCK_MIN = 110

/** The transcript keeps at least this many cells beside a docked pane. */
const TRANSCRIPT_MIN = 100

/** The dock's chrome: one divider column (correction A). */
const DIVIDER = 1

/**
 * The widest body the engine grants a docked pane: 45% of the terminal, the divider included (correction B).
 * @param columns the terminal's columns
 * @returns the most body columns a dock gets at that width
 */
export function dockCap(columns: number): number {
  return Math.floor(columns * 0.45) - DIVIDER
}

/**
 * The body columns Cockpit asks for: the widest designed width that leaves the transcript 100 cells, else the narrowest.
 * @param columns the terminal's columns
 * @returns the `columns` to pass to `$.ui.open`
 */
export function paneColumns(columns: number): number {
  return DESIGNED.find(body => columns - body - DIVIDER >= TRANSCRIPT_MIN) ?? NARROWEST
}

/**
 * The terminal's columns, from what a Pane render reads: docked, the viewport is the transcript beside the pane.
 * @param placement the pane's seat
 * @param viewport the render's `viewport.columns`
 * @param body the pane's `bodyColumns`
 * @returns the terminal's columns
 */
export function terminalColumns(placement: 'dock' | 'inline' | 'widget', viewport: number, body: number): number {
  return placement === 'inline' ? viewport : viewport + body + DIVIDER
}
