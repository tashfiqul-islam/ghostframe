import { COMMIT_HEAD, DENIED, GIT_COMMIT, describe } from './shared/calls/describe'
import { num, obj, s } from './shared/calls/fields'
import { firstErrorLine, resultOf } from './shared/calls/results'
import type { Tone } from './shared/calls/results'
import { parseTests, stripNoise } from './shared/calls/tests'
import { G } from './shared/layout'
import type { Part } from './shared/parts'
import { clip, pad, vw } from './shared/text'
import { fmtDuration } from './shared/time'
import { C } from './shared/tokens'
import { clipPath } from './shared/url'
import { clipLabel } from './research'

// ─── Activity timeline (DESIGN.md §5.4 under §0.1 r1, r2, r14) ───────────────
// One row per step: `● verb    target ……… result   time`, frameless. State is
// the dot; detail hangs off `╰─` in dim. Anything we can't read → undefined,
// and the caller hands the row back to the engine.

export const DOT_W = 2 // `● `
export const VERB_W = 8
export const TIME_W = 6 // `1m 12s`; a longer time widens its own cell, never clips
export const LEAD = DOT_W + VERB_W // target column, from the content edge

export type Step = {
  dot: Tone
  verb: string
  target: string
  isPath: boolean
  targetColor?: string // a fetched URL's label: muted
  isLabel?: boolean // the target is a URL label: clipped by clipLabel, not as a path
  result: Tone[] // parts, e.g. [+18, −4]
  detail?: string
}

/** `isAsking`: a person-facing permission ask is open for this call (from `tool.check`). */
export type CallFlags = { isRunning: boolean; isErrored: boolean; isInterrupted: boolean; isAsking?: boolean }

/** TaskUpdate's result reads its own input: the status it set. */
function taskStatus(input: unknown): Tone[] | undefined {
  switch (obj(input)?.['status']) {
    case 'completed':
      return [{ text: 'done', color: C.ok }]
    case 'in_progress':
      return [{ text: 'in progress', color: C.accent }]
    case 'pending':
      return [{ text: 'open', color: C.muted }]
    case 'deleted':
      return [{ text: 'deleted', color: C.muted }]
    default:
      return undefined
  }
}

