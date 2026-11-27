import { graphemesOf } from '../shared/look/width'
import { cellWidth, vw } from '../shared/text'
import { C } from '../shared/tokens'

// ─── Inline runs ─────────────────────────────────────────────────────────────
/** `cite`: a footnote marker (`¹`), link colour, glued to the word before it. `label`: a URL's label, muted. */
export type Run = { t: string; s: 'plain' | 'bold' | 'italic' | 'code' | 'cite' | 'label' }

/** One coloured piece of a drawn line. */
export type Span = { t: string; color: string; bg?: string; bold?: boolean; italic?: boolean }

/**
 * A run as drawn: code is a padded bright chip, bold is bright, the rest takes `base`.
 * `quiet` (narration between steps): bold and chips step down to the base colour.
 */
export function spanOf(r: Run, base: string, quiet = false): Span {
  switch (r.s) {
    case 'code':
      return { t: ` ${r.t} `, color: quiet ? C.muted : C.textBright, bg: C.surface }
    case 'bold':
      return { t: r.t, color: quiet ? base : C.textBright, bold: true }
    case 'italic':
      return { t: r.t, color: base, italic: true }
    case 'cite':
      return { t: r.t, color: C.link }
    case 'label':
      return { t: r.t, color: C.muted }
    default:
      return { t: r.t, color: base }
  }
}

// A code chip's right padding gives way to punctuation that follows it directly.
const TIGHT = /^[,.;:)!?]/

/**
 * Run `i` of a line as drawn: a chip padded one cell each side, its right pad dropped
 * when punctuation follows directly. The one place this is decided: drawing (`spansOf`)
 * and measuring (`drawnWidth`) both read it, so a measured row is the drawn row.
 */
export function drawnText(runs: readonly Run[], i: number): string {
  const r = runs[i]

  if (r === undefined) return ''
  if (r.s !== 'code') return r.t

  const after = runs[i + 1]

  return after !== undefined && after.s !== 'code' && TIGHT.test(after.t) ? ` ${r.t}` : ` ${r.t} `
}

/** Cells a line of runs takes as drawn. */
export const drawnWidth = (runs: readonly Run[]): number => runs.reduce((n, _, i) => n + vw(drawnText(runs, i)), 0)

/** Runs as drawn, one line's worth: `spanOf` each, chip text from `drawnText`. */
export function spansOf(runs: readonly Run[], base: string, quiet = false): Span[] {
  return runs.map((r, i) => ({ ...spanOf(r, base, quiet), t: drawnText(runs, i) }))
}

// Inline markdown we don't lay out ourselves: links, images, autolinks, bare URLs, html, strike, escapes.
const NOT_SIMPLE_INLINE = /\[|\]|<|>|https?:\/\/|www\.|~~|\\|\$\$/

