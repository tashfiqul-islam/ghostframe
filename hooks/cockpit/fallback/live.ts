// Fallback's live area (spec E.33, E.13, E.14, H.1, H.3): with no pane, the whole of it sits above the prompt: the
// now-row (the spinner, the kind word of the step and its subject, `step n · its time · the turn's time`), the
// `[ AGENTS ]` roster, and the to-do in progress. At most 9 rows; finished agents collapse first. Pure: draw.tsx
// draws what `liveRows` returns.
import type { RosterAgent, StepLog, TodoItem } from '../../../types'
import { fitParts } from '../../shared/parts'
import type { Part } from '../../shared/parts'
import { vw } from '../../shared/text'
import { formatSpan } from '../../shared/time'
import { C } from '../../shared/tokens'
import { agentRows } from '../agents/rows'
import { FRAMES } from '../head'
import { KIND_W } from '../steps/kinds'

const ROWS_MAX = 9 // v6's band: at most this many rows above the prompt

const spaces = (n: number) => ' '.repeat(Math.max(0, n))
// A live clock: hidden for its first second (H.2), as in the pane.
const since = (now: number, at: number | null) => (at === null || now - at < 1_000 ? '' : formatSpan(now - at))

/** What the now-row says when no step runs (H.3): the moment, its subject, and whether its own time shows. */
const MOMENT: Record<string, [string, string, boolean]> = {
  thinking: ['thinking', '', true],
  requesting: ['waiting', '', false],
  responding: ['writing', 'the answer', false],
  'tool-input': ['tool', 'preparing…', false],
  'tool-use': ['tool', 'preparing…', false]
}

/**
 * The now-row (H.3, fallback column): the spinner, a kind word (the step's, or the moment's) and its subject, and on
 * the right `step n · the step's time · the turn's time`; the turn's time alone when no step runs, after a thinking
 * stretch's own time. Exactly `width` cells.
 */
function nowRow(log: StepLog, now: number, frame: number, width: number): Part[] {
  const running = log.steps.filter(s => s.isRunning && s.kind !== 'agent')
  const first = running[0]
  const turn = since(now, log.segmentStart)
  const glyph = FRAMES[frame % FRAMES.length] ?? FRAMES[0] ?? ''
  let kind: string
  let subject: string
  let right: string[]

  if (first !== undefined && log.startedAt !== null) {
    kind = first.kind
    subject = first.subject + (running.length > 1 ? ` +${running.length - 1}` : '')
    right = [`step ${log.dropped + log.steps.indexOf(first) + 1}`, since(now, log.startedAt + first.clock), turn]
  } else {
    const [word, what, timed] = MOMENT[log.mode ?? 'requesting'] ?? ['waiting', '', false]
    const isFirst = log.steps.length + log.dropped === 0 && word === 'waiting'

    kind = word
    subject = isFirst ? 'for the first token' : what
    right = [timed ? since(now, log.modeSince) : '', turn]
  }

  const meta = right.filter(r => r.length > 0).join(' · ')
  const lead: Part[] = [
    { t: `${glyph} `, color: C.accent },
    { t: kind.padEnd(KIND_W - 1).slice(0, KIND_W - 1), color: C.muted },
    { t: ' ', color: C.muted },
    { t: subject, color: C.textBright }
  ]
  const room = width - vw(meta) - (meta.length > 0 ? 2 : 0)
  const fitted = fitParts(lead, Math.max(0, room))
  const used = fitted.reduce((w, p) => w + vw(p.t), 0)

  return [...fitted, { t: spaces(width - used - vw(meta)) + meta, color: C.muted }]
}

/** `▸ [>] the item in progress … 5 of 7` (E.14): one row, or none when the list is empty or all done. */
function todoRow(items: readonly TodoItem[], width: number): Part[][] {
  const done = items.filter(i => i.state === 'completed').length

  if (items.length === 0 || done === items.length) return []

  const current = items.find(i => i.state === 'in_progress') ?? items.find(i => i.state !== 'completed')
  const count = `${done} of ${items.length}`
  const item = fitParts(
    [
      { t: '▸ ', color: C.accent },
      { t: `[>] ${current?.text ?? ''}`, color: C.textBright }
    ],
    Math.max(0, width - vw(count) - 2)
  )
  const used = item.reduce((w, p) => w + vw(p.t), 0)

  return [[...item, { t: spaces(width - used - vw(count)) + count, color: C.muted }]]
}

/**
 * The live area in fallback, top to bottom: the now-row, the roster (its label and a row per agent; finished agents
 * collapse first, then the oldest give way to `… n more`), and the to-do in progress, at most 9 rows.
 * @param log the turn's log
 * @param roster the agents
 * @param todo the to-do list
 * @param now the wall clock in ms
 * @param frame the spinner's frame count
 * @param width the band's width: the terminal less the engine's mark at its end
 * @returns one Part list per row
 */
export function liveRows(log: StepLog, roster: readonly RosterAgent[], todo: readonly TodoItem[], now: number, frame: number, width: number): Part[][] {
  const doing = todoRow(todo, width)
  const room = ROWS_MAX - 1 - doing.length
  const full = agentRows(roster, now, width)
  const agents =
    full.length <= room
      ? full
      : agentRows(roster, now, width, 'running').length <= room
        ? agentRows(roster, now, width, 'running')
        : agentRows(roster, now, width, 'running', room - 2)

  return [nowRow(log, now, frame, width), ...agents, ...doing]
}