/** A plan's first heading, or its first line, as the step's target. */
function planTitle(output: unknown): string | undefined {
  const plan = s(obj(output)?.['plan'])
  const line = plan
    ?.split('\n')
    .map(l =>
      l
        .replace(/^#{1,6}\s+/, '')
        .replace(/\*\*|__|`/g, '')
        .trim()
    )
    .find(l => l.length > 0)

  return line
}

/** A shell's output as text (stdout and stderr, or the error text). */
const shellOut = (output: unknown) => {
  if (typeof output === 'string') return output

  const o = obj(output)

  return o === undefined ? '' : [o['stdout'], o['stderr']].filter((x): x is string => typeof x === 'string').join('\n')
}

/** `56 pass` (ok) or `3 fail` (err) when a test run printed a summary; else undefined. */
export function testResult(output: unknown): Tone[] | undefined {
  const c = parseTests(shellOut(output))

  if (c === undefined) return undefined

  return c.failed > 0 ? [{ text: `${c.failed} fail`, color: C.err }] : [{ text: `${c.passed} pass`, color: C.ok }]
}

/**
 * What a shipping command did, for its row: `committed a1b2c3d` for a commit, `PR #148` for
 * a pull request. The turn's last one also draws the [ SHIPPED ] card; earlier ones
 * are this row alone. Nothing read → undefined (`ok`).
 */
export function shipResult(command: string, output: unknown): Tone[] | undefined {
  const text = stripNoise(shellOut(output))
  const pr = /\bgh\s+pr\s+create\b/.test(command) ? /https:\/\/\S+\/pull\/(\d+)/.exec(text)?.[1] : undefined

  if (pr !== undefined) return [{ text: `PR #${pr}`, color: C.ok }]

  const sha = GIT_COMMIT.test(command) ? COMMIT_HEAD.exec(text)?.[1] : undefined

  return sha === undefined
    ? undefined
    : [
        { text: 'committed', color: C.ok },
        { text: sha.slice(0, 7), color: C.muted }
      ]
}

/** The whole step, or undefined to leave the row to the engine. */
export function stepOf(
  tool: string,
  input: unknown,
  output: unknown,
  f: CallFlags,
  cwd?: string,
  d: ReturnType<typeof describe> = describe(tool, input, cwd)
): Step | undefined {
  if (d === undefined) return undefined

  // Waiting on the person's permission answer: not running yet, nothing back yet.
  if (f.isAsking === true && !f.isRunning && !f.isErrored && !f.isInterrupted && output === undefined) {
    return { ...d, dot: { text: G.ask, color: C.warn }, result: [{ text: 'needs you', color: C.warn }], detail: 'waiting for you' }
  }

  if (f.isRunning) {
    return { ...d, dot: { text: G.running, color: C.accent }, result: [{ text: 'running', color: C.accent }] }
  }

  if (f.isInterrupted) {
    return { ...d, dot: { text: G.interrupted, color: C.muted }, result: [{ text: 'interrupted', color: C.warn }] }
  }

  if (f.isErrored) {
    const text = typeof output === 'string' ? output : ''

    if (DENIED.test(text)) {
      return { ...d, dot: { text: G.denied, color: C.err }, result: [{ text: 'denied', color: C.err }] }
    }

    const shell = tool === 'Bash' || tool === 'PowerShell'
    const code = /exit code[:\s]+(\d+)/i.exec(text)?.[1]
    const detail = firstErrorLine(text)
    const summary = shell && d.verb === 'test' ? testResult(text) : undefined

    return {
      ...d,
      dot: { text: G.done, color: C.err },
      result: summary ?? [{ text: shell && code !== undefined ? `exit ${code}` : 'failed', color: C.err }],
      ...(detail.length > 0 ? { detail } : {})
    }
  }

  const target = tool === 'ExitPlanMode' ? (planTitle(output) ?? d.target) : d.target
  const shell = tool === 'Bash' || tool === 'PowerShell'
  const summary = shell ? (d.verb === 'test' ? testResult(output) : shipResult(s(obj(input)?.['command']) ?? '', output)) : undefined
  const result = summary ?? (tool === 'TaskUpdate' ? taskStatus(input) : resultOf(tool, output)) ?? [{ text: 'ok', color: C.ok }]

  return { ...d, target, dot: { text: G.done, color: C.ok }, result }
}

// ─── The activity rule ───────────────────────────────────────────────────────
export type StepLike = { id: string; turn: string | null; at: number; ms: number | null; tool?: string; ok?: boolean }

/** First start to last end of some steps; a loop, not `Math.max(...)`, so no step count overflows the stack. */
const wallOf = (steps: readonly StepLike[]) =>
  steps.reduce((m, x) => Math.max(m, x.at + (x.ms ?? 0)), -Infinity) - steps.reduce((m, x) => Math.min(m, x.at), Infinity)

/** The rule's `N steps · wall time` when `id` opens its turn's activity; else undefined. */
export function activityHead(list: readonly StepLike[], id: string | undefined): string | undefined {
  const me = list.find(x => x.id === id)

  if (me === undefined || me.turn === null) return undefined

  const mine = list.filter(x => x.turn === me.turn)

  if (mine[0]?.id !== id) return undefined

  const n = mine.length
  const count = `${n} ${n === 1 ? 'step' : 'steps'}`

  // Wall time only once every step has finished: a live count never shows a stale total.
  if (mine.some(x => x.ms === null)) return count

  return `${count} · ${fmtDuration(wallOf(mine))}`
}

// ─── Settled turns: early steps fold into one row ────────────────────────────

export const FOLD_AFTER = 8 // finished steps in a turn before it folds
export const KEEP_LATEST = 5 // the steps that always stay as rows

export type Fold = { isAnchor: boolean; count: number; summary: string; failed: number; wall: number }

const NOUNS: [RegExp, string, string][] = [
  [/^Read$/, 'read', 'reads'],
  [/^(Edit|MultiEdit|NotebookEdit)$/, 'edit', 'edits'],
  [/^Write$/, 'write', 'writes'],
  [/^(Bash|PowerShell)$/, 'command', 'commands'],
  [/^(Grep|Glob|WebSearch)$/, 'search', 'searches'],
  [/^WebFetch$/, 'fetch', 'fetches'],
  [/^(Agent|Task)$/, 'agent', 'agents'],
  [/^mcp__/, 'mcp call', 'mcp calls']
]

/** `3 reads, 2 edits, 1 command`: the three biggest kinds, in words. */
export function foldSummary(tools: readonly (string | undefined)[]): string {
  const counts = new Map<string, { n: number; one: string; many: string }>()

  for (const t of tools) {
    const [, one, many] = NOUNS.find(([re]) => re.test(t ?? '')) ?? [/./, 'other', 'other']
    const c = counts.get(one) ?? { n: 0, one, many }

    c.n++
    counts.set(one, c)
  }

  return [...counts.values()]
    .toSorted((a, b) => b.n - a.n)
    .slice(0, 3)
    .map(c => `${c.n} ${c.n === 1 ? c.one : c.many}`)
    .join(', ')
}

/**
 * Whether step `id` folds into its turn's settled row. A turn with more than eight
 * finished steps folds the finished steps that open it, all but the latest five,
 * stopping at the first browser call (a browser frame is never cut). Only ever rows
 * above the latest five change; one row alone never folds. Not folded → undefined.
 */
export function foldOf(list: readonly StepLike[], id: string | undefined, isBrowser: (tool: string | undefined) => boolean): Fold | undefined {
  const me = list.find(x => x.id === id)

  if (me === undefined || me.ms === null || me.turn === null) return undefined

  const mine = list.filter(x => x.turn === me.turn)

  if (mine.filter(x => x.ms !== null).length <= FOLD_AFTER) return undefined

  const folded: StepLike[] = []

  for (const x of mine.slice(0, Math.max(0, mine.length - KEEP_LATEST))) {
    if (x.ms === null || isBrowser(x.tool)) break
    folded.push(x)
  }

  if (folded.length < 2 || !folded.some(x => x.id === id)) return undefined

  const wall = wallOf(folded)

  return {
    isAnchor: folded[0]?.id === id,
    count: folded.length,
    summary: foldSummary(folded.map(x => x.tool)),
    failed: folded.filter(x => x.ok === false).length,
    wall
  }
}

/** `◦ 9 earlier steps · 4 reads, 3 edits ……… ok   12s`, exactly `width` cells, dim. */
export function foldRow(fold: Fold, width: number): Part[] {
  const result: Tone = fold.failed > 0 ? { text: `${fold.failed} fail`, color: C.err } : { text: 'ok', color: C.ok }
  const took = fmtDuration(fold.wall)
  const roomWith = (cell: string) => width - DOT_W - vw(result.text) - vw(cell) - 2
  const timeCell = roomWith(timeCellOf(took)) < MIN_TARGET ? '' : timeCellOf(took)
  const room = Math.max(4, roomWith(timeCell))
  const text = clip(`${fold.count} earlier steps${fold.summary.length > 0 ? ` · ${fold.summary}` : ''}`, room)
  const gap = Math.max(2, width - DOT_W - vw(text) - vw(result.text) - vw(timeCell))

  return [
    { t: '◦ ', color: C.dim },
    { t: text, color: C.dim },
    { t: ' '.repeat(gap), color: C.text },
    { t: result.text, color: result.color },
    { t: timeCell, color: C.muted }
  ]
}

// ─── Row layout: exact strings, so nothing can wrap ──────────────────────────

/** Lay a step out in `width` cells: target clipped to whatever the result and time leave. */
/** The time column, `   1m 12s`; '' when there is no time. */
const timeCellOf = (time: string) => (time.length === 0 ? '' : `   ${pad(time, Math.max(TIME_W, vw(time)), 'right')}`)

/**
 * The least room a target keeps before its row gives something up (§4 narrow): the
 * time goes first, and only then does the target clip further.
 */
export const MIN_TARGET = 16

export function layoutStep(step: Step, time: string, width: number) {
  const result = step.result.map(r => r.text).join(' ')
  const roomWith = (t: string) => width - LEAD - vw(result) - vw(timeCellOf(t)) - 2
  const shown = time.length > 0 && roomWith(time) < MIN_TARGET ? '' : time
  const timeCell = timeCellOf(shown)
  const room = Math.max(4, roomWith(shown))
  const target = step.isLabel === true ? clipLabel(step.target, room) : step.isPath ? clipPath(step.target, room) : clip(step.target, room)
  const gap = Math.max(2, width - LEAD - vw(target) - vw(result) - vw(timeCell))

  return {
    verb: pad(step.verb, VERB_W),
    target,
    gap: ' '.repeat(gap),
    timeCell,
    detail: step.detail !== undefined ? clip(step.detail, Math.max(4, width - LEAD)) : undefined
  }
}

/** The same row as Parts (plus its `╰─` detail line), for rows drawn inside a frame. */
export function stepParts(step: Step, time: string, width: number): Part[][] {
  const l = layoutStep(step, time, width)
  const row: Part[] = [
    { t: `${step.dot.text} `, color: step.dot.color },
    { t: l.verb, color: C.muted },
    { t: l.target, color: step.targetColor ?? C.textBright },
    { t: l.gap, color: C.text },
    ...step.result.flatMap((r, i) => [...(i > 0 ? [{ t: ' ', color: C.text }] : []), { t: r.text, color: r.color }]),
    { t: l.timeCell, color: C.muted }
  ]

  return l.detail === undefined
    ? [row]
    : [
        row,
        [
          { t: G.hang, color: C.dim },
          { t: `${' '.repeat(VERB_W)}${l.detail}`, color: C.dim }
        ]
      ]
}

/** Shell output, folded per §5.4: ≤ 3 lines shown whole, else first 2, a fold, the last. */
export function foldOutput(stdout: string): { lines: string[]; more: number; last?: string } | undefined {
  const all = stdout.replace(/\r\n?/g, '\n').trimEnd().split('\n')

  if (all.length === 0 || (all.length === 1 && (all[0] ?? '').trim().length === 0)) return undefined
  if (all.length <= 3) return { lines: all, more: 0 }

  return { lines: all.slice(0, 2), more: all.length - 3, last: all[all.length - 1] ?? '' }
}

// ─── Diff card (§5.5) ────────────────────────────────────────────────────────

/**
 * Top edge `+┄┄ [ title · +a −r ] ┄…┄ meta +` in exactly `width` cells:
 * fixed parts take 12 (15 with the ` · ` before counts), the path clips at
 * folder boundaries, the ┄ run takes the rest.
 */
export function diffTop(width: number, path: string, parts: Tone[], meta: string) {
  const counts = parts.length > 0 ? 3 + vw(parts.map(p => p.text).join(' ')) : 0
  const fixed = 12 + counts + vw(meta)
  const title = clipPath(path, Math.max(4, width - fixed - 2))
  const fill = Math.max(2, width - fixed - vw(title))

  return { title, fill, total: fixed + vw(title) + fill }
}
export type DiffRow = { kind: 'add' | 'del' | 'ctx' | 'gap'; no: number | undefined; text: string }

export function diffRows(output: unknown): { path: string; rows: DiffRow[]; adds: number; dels: number } | undefined {
  const o = obj(output)
  const path = s(o?.['filePath'])
  const patch = o?.['structuredPatch']

  if (o === undefined || path === undefined || !Array.isArray(patch)) return undefined

  const rows: DiffRow[] = []

  if (patch.length === 0) {
    // A created file: every line is new.
    const content = s(o['content'])

    if (content === undefined) return undefined

    content
      .replace(/\n$/, '')
      .split('\n')
      .forEach((t, k) => rows.push({ kind: 'add', no: k + 1, text: t }))

    return { path, rows, adds: rows.length, dels: 0 }
  }

  let adds = 0
  let dels = 0

  patch.forEach((h, hi) => {
    const hunk = obj(h)
    const lines = hunk?.['lines']
    let oldNo = num(hunk?.['oldStart']) ?? 0
    let newNo = num(hunk?.['newStart']) ?? 0

    if (!Array.isArray(lines)) return
    if (hi > 0) rows.push({ kind: 'gap', no: undefined, text: '' })

    for (const l of lines) {
      if (typeof l !== 'string') continue

      const body = l.slice(1)

      if (l.startsWith('+')) {
        rows.push({ kind: 'add', no: newNo++, text: body })
        adds++
      } else if (l.startsWith('-')) {
        rows.push({ kind: 'del', no: oldNo++, text: body })
        dels++
      } else if (l.startsWith('\\')) {
        continue
      } else {
        rows.push({ kind: 'ctx', no: newNo++, text: body })
        oldNo++
      }
    }
  })

  return rows.length > 0 ? { path, rows, adds, dels } : undefined
}
