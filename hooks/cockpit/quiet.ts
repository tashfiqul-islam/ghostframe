// Cockpit's quiet left (spec E.1, E.5, E.32; amendment 3; correction G): while the pane is docked the transcript
// keeps the conversation and three kinds of row only: `↗` when something left the machine, `✕ still failing`
// for a failure nothing fixed, and the receipt. Pure: hooks/cockpit/left.tsx draws what these return.
import type { Receipt } from '../../types'
import { isShipCommand, parseShip, shellText } from '../shared/calls/ships'
import type { Part } from '../shared/parts'
import { vw } from '../shared/text'
import { formatSpan } from '../shared/time'
import { C } from '../shared/tokens'
import { cut } from './steps/rows'

const spaces = (n: number) => ' '.repeat(Math.max(0, n))
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const CLOCK_W = 7

/** A receipt's counts, between the rule's fill and its time. */
const tailOf = (kept: readonly [string, number][]) => (kept.length > 0 ? ` ${kept.map(([t]) => t).join(' · ')} · ` : ' ')

/** A row with its clock on the right edge, exactly `width` cells; no clock, no padding. */
export function edgeRow(parts: readonly Part[], clock: string, width: number): Part[] {
  if (clock.length === 0) return [...parts]

  const room = width - CLOCK_W - 1
  const used = parts.reduce((n, p) => n + vw(p.t), 0)
  const fitted = used <= room ? [...parts] : [{ t: cut(parts.map(p => p.t).join(''), room), color: parts[0]?.color ?? C.text }]
  const w = fitted.reduce((n, p) => n + vw(p.t), 0)

  return [...fitted, { t: spaces(width - w - vw(clock)) + clock, color: C.muted }]
}

const STATE = {
  done: { color: C.muted, bold: false },
  failed: { color: C.err, bold: true },
  interrupted: { color: C.warn, bold: false },
  waiting: { color: C.agent, bold: false }
} as const

/**
 * The receipt (E.32, amendment 3: the state word, no turn number) and, above it, a `still failing` row for each
 * failure nothing fixed (E.5), each at the clock of its failure. An interrupted turn has none (correction G).
 * In fallback (E.32) the capsule already said the steps, so the receipt does not unless the turn drew more than one
 * capsule; and each failure drew its row when it happened, so no `still failing` row repeats it. Narrow, fields
 * drop in E.32's order (the commit first, then sources, files, agents, steps); the exceptions, the state word and
 * the time always stay.
 * @param receipt the turn's receipt
 * @param width the rule's width
 * @param fallback the turn's capsules, when the receipt is drawn in fallback
 * @returns the rows, top to bottom
 */
