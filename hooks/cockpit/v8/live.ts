// The left's live area (spec 7.11, 9.3, screens 02, 04, 31): the live line, or the `NEEDS YOU` row while the turn waits
// on the person, or the `WAITING` row while it waits on the API; in fallback the running steps and the to-do in
// progress as branches under it. Pure: cockpit/left.tsx draws what this returns.
import { waitingOn } from '../agents/roster'
import type { RosterAgent, StepLog, TodoItem } from '../../../types'
import type { Part } from '../../shared/parts'
import { textCells } from '../../shared/look/spine'
import { needsYouRow, waitingRow } from './events'
import { branchRow, liveRows } from './left'
import { count } from '../../shared/look/format'
import { TOKEN } from '../../shared/look/palette'

/** A pause the engine's spinner names (rate limit, API retry), which the live line says as `WAITING` (7.10). */
const PAUSE = /rate.?limit|overloaded|retry|retrying/i

/**
 * The live area's rows.
 * @param log the turn's log
 * @param roster the agents
 * @param todo the to-do list
 * @param now the wall clock
 * @param frame the spinner's frame
 * @param columns the left region's columns
 * @param isFallback whether no pane is docked (the branches show)
 * @param message the engine's spinner message, when it names a pause
 * @returns the rows, top to bottom
 */
export function liveArea(
  log: StepLog,
  roster: readonly RosterAgent[],
  todo: readonly TodoItem[],
  now: number,
  frame: number,
  columns: number,
  isFallback: boolean,
  message?: string | null
): Part[][] {
  const width = textCells(columns, !isFallback)
  // One clock (13.9): the typed turn's own start, the time its one receipt will show.
  const elapsed = log.startedAt === null ? 0 : Math.max(0, now - log.startedAt)
  const asked = log.steps.find(s => s.isRunning && log.asking.includes(s.id))

  if (asked !== undefined) return [needsYouRow(elapsed, { kind: asked.kind, subject: asked.subject }, width)]
  // WAITING is for the API alone: a rate limit or a retry (7.10).
  if (message !== undefined && message !== null && PAUSE.test(message)) return [waitingRow(elapsed, [{ t: message, color: TOKEN.dim }], width)]

  const running = roster.filter(a => a.state === 'running' && a.parent === null).length
  const steps = log.steps.length + log.dropped
  // Claude answered and its background agents still run: the turn is not over, and its receipt waits for them (7.12).
  // Counted as the receipt counts them (`waitingOn`): the background agents still running.
  const waiting = waitingOn(roster)
  const isWaitingOnAgents = !log.isTurnRunning && waiting > 0
  const said = isWaitingOnAgents
    ? `Waiting on ${count(waiting, 'agent')}`
    : log.said.length > 0
      ? log.said.replace(/[.!?…:]+$/, '')
      : steps === 0
        ? 'Thinking'
        : 'Working'
  const rows = liveRows({ elapsedMs: elapsed, frame, sentence: said, agents: running, steps }, width)

  if (!isFallback) return rows

  const doing = log.steps.filter(s => s.isRunning && s.kind !== 'agent').map(s => ({ kind: s.kind, subject: s.subject, state: 'running' }))
  const done = todo.filter(t => t.state === 'completed').length
  const current = todo.find(t => t.state === 'in_progress')
  const branches = [...doing, ...(current === undefined ? [] : [{ kind: 'todo', subject: current.text, state: `${done} of ${todo.length}` }])]

  return [...rows, ...branches.map((b, i) => branchRow(b.kind, b.subject, b.state, i === branches.length - 1, width))]
}
