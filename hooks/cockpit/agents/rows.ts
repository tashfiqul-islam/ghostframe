// Cockpit's `[ AGENTS ]` rows (spec E.40, E.37): one row per agent in launch order, nested agents inset under
// their parent, and the label's counts. Pure: hooks/cockpit/head.ts fits them into the pane.
import type { RosterAgent } from '../../../types'
import { fitParts } from '../../shared/parts'
import type { Part } from '../../shared/parts'
import { vw } from '../../shared/text'
import { formatSpan } from '../../shared/time'
import { C } from '../../shared/tokens'
import { shownStep } from './roster'
import { cut, sectionLabel } from '../steps/rows'

/** How much of `[ AGENTS ]` the pane has room for (E.37's ladder): every row, the agents not done, or the label. */
export type AgentsLevel = 'full' | 'running' | 'label'

const CAP = 7 // top-level rows; a nested agent rides with its parent and does not count (E.40)

const spaces = (n: number) => ' '.repeat(Math.max(0, n))

/** An agent's depth: 1 for one the main loop (or an agent not in the roster) launched, 2 for its child, and so on. */
function depthOf(a: RosterAgent, byId: ReadonlyMap<string, RosterAgent>): number {
  let depth = 1
  let parent = a.parent === null ? undefined : byId.get(a.parent)

  while (parent !== undefined && depth < 50) {
    depth += 1
    parent = parent.parent === null ? undefined : byId.get(parent.parent)
  }

  return depth
}

/** The roster as drawn: each top-level agent, then its children; deeper agents counted on their level-2 ancestor. */
function tree(roster: readonly RosterAgent[]): { agent: RosterAgent; depth: number; deeper: number }[] {
  const byId = new Map(roster.map(a => [a.id, a]))
  const depth = new Map(roster.map(a => [a.id, depthOf(a, byId)]))
  const ancestorAt2 = (a: RosterAgent): string | undefined => {
    let at: RosterAgent | undefined = a

    while (at !== undefined && (depth.get(at.id) ?? 1) > 2) at = at.parent === null ? undefined : byId.get(at.parent)

    return at?.id
  }
  const deeper = new Map<string, number>()

  for (const a of roster) {
    const id = (depth.get(a.id) ?? 1) > 2 ? ancestorAt2(a) : undefined

    if (id !== undefined) deeper.set(id, (deeper.get(id) ?? 0) + 1)
  }

  return roster
    .filter(a => depth.get(a.id) === 1)
    .flatMap(top => [top, ...roster.filter(c => c.parent === top.id)])
    .map(agent => ({ agent, depth: depth.get(agent.id) ?? 1, deeper: deeper.get(agent.id) ?? 0 }))
}

/** One agent's row, exactly `width` cells: `◇ name  kind  subject … steps · time`. */
function agentRow(a: RosterAgent, depth: number, deeper: number, now: number, width: number): Part[] {
  const isWide = width >= 56
  const nameW = (width >= 72 ? 22 : isWide ? 18 : 16) - (depth > 1 ? 2 : 0)
  const isDone = a.state === 'done'
  const isFailed = a.state === 'failed'
  const glyph: Part = isFailed ? { t: '✕', color: C.err } : { t: '◇', color: isDone ? C.dim : C.agent }
  const name = cut(a.name, nameW)
  const step = shownStep(a, now)
  const subject = step.subject + (deeper > 0 ? ` +${deeper} nested` : '')
  // The kind slot is 8 cells for a running agent's kind and 7 for `done` and `failed`, as E.40 draws them.
  const mid: Part[] = isFailed
    ? [{ t: 'failed ', color: C.err, bold: true }, ...(isWide ? [{ t: subject, color: C.muted }] : [])]
    : isDone
      ? [{ t: 'done   ', color: C.dim }, ...(isWide ? [{ t: subject, color: C.dim }] : [])]
      : [{ t: step.kind.padEnd(7).slice(0, 7), color: C.muted }, ...(isWide ? [{ t: ` ${subject}`, color: C.text }] : [])]
  const time = formatSpan(Math.max(0, (a.endedAt ?? now) - a.startedAt))
  const right = `${String(a.steps).padStart(3)} · ${time.padStart(7)}`
  const left: Part[] = [
    ...(depth > 1 ? [{ t: '  ', color: C.muted }] : []),
    glyph,
    { t: ' ', color: C.muted },
    { t: name + spaces(nameW - vw(name)), color: isDone ? C.muted : isFailed ? C.text : C.agent },
    { t: ' ', color: C.muted },
    ...mid
  ]

  return [...fitParts(left, Math.max(0, width - vw(right) - 1)), { t: ` ${right}`, color: C.dim }]
}

/** `1 failed · 5 running · 1 done · 1 nested`: failed first, so the narrowest label keeps it (E.40 *Label rule*). */
function labelMeta(drawn: ReturnType<typeof tree>, roster: readonly RosterAgent[]): Part[] {
  const failed = roster.filter(a => a.state === 'failed').length
  const running = drawn.filter(d => d.depth === 1 && d.agent.state === 'running').length
  const done = roster.filter(a => a.state === 'done').length
  const nested = roster.length - drawn.filter(d => d.depth === 1).length
  const rest = [...(running > 0 ? [`${running} running`] : []), ...(done > 0 ? [`${done} done`] : []), ...(nested > 0 ? [`${nested} nested`] : [])].join(' · ')

  return [
    ...(failed > 0 ? [{ t: `${failed} failed`, color: C.err }] : []),
    ...(failed > 0 && rest.length > 0 ? [{ t: ' · ', color: C.muted }] : []),
    ...(rest.length > 0 ? [{ t: rest, color: C.muted }] : [])
  ]
}

/**
 * `[ AGENTS ]`: the label, then a row per agent at the level the pane has room for: at most 7 top-level agents,
 * then `… n more`. A row never moves; done and failed agents keep their time frozen.
 * @param roster the agents, in launch order
 * @param now the wall clock in ms, for a running agent's time
 * @param width the pane's body columns
 * @param level how much fits
 * @returns one Part list per row; none for an empty roster
 */
export function agentRows(roster: readonly RosterAgent[], now: number, width: number, level: AgentsLevel = 'full'): Part[][] {
  if (roster.length === 0) return []

  const drawn = tree(roster)
  const label = sectionLabel('AGENTS', labelMeta(drawn, roster), width)

  if (level === 'label') return [label]

  const shown = level === 'running' ? drawn.filter(d => d.agent.state !== 'done') : drawn
  const tops = shown.filter(d => d.depth === 1)
  const lastTop = tops[Math.min(tops.length, CAP) - 1]
  let end = lastTop === undefined ? 0 : shown.indexOf(lastTop) + 1

  while (shown[end] !== undefined && (shown[end]?.depth ?? 1) > 1) end += 1

  const more = tops.length - CAP
  const moreRow = (n: number): Part[] => {
    const t = `  … ${n} more`

    return [{ t: t + spaces(width - vw(t)), color: C.dim }]
  }

  return [label, ...shown.slice(0, end).map(d => agentRow(d.agent, d.depth, d.deeper, now, width)), ...(more > 0 ? [moreRow(more)] : [])]
}
