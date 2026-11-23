// The small parts every v8 row is built from (spec 5.7, 6): a dim run of text, a run of spaces, a kind word in its
// 6 cells, and the colour of each result tone. One copy, so the left and the pane draw them the same.
import type { Part } from '../parts'
import { KIND_CELLS } from './words'
import { TOKEN } from './palette'

/** Text in `dim`. */
export const dim = (t: string): Part => ({ t, color: TOKEN.dim })

/** `n` cells of space (none for a negative `n`). */
export const sp = (n: number): Part => ({ t: ' '.repeat(Math.max(0, n)), color: TOKEN.dim })

/** A kind word in its 6 cells (5.6); a 6-letter word keeps a space after it, so the subject never touches it. */
export const kindCell = (kind: string): string => (kind.length >= KIND_CELLS ? `${kind} ` : kind.padEnd(KIND_CELLS))

/** How a result reads (5.7): its tone. */
export type Tone = 'dim' | 'ok' | 'err' | 'bright' | 'accent' | 'warn'

/** Each result tone's colour (5.7). */
export const TONE: Record<Tone, string> = {
  dim: TOKEN.machineDim,
  ok: TOKEN.ok,
  err: TOKEN.err,
  bright: TOKEN.textBright,
  accent: TOKEN.accent,
  warn: TOKEN.warn
}
