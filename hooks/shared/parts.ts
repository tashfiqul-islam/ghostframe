import { C } from './tokens'
import { clip, vw } from './text'

// ─── Parts: coloured pieces of one drawn line ────────────────────────────────

/** One coloured piece of a framed line. */
export type Part = { t: string; color: string; bold?: boolean; href?: string; bg?: string }

/** Clip `parts` to `n` cells (the cut part ends in `…`), then pad with spaces to exactly `n`. */
export function fitParts(parts: readonly Part[], n: number): Part[] {
  const out: Part[] = []
  let used = 0

  for (const p of parts) {
    const room = n - used

    if (room <= 0) break

    const w = vw(p.t)

    if (w <= room) {
      out.push(p)
      used += w
    } else {
      const t = clip(p.t, room)
      out.push({ ...p, t })
      used += vw(t)
      break
    }
  }

  if (used < n) out.push({ t: ' '.repeat(n - used), color: C.text })

  return out
}

export const partsWidth = (parts: readonly Part[]): number => parts.reduce((w, p) => w + vw(p.t), 0)

/**
 * Neighbouring parts of one style as one: each part is a Text the engine carries over from the hooks worker and lays
 * out at every draw, and the engine draws a row again each time the person scrolls it across the viewport's edge.
 * @param parts a line's parts
 * @returns the parts, each run of one colour, weight and background joined
 */
export function sameStyleJoined(parts: readonly Part[]): Part[] {
  const out: Part[] = []

  for (const p of parts) {
    const last = out.at(-1)

    if (last !== undefined && last.color === p.color && (last.bold === true) === (p.bold === true) && last.bg === p.bg)
      out[out.length - 1] = { ...last, t: last.t + p.t }
    else out.push(p)
  }

  return out
}