export function receiptRows(receipt: Receipt, width: number, fallback?: { capsules: number }): Part[][] {
  if (receipt.state === 'interrupted') return []

  const open = receipt.open.length
  const exceptions =
    receipt.failures === 0
      ? []
      : open === 0
        ? [`${plural(receipt.failures, 'failure')} → fixed`]
        : [plural(open, 'failure'), ...(receipt.fixed > 0 ? [`${receipt.fixed} fixed`] : [])]
  // A turn still waiting on its agents names them in its state word: said once.
  const launched = receipt.state === 'waiting' ? 0 : (receipt.launched ?? 0)
  const pages = receipt.sources ?? 0
  const isStepsSaid = fallback !== undefined && fallback.capsules <= 1
  // Each field with the rank it drops at when the row is too narrow: higher goes first; 0 never goes.
  const fields: [string, number][] = [
    // A turn with no steps of its own says so: it never borrows another turn's count.
    ...(isStepsSaid ? [] : [[receipt.steps > 0 ? plural(receipt.steps, 'step') : 'no steps', 1] as [string, number]]),
    ...exceptions.map(e => [e, 0] as [string, number]),
    ...(launched > 0 ? [[plural(launched, 'agent'), 2] as [string, number]] : []),
    ...(receipt.files > 0 ? [[plural(receipt.files, 'file'), 3] as [string, number]] : []),
    ...(pages > 0 ? [[plural(pages, 'source'), 4] as [string, number]] : []),
    // The turn made a commit: its short hash, the one thing a later turn may want to find again.
    ...(receipt.commit.length > 0 ? [[`± ${receipt.commit}`, 5] as [string, number]] : [])
  ]
  const time = formatSpan(receipt.durationMs)
  const state = STATE[receipt.state]
  // Background agents still running when the turn ended: `waiting · 3 agents` (E.32), as it was when drawn.
  const word = receipt.state === 'waiting' ? `waiting · ${plural(receipt.agents, 'agent')}` : receipt.state
  const lead = `─ ${word} `
  let kept = fields

  while (vw(lead) + 2 + vw(tailOf(kept)) + vw(time) > width && kept.some(([, rank]) => rank > 0)) {
    const top = Math.max(...kept.map(([, rank]) => rank))

    kept = kept.filter(([, rank]) => rank !== top)
  }

  const tail = tailOf(kept)
  const fill = width - vw(lead) - vw(tail) - vw(time)

  // A result that only repeats the subject (`exit 3`) is said once.
  const still = (fallback !== undefined ? [] : receipt.open).map(f =>
    edgeRow(
      [
        { t: '✕ ', color: C.err },
        { t: 'still failing', color: C.err, bold: true },
        { t: ` · ${f.kind} · ${f.subject}${f.result === f.subject || f.result.length === 0 ? '' : ` · ${f.result}`}`, color: C.text }
      ],
      formatSpan(f.clock),
      width
    )
  )

  return [
    ...still,
    [
      { t: '─ ', color: C.rule },
      { t: word, color: state.color, ...(state.bold ? { bold: true } : {}) },
      { t: ` ${'─'.repeat(Math.max(1, fill))}`, color: C.rule },
      { t: tail, color: C.muted },
      { t: time, color: C.text }
    ]
  ]
}

/** One call of a folded tool group, as the `ToolGroup` site carries it. */
export type GroupCall = { tool_use_id?: string | undefined; tool: string; input: unknown; output?: unknown; isErrored: boolean }

const commandOf = (input: unknown) => {
  const c = typeof input === 'object' && input !== null && 'command' in input ? input.command : undefined

  return typeof c === 'string' ? (c.split('\n')[0] ?? '').trim() : ''
}

/**
 * The `↗` rows of a folded tool group (E.5): a push, and a pull request with its URL on a detail row. A commit
 * leaves no row: E.5 makes `±` a pane mark only.
 * @param calls the group's calls
 * @param clockOf the turn clock (ms) of a call, when the step log has it
 * @param width the rule's width
 * @returns the rows, top to bottom
 */
export function shipRows(calls: readonly GroupCall[], clockOf: (id: string) => number | undefined, width: number): Part[][] {
  return calls.flatMap(c => {
    const command = commandOf(c.input)

    if (c.isErrored || (c.tool !== 'Bash' && c.tool !== 'PowerShell') || !isShipCommand(command)) return []

    const ship = parseShip(c.tool_use_id ?? '', command, shellText(c.output))
    const at = c.tool_use_id === undefined ? undefined : clockOf(c.tool_use_id)
    const clock = at === undefined ? '' : formatSpan(at)
    const rows: Part[][] = []

    if (ship?.push !== undefined) {
      rows.push(
        edgeRow(
          [
            { t: '↗ ', color: C.accent },
            { t: `pushed ${ship.push.to}`, color: C.text }
          ],
          clock,
          width
        )
      )
    }

    if (ship?.pr !== undefined) {
      rows.push(
        edgeRow(
          [
            { t: '↗ ', color: C.accent },
            { t: `PR #${ship.pr.n} opened`, color: C.text }
          ],
          clock,
          width
        ),
        [
          { t: '    ', color: C.muted },
          { t: cut(ship.pr.url, width - 4), color: C.link }
        ]
      )
    }

    return rows
  })
}
