// One row of the pane as it is drawn: its coloured parts, and, for a row that opens (a step, a file), the id the pane
// draws it under as a Button, so Tab reaches it and Enter opens it (spec E.44).
import type { Part } from '../shared/parts'

/** A pane row: its parts and, when it opens, its id (`step:<call id>`, `file:<path>`). */
export type Line = { parts: Part[]; id?: string }

/** A row that opens nothing. */
export const plain = (parts: Part[]): Line => ({ parts })

/** The parts of each row, for what only draws them. */
export const partsOf = (lines: readonly Line[]): Part[][] => lines.map(l => l.parts)
