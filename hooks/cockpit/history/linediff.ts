// A line diff of two texts as unified hunks (`@@ -a,b +c,d @@`, then ` `, `-` and `+` rows): a file's content at a
// turn's start against its content now, for the FILES diff when a shell changed it (spec E.42, phase 8). Myers'
// O(ND) algorithm on lines; pure.

const CONTEXT = 3 // rows of context around each change
/** Past this many lines on either side the diff is not computed: the caller says so. */
export const DIFF_LINES_MAX = 5_000
/**
 * Past this many changed lines (added plus removed) the diff is given up: the walk keeps one copy of its state per
 * change, so a rewrite at the line cap would hold near a gigabyte; under it, at most 40 MB. The view keeps 400 rows
 * anyway, so such a diff could not be shown whole.
 */
export const DIFF_CHANGES_MAX = 500

/** Why a diff was not computed: either side past `DIFF_LINES_MAX` lines, or past `DIFF_CHANGES_MAX` changed lines. */
export type DiffOver = { over: 'lines' | 'changes' }

type Op = { kind: ' ' | '-' | '+'; text: string; a: number; b: number }

/** The texts' lines: a final newline makes no empty last line. */
const linesOf = (text: string): string[] => (text.length === 0 ? [] : text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'))

/**
 * The shortest edit script from `a` to `b`, as one op per line (Myers, with the trace kept for the walk back); none
 * when it is longer than `DIFF_CHANGES_MAX`.
 */
function script(a: readonly string[], b: readonly string[]): Op[] | undefined {
  const n = a.length
  const m = b.length
  const max = n + m
  const offset = max
  const v = new Int32Array(2 * max + 2)
  const trace: Int32Array[] = []

  outer: for (let d = 0; d <= max; d++) {
    if (d > DIFF_CHANGES_MAX) return undefined

    trace.push(v.slice())

    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0)) ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1
      let y = x - k

      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }

      v[offset + k] = x

      if (x >= n && y >= m) break outer
    }
  }

  const ops: Op[] = []
  let x = n
  let y = m

  for (let d = trace.length - 1; d >= 0; d--) {
    const t = trace[d] ?? v
    const k = x - y
    const prevK = k === -d || (k !== d && (t[offset + k - 1] ?? 0) < (t[offset + k + 1] ?? 0)) ? k + 1 : k - 1
    const prevX = t[offset + prevK] ?? 0
    const prevY = prevX - prevK

    while (x > prevX && y > prevY) {
      x--
      y--
      ops.push({ kind: ' ', text: a[x] ?? '', a: x, b: y })
    }

    if (d > 0) {
      if (x === prevX) {
        y--
        ops.push({ kind: '+', text: b[y] ?? '', a: x, b: y })
      } else {
        x--
        ops.push({ kind: '-', text: a[x] ?? '', a: x, b: y })
      }
    }
  }

  return ops.toReversed()
}

/**
 * The unified diff of `before` and `after`, three rows of context around each change; none when they are equal.
 * @param before the text at the start (empty for a file that did not exist)
 * @param after the text now (empty for a file that was removed)
 * @returns the hunks' rows, or why there are none: either side passes `DIFF_LINES_MAX` lines, or the change passes
 *          `DIFF_CHANGES_MAX` lines
 */
export function lineDiff(before: string, after: string): string[] | DiffOver {
  const a = linesOf(before)
  const b = linesOf(after)

  if (a.length > DIFF_LINES_MAX || b.length > DIFF_LINES_MAX) return { over: 'lines' }

  const ops = script(a, b)

  if (ops === undefined) return { over: 'changes' }

  const changed = ops.flatMap((op, i) => (op.kind === ' ' ? [] : [i]))
  const out: string[] = []
  let at = 0

  while (at < changed.length) {
    const first = changed[at] ?? 0
    let last = first

    // A hunk runs on while the next change is within twice the context.
    while (at + 1 < changed.length && (changed[at + 1] ?? 0) - last <= 2 * CONTEXT + 1) {
      at++
      last = changed[at] ?? last
    }

    const from = Math.max(0, first - CONTEXT)
    const to = Math.min(ops.length - 1, last + CONTEXT)
    const rows = ops.slice(from, to + 1)
    const head = rows[0]
    const aStart = (head?.a ?? 0) + 1
    const bStart = (head?.b ?? 0) + 1
    const aLen = rows.filter(r => r.kind !== '+').length
    const bLen = rows.filter(r => r.kind !== '-').length

    out.push(`@@ -${aLen === 0 ? aStart - 1 : aStart},${aLen} +${bLen === 0 ? bStart - 1 : bStart},${bLen} @@`, ...rows.map(r => `${r.kind}${r.text}`))
    at++
  }

  return out
}
