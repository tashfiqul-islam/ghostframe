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

/** A row with its clock on the right edge, exactly `width` cells; no clock, no padding. */
function edgeRow(parts: readonly Part[], clock: string, width: number): Part[] {
  if (clock.length === 0) return [...parts]

  const room = width - CLOCK_W - 1
  const used = parts.reduce((n, p) => n + vw(p.t), 0)
  const fitted = used <= room ? [...parts] : [{ t: cut(parts.map(p => p.t).join(''), room), color: parts[0]?.color ?? C.text }]
  const w = fitted.reduce((n, p) => n + vw(p.t), 0)

  return [...fitted, { t: spaces(width - w - vw(clock)) + clock, color: C.muted }]
}

const STATE = { done: { color: C.muted, bold: false }, failed: { color: C.err, bold: true }, interrupted: { color: C.warn, bold: false } } as const

/**
 * The receipt (E.32, amendment 3: the state word, no turn number) and, above it, a `still failing` row for each
 * failure nothing fixed (E.5), each at the clock of its failure. An interrupted turn has none (correction G).
 * @param receipt the turn's receipt
 * @param width the rule's width
 * @returns the rows, top to bottom
 */
export function receiptRows(receipt: Receipt, width: number): Part[][] {
  if (receipt.state === 'interrupted') return []

  const open = receipt.open.length
  const exceptions =
    receipt.failures === 0
      ? []
      : open === 0
        ? [`${plural(receipt.failures, 'failure')} → fixed`]
        : [plural(open, 'failure'), ...(receipt.fixed > 0 ? [`${receipt.fixed} fixed`] : [])]
  const meta = [
    ...(receipt.steps > 0 ? [plural(receipt.steps, 'step')] : []),
    ...exceptions,
    ...(receipt.files > 0 ? [plural(receipt.files, 'file')] : []),
    // The turn made a commit: its short hash, the one thing a later turn may want to find again.
    ...(receipt.commit.length > 0 ? [`± ${receipt.commit}`] : [])
  ].join(' · ')
  const time = formatSpan(receipt.durationMs)
  const tail = meta.length > 0 ? ` ${meta} · ` : ' '
  const state = STATE[receipt.state]
  const lead = `─ ${receipt.state} `
  const fill = width - vw(lead) - vw(tail) - vw(time)

  const still = receipt.open.map(f =>
    edgeRow(
      [
        { t: '✕ ', color: C.err },
        { t: 'still failing', color: C.err, bold: true },
        { t: ` · ${f.kind} · ${f.subject} · ${f.result}`, color: C.text }
      ],
      formatSpan(f.clock),
      width
    )
  )

  return [
    ...still,
    [
      { t: '─ ', color: C.rule },
      { t: receipt.state, color: state.color, ...(state.bold ? { bold: true } : {}) },
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
