import type { Tone } from '../../shared/calls/results'
import type { Part } from '../../shared/parts'
import { clip, vw } from '../../shared/text'
import { fmtDuration } from '../../shared/time'
import { C } from '../../shared/tokens'
import { MIN_TARGET, timeCellOf } from './row'
import { wallOf } from './rule'
import type { StepLike } from './rule'
import { DOT_W } from './steps'

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
