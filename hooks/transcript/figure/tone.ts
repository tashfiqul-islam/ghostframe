import type { Part } from '../../shared/parts'
import { C } from '../../shared/tokens'

// ─── Tone: colour is state (§0.1 r5) ─────────────────────────────────────────

const BOX = /[─-╿]/
const BARS = /[█▃▄▅▆▇]/

/** One figure row as coloured parts. */
export function toneRow(line: string): Part[] {
  // oxlint-disable-next-line typescript/no-misused-spread -- code points on purpose: width is measured per code point until grapheme segmentation lands
  const chars = [...line]
  const hasBlocks = /[█▃▄▅▆▇▒]/.test(line)
  const parts: Part[] = []
  let inBar = false

  const colorAt = (i: number): string => {
    const ch = chars[i] ?? ''
    const prev = chars[i - 1]
    const next = chars[i + 1]

    // A `[====----]` bar: brackets and track in the rule's tone, the fill as a rail.
    if (ch === '[' && /^\[[=-]+\]/.test(chars.slice(i).join(''))) {
      inBar = true
      return C.hairline
    }
    if (inBar) {
      if (ch === ']') {
        inBar = false
        return C.hairline
      }
      return ch === '=' ? C.text : C.hairline
    }

    if (BOX.test(ch) || ch === '|') return C.hairline
    // A diff row's sign: `+ app` added, `- sourcemaps` removed.
    if (i === 0 && next === ' ' && ch === '+') return C.ok
    if (i === 0 && next === ' ' && ch === '-' && /\w/.test(chars[2] ?? '')) return C.err
    if (ch === '+') return C.hairline
    if (ch === '-' && (prev === '-' || next === '-')) return C.hairline

    switch (ch) {
      case '●':
      case '✓':
        return C.ok
      case '✗':
      case '✕':
        return C.err
      case '○':
      case '→':
        return C.muted
      case '▾':
        return C.accent // the marker for now
      case '–':
      case '░':
        return C.dim
      case '▒':
        return C.warn // slow
      case '·':
        return hasBlocks ? C.err : C.dim // down, in an uptime strip
      default:
        return BARS.test(ch) ? C.text : C.text
    }
  }

  chars.forEach((ch, i) => {
    const color = colorAt(i)
    const last = parts[parts.length - 1]

    if (last !== undefined && last.color === color) last.t += ch
    else parts.push({ t: ch, color })
  })

  return parts
}
