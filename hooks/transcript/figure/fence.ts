import { vw } from '../../shared/text'

// ─── mdxcn figures (DESIGN.md §5.7) ──────────────────────────────────────────
// The mdxcn skill writes its figures as a bare fence holding framed ASCII (from
// https://mdxcn.dev/llms.txt `## MDX`):
//
//   ```
//   +------------------ [ SHIPPED ] -------------------+
//   |                                                  |
//   | ●  Mar 12  CLI copies the files                  |
//   |                                                  |
//   +--------------------------------------------------+
//   ```
//
// We redraw it in our own frame at the shared measure: the title in the top rule, the
// figure's rows inset 1, glyphs toned by what they mean. A fence that isn't one of
// these stays a plain code block.

/** A figure fence's content: its title, its inner rows (padding rows dropped), whether the fence closed. */
export type FigureBlock = {
  kind: 'figure'
  title: string
  rows: string[]
  closed: boolean
  /** The source frame's content width (its top edge less `|` each side and the inset). */
  source: number
}

const OPEN = /^```\s*$/
const TOP = /^\+-+ \[ (.+?) \] -+\+$/
const BOTTOM = /^\+-+\+$/
const ROW = /^\|(.*)\|$/

/** A bare fence line, the only kind a figure opens with. */
export const isBareFence = (line: string): boolean => OPEN.test(line)

/** Whether a fence's first line is an mdxcn figure's top edge. */
export const isFigureTop = (line: string | undefined): boolean => line !== undefined && TOP.test(line.trimEnd())

/**
 * A fence's body as a figure, or undefined (malformed: the caller keeps the plain code
 * block). `closed`: the fence's closing line has arrived. `whole`: the body's last line
 * is complete (while streaming, a half-written line is left out until it ends).
 */
export function parseFigure(body: readonly string[], closed: boolean, whole: boolean): FigureBlock | undefined {
  const lines = (closed || whole ? body : body.slice(0, -1)).map(l => l.trimEnd())
  const title = TOP.exec(lines[0] ?? '')?.[1]?.trim()

  if (title === undefined || title.length === 0) return undefined

  const rows: string[] = []
  let ended = false

  for (const line of lines.slice(1)) {
    if (ended) {
      if (line.length > 0) return undefined // anything after the bottom edge

      continue
    }

    if (BOTTOM.test(line)) {
      ended = true
      continue
    }

    const m = ROW.exec(line)

    if (m === null) return undefined

    // One space of the frame's own inset goes; the figure's alignment stays.
    rows.push((m[1] ?? '').replace(/^ /, '').trimEnd())
  }

  if (closed && !ended) return undefined

  // The frame's own padding rows go: blank rows at the top always, at the bottom once
  // the fence closes (while it streams a blank row waits until a row follows it).
  const first = rows.findIndex(r => r.length > 0)
  const kept = first < 0 ? [] : rows.slice(first)
  let last = kept.length

  while (last > 0 && (kept[last - 1] ?? '').length === 0) last--

  return { kind: 'figure', title, rows: kept.slice(0, last), closed, source: Math.max(0, vw(lines[0] ?? '') - 3) }
}
