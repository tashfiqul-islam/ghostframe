// A small text layout of a drawn tree, for tests that need the rows as a terminal would
// show them (the test kit hands back the tree, never a surface's paint). It covers what
// this mod draws: column and row Boxes, fixed and growing widths, paddingLeft, margins,
// one-row overflow-hidden fillers, and Text that truncates or wraps. Engine nodes draw
// their `text` prop (Markdown) or nothing.

import { vw } from '../../hooks/shared/text'

type Node = string | { type: string; props?: Record<string, unknown>; children?: unknown[] }

const isNode = (n: unknown): n is Exclude<Node, string> => typeof n === 'object' && n !== null && 'type' in n

/** The visible text of a Text and the inline Texts inside it. */
function textOf(n: unknown): string {
  if (typeof n === 'string') return n
  if (!isNode(n)) return ''

  return (n.children ?? []).map(textOf).join('')
}

/** Cut `s` to `w` cells (no ellipsis: what a terminal shows when a row is cut). */
function cut(s: string, w: number): string {
  let out = ''
  let used = 0

  for (const ch of s) {
    const cw = vw(ch)

    if (used + cw > w) break
    out += ch
    used += cw
  }

  return out
}

/** Hard-wrap `s` into rows of at most `w` cells. */
function wrap(s: string, w: number): string[] {
  if (w <= 0) return ['']

  const rows: string[] = []
  let row = ''
  let used = 0

  for (const ch of s) {
    const cw = vw(ch)

    if (used + cw > w) {
      rows.push(row)
      row = ''
      used = 0
    }
    row += ch
    used += cw
  }
  rows.push(row)

  return rows
}

const num = (v: unknown) => (typeof v === 'number' ? v : 0)
const widest = (rows: readonly string[]) => Math.max(0, ...rows.map(vw))
const padTo = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - vw(s)))

/** The rows `n` draws in `width` cells. */
export function rowsOf(n: unknown, width: number): string[] {
  if (typeof n === 'string') return wrap(n, width)
  if (!isNode(n)) return []

  const p = n.props ?? {}

  if (p['display'] === 'none') return []

  if (n.type === 'Text') {
    const all = textOf(n)

    // An empty Text takes no row (as the terminal lays it out).
    if (all.length === 0) return []

    const lines = all.split('\n')
    const mode = p['wrap']

    return mode === 'truncate' || mode === 'truncate-end' ? lines.map(l => cut(l, width)) : lines.flatMap(l => wrap(l, width))
  }

  if (n.type !== 'Box') {
    const t = typeof p['text'] === 'string' ? p['text'] : ''

    return t.length === 0 ? [] : t.split('\n').flatMap(l => wrap(l, width))
  }

  const own = typeof p['width'] === 'number' ? Math.min(p['width'], width) : width
  const padL = num(p['paddingLeft'])
  const inner = Math.max(0, own - padL)
  const kids = (n.children ?? []).filter(k => typeof k === 'string' || isNode(k))
  let body: string[]

  if (p['flexDirection'] === 'column') {
    body = kids.flatMap(k => rowsOf(k, inner))
  } else {
    // A row: fixed and natural widths first, growing children share what is left.
    const widths: number[] = []
    let left = inner
    const grows: number[] = []

    kids.forEach((k, i) => {
      const kp = isNode(k) ? (k.props ?? {}) : {}

      if (num(kp['flexGrow']) > 0) {
        grows.push(i)
        widths.push(0)
        return
      }

      const w = typeof kp['width'] === 'number' ? Math.min(kp['width'], left) : Math.min(left, widest(rowsOf(k, left)))

      widths.push(w)
      left -= w
    })
    for (const i of grows) widths[i] = Math.max(0, Math.floor(left / grows.length))

    const blocks = kids.map((k, i) => rowsOf(k, widths[i] ?? 0))
    const height = Math.max(0, ...blocks.map(b => b.length))

    body = Array.from({ length: height }, (_, r) =>
      blocks.map((b, i) => (i === blocks.length - 1 ? (b[r] ?? '') : padTo(cut(b[r] ?? '', widths[i] ?? 0), widths[i] ?? 0))).join('')
    )
  }

  if (num(p['height']) === 1 && p['overflow'] === 'hidden') body = body.slice(0, 1).map(r => cut(r, inner))

  const indented = body.map(r => ' '.repeat(padL) + r)

  return [...Array(num(p['marginTop'])).fill(''), ...indented, ...Array(num(p['marginBottom'])).fill('')]
}

/** A drawn tree as plain text at `columns`, trailing spaces trimmed. */
export const textAt = (tree: unknown, columns: number) => rowsOf(tree, columns).map(r => r.trimEnd())
