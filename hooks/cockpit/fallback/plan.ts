// Where fallback's capsules fall in a typed turn, worked out from the turn's own data each time a row draws (spec
// E.3, E.47; amendment 10): the flow of its blocks and calls, its steps and when each started. A row never asks what
// was drawn before it, so the same row draws the same capsule docked, in fallback, after a resize, a resume or a
// reload, and a finished turn gains its capsules when the pane leaves. Pure: draw.tsx draws what this returns.
import type { FlowStamp, LogStep } from '../../../types'
import { isNarrationAt } from '../../shared/flow'
import { isTurnFailure } from '../steps/log'
import { capsuleOf } from './capsule'
import type { Capsule } from './capsule'

/** Five minutes with no new row on the left and a step starts: that step's row draws a capsule (E.3 case 2). */
export const SILENT_MS: number = 5 * 60_000

/** One typed turn's facts: its engine turns, its steps (as the log or history keeps them), and when each step started. */
export type TurnFacts = {
  turns: readonly string[]
  steps: readonly LogStep[]
  /** A step's start on the turn clock (ms), when its detail is kept. */
  startOf: (id: string) => number | undefined
  /** The engine turns that ended with no answer row: their footer draws the capsule (E.3 case 3). */
  silentTurns: ReadonlySet<string>
}

/** Where a capsule is drawn: above a block of text that stays, on a call's site, or in a turn's footer. */
export const textAnchor = (key: string): string => `text:${key}`
export const callAnchor = (id: string): string => `call:${id}`
export const footerAnchor = (turn: string): string => `footer:${turn}`

/** A typed turn's capsules, by anchor, and the calls whose site draws an event row (a failure, a push). */
export type Plan = { capsules: ReadonlyMap<string, Capsule>; events: ReadonlySet<string> }

/** Whether a settled step draws an event row on the left: a failure the turn answers for, or something published. */
const isEvent = (s: LogStep): boolean => !s.isRunning && (isTurnFailure(s) || s.mark === '↗')

/**
 * Walks a typed turn's flow in order and closes a stretch of steps at each of E.3's three moments: a block of text
 * that stays (not narration), a call that starts after five minutes with no new row on the left, and the end of an
 * engine turn that wrote no text. Each capsule counts its stretch against the steps up to its end only, so a later
 * fix never changes it.
 * shortcut: a step past the log's cap (`dropped`) is not in `steps` and is not counted; seed it from the flow if a
 * 300-step turn's capsule shows it.
 * @param flow the session's flow, in stored order
 * @param facts the typed turn's facts
 * @returns the plan
 */
export function planTurn(flow: readonly FlowStamp[], facts: TurnFacts): Plan {
  const capsules = new Map<string, Capsule>()
  const events = new Set<string>()
  const mine = new Set(facts.turns)
  const at = (id: string) => facts.steps.findIndex(s => s.id === id || s.calls?.includes(id) === true)
  const seen = new Set<number>()
  let pending: number[] = []
  let lastRow = 0

  const close = (anchor: string) => {
    if (pending.length === 0) return

    const from = Math.min(...pending)
    const to = Math.max(...pending) + 1
    const capsule = capsuleOf(facts.steps.slice(0, to), from, to)

    if (capsule !== undefined) capsules.set(anchor, capsule)

    lastRow = Math.max(lastRow, capsule?.clock ?? 0)
    pending = []
  }

  const entries = flow.flatMap((f, i) => (f.turn !== null && mine.has(f.turn) ? [{ f, i }] : []))

  entries.forEach(({ f, i }, k) => {
    if (f.kind === 'tool') {
      const index = at(f.key)
      const step = facts.steps[index]

      if (step !== undefined && !seen.has(index)) {
        seen.add(index)
        const start = facts.startOf(step.id)

        if (start !== undefined && start - lastRow >= SILENT_MS) close(callAnchor(f.key))

        pending.push(index)

        if (isEvent(step)) {
          events.add(f.key)
          lastRow = Math.max(lastRow, step.clock)
        }
      }
    } else if (!isNarrationAt(flow, i)) {
      close(textAnchor(f.key))
    }

    const next = entries[k + 1]

    if (f.turn !== null && next?.f.turn !== f.turn && facts.silentTurns.has(f.turn)) close(footerAnchor(f.turn))
  })

  return { capsules, events }
}

/**
 * Whether a row comes right after an event row on the left (C.2: then no blank row above it): the nearest earlier row
 * of its engine turn that draws anything is a call that drew an event row. Narration and quiet calls draw nothing.
 * @param flow the session's flow
 * @param index the row's place in the flow (its length for a row not stored yet: the newest)
 * @param turn the row's engine turn
 * @param plan its typed turn's plan
 * @returns whether it does
 */
export function isAfterEventAt(flow: readonly FlowStamp[], index: number, turn: string, plan: Plan): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const f = flow[i]

    if (f === undefined || f.turn !== turn) return false
    if (f.kind === 'tool') {
      if (plan.events.has(f.key)) return true
      if (plan.capsules.has(callAnchor(f.key))) return false
    } else if (!isNarrationAt(flow, i)) return false
  }

  return false
}