/** `code`, **bold**, *italic* / _italic_ only; anything else (or unbalanced) → undefined. */
export function parseInline(s: string): Run[] | undefined {
  if (NOT_SIMPLE_INLINE.test(s.replace(/(`+)[^`]+?\1/g, ''))) {
    return undefined
  }

  const runs: Run[] = []
  const re = /(`+)([^`]+?)\1|\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])/g
  let last = 0

  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    if (m.index > last) {
      runs.push({ t: s.slice(last, m.index), s: 'plain' })
    }

    if (m[2] !== undefined) {
      runs.push({ t: m[2].trim(), s: 'code' })
    } else if (m[3] !== undefined || m[4] !== undefined) {
      runs.push({ t: m[3] ?? m[4] ?? '', s: 'bold' })
    } else {
      runs.push({ t: m[5] ?? m[6] ?? '', s: 'italic' })
    }

    last = m.index + m[0].length
  }

  if (last < s.length) {
    runs.push({ t: s.slice(last), s: 'plain' })
  }

  // Leftover markers mean markdown we didn't understand: let the engine draw it.
  if (runs.some(r => r.s !== 'code' && /[`*]|(^|\W)_|_(\W|$)/.test(r.t))) {
    return undefined
  }

  return runs
}

// ─── Wrapping ────────────────────────────────────────────────────────────────
export type Word = Run[]

/** Split runs into words at spaces; a code chip is never split. */
export function toWords(runs: Run[]): Word[] {
  const words: Word[] = []
  let cur: Word = []

  for (const r of runs) {
    if (r.s === 'code') {
      cur.push(r)
      continue
    }

    for (const piece of r.t.split(/( +)/)) {
      if (piece.length === 0) {
        continue
      }

      if (/^ +$/.test(piece)) {
        if (cur.length > 0) {
          words.push(cur)
          cur = []
        }
      } else {
        cur.push({ t: piece, s: r.s })
      }
    }
  }

  if (cur.length > 0) {
    words.push(cur)
  }

  return words
}

/** Cells a run takes on screen: a code chip carries one space of padding each side. */
export const runWidth = (r: Run): number => (r.s === 'code' ? vw(r.t) + 2 : vw(r.t))
const wordWidth = (w: Word) => w.reduce((n, r) => n + runWidth(r), 0)

/** A word wider than `width` broken into pieces that fit, by grapheme: a code chip into chips, each padded. */
function breakWord(word: Word, width: number): Word[] {
  if (wordWidth(word) <= width) return [word]

  const pieces: Word[] = [[]]
  let used = 0

  for (const r of word) {
    const pad = runWidth({ ...r, t: '' })
    let t = ''

    for (const g of graphemesOf(r.t)) {
      if ((used > 0 || t.length > 0) && used + pad + vw(t + g) > width) {
        if (t.length > 0) pieces[pieces.length - 1]?.push({ ...r, t })
        pieces.push([])
        used = 0
        t = ''
      }
      t += g
    }

    if (t.length > 0) {
      pieces[pieces.length - 1]?.push({ ...r, t })
      used += pad + vw(t)
    }
  }

  return pieces.filter(p => p.length > 0)
}

function greedy(words: Word[], width: number): Word[][] {
  const lines: Word[][] = []
  let line: Word[] = []
  let used = 0

  for (const w of words.flatMap(word => breakWord(word, width))) {
    const ww = wordWidth(w)

    if (line.length > 0 && used + 1 + ww > width) {
      lines.push(line)
      line = []
      used = 0
    }

    used += (line.length > 0 ? 1 : 0) + ww
    line.push(w)
  }

  if (line.length > 0) {
    lines.push(line)
  }

  return lines
}

/** Greedy wrap within `width`, then narrow it a little if that avoids a one-word last line. */
export function wrapWords(words: Word[], width: number): Word[][] {
  const base = greedy(words, width)

  if (base.length < 2 || (base[base.length - 1]?.length ?? 0) > 1) {
    return base
  }

  const floor = Math.floor(width * 0.8)

  for (let w = width - 1; w >= floor; w--) {
    const tryLines = greedy(words, w)

    if (tryLines.length === base.length && (tryLines[tryLines.length - 1]?.length ?? 0) > 1) {
      return tryLines
    }
  }

  return base
}

/** Plain text, verbatim line breaks and indentation, word-wrapped to `width` cells. */
export function wrapPlain(text: string, width: number): string[] {
  const out: string[] = []

  for (const rawLine of text.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n')) {
    const indent = /^ */.exec(rawLine)?.[0] ?? ''
    const body = rawLine.slice(indent.length)

    if (body.length === 0) {
      out.push('')
      continue
    }

    const room = Math.max(1, width - vw(indent))
    let line = ''

    for (const word of body.split(/ +/)) {
      for (const part of hardBreak(word, room)) {
        if (line.length === 0) {
          line = part
        } else if (vw(line) + 1 + vw(part) <= room) {
          line += ` ${part}`
        } else {
          out.push(indent + line)
          line = part
        }
      }
    }

    out.push(indent + line)
  }

  return out
}

function hardBreak(word: string, room: number): string[] {
  if (vw(word) <= room) {
    return [word]
  }

  const parts: string[] = []
  let cur = ''
  let w = 0

  for (const ch of graphemesOf(word)) {
    const cw = cellWidth(ch)

    if (w + cw > room) {
      parts.push(cur)
      cur = ''
      w = 0
    }

    cur += ch
    w += cw
  }

  if (cur.length > 0) {
    parts.push(cur)
  }

  return parts
}
