// The main loop's turns, observed: a typed prompt's stamp (`prompt.submit`), the turn's start and end
// (`turn.start`, `turn.complete`), and the thinking time before each block (`turn.step`).
import type { EngineInterface, On } from 'claude-code'

import { logMode, logTurnEnd, logTurnStart, readLog } from '../../cockpit/log'
import { isOn, noticeSink } from '../../cockpit/switch'
import { readFlow } from '../../shared/flow'
import { NO_CAPS, NO_TALLY, tallyText } from '../live'
import { openRunBefore } from '../browser'
import { answerRowOf, sessionCwd } from './session'
import type { PromptStamp } from '../../../types'
import {
  isSameText,
  keepPrompts,
  stampText,
  readPrompts,
  readTally,
  takePending,
  updateAwaitingFirst,
  updateCaps,
  updateCloses,
  updatePrompts,
  updateStreaming,
  updateTally,
  updateTurn
} from './state'

// The stamp of the prompt submitted last: its turn rule is the next one the engine draws.
let lastSubmitted: number | undefined
// The same stamp, until a main-loop turn takes it as its start (Cockpit's turn clock). A prompt typed over a running
// turn is not one: it waits, and is delivered into that turn or starts its own after it (E.20, amendment 12).
let unclaimedSubmit: number | undefined
// The main-loop turn that completed last: its footer row is the next one the engine draws.
let lastClosed: string | undefined

/**
 * The stamp of the prompt submitted last.
 * @returns its wall-clock ms, or undefined before the first
 */
export function lastSubmittedAt(): number | undefined {
  return lastSubmitted
}

/**
 * The main-loop turn that completed last.
 * @returns its id, or undefined before the first
 */
export function lastClosedTurn(): string | undefined {
  return lastClosed
}

/**
 * Whether a prompt typed over a running turn is about to start its own: that turn ended (or the prompt's own row is
 * stored) and it was never delivered into it.
 * @param s the stamp
 * @returns whether it is
 */
const isQueuedStart = (s: PromptStamp): boolean =>
  s.over !== undefined && s.steerMs === undefined && s.turnNo === undefined && (s.row !== undefined || s.over === lastClosed)

/**
 * Whether a stamp's turn is about to start: the prompt submitted while the session was idle, or one that waited
 * behind the running turn and now starts its own. Its rule shows the next number before the turn takes it.
 * @param s the stamp
 * @returns whether it is
 */
export function isPendingStart(s: PromptStamp): boolean {
  return s.turnNo === undefined && (s.at === unclaimedSubmit || isQueuedStart(s))
}

/**
 * Whether a row has left the main conversation: `$.session.messages` reads on from no row that was cleared, rewound or
 * left behind a compaction.
 * @param $ the engine interface
 * @param row the row's id
 * @returns whether it has
 */
async function isGone($: EngineInterface, row: string): Promise<boolean> {
  const after = await $.session.messages({ after: row })

  return !Array.isArray(after)
}

/**
 * A typed turn started (amendment 12): its prompt's stamp takes the step log's turn number, and what came right
 * before it: a resume or a compaction noted since the last typed turn, else a rewind when the previous typed
 * prompt's row has left the conversation. Kept in the store, so a resumed transcript draws the same rule.
 * @param $ the engine interface
 * @param isIt whether a stamp is the turn's prompt's
 */
async function numberTurn($: EngineInterface, isIt: (s: PromptStamp) => boolean): Promise<void> {
  const turnNo = (await readLog($)).turnNo
  const list = await readPrompts($)
  const i = list.findLastIndex(isIt)
  // The previous typed turn's row: a steer's row is a delivery, never a turn's.
  const prev = list.slice(0, Math.max(0, i)).findLast(s => s.row !== undefined && s.turnNo !== undefined)?.row
  const after = (await takePending($)) ?? (prev !== undefined && (await isGone($, prev)) ? 'rewind' : undefined)
  const next = await updatePrompts($, l => {
    const at = l.findLastIndex(isIt)

    return at < 0 ? l : l.with(at, { ...l[at]!, turnNo, ...(after === undefined ? {} : { after }) })
  })

  await keepPrompts($, next)
}

/**
 * Adds the turn observe hooks: `turn.start`, `prompt.submit`, `turn.complete` and `turn.step`.
 * @param on the `on` that `register` receives
 */
export function registerTurns(on: On): void {
  // The main loop's current turn, so each step knows which activity it joins.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await updateTurn($, () => e.turnId)
      await updateStreaming($, () => true)

      // A prompt typed over the last turn and never delivered into it starts this one, by its text (live: the
      // engine stores it as typed and starts its turn, with no second submit).
      const submitted = unclaimedSubmit
      const queued = submitted === undefined ? (await readPrompts($)).find(s => isQueuedStart(s) && isSameText(s.text, e.text)) : undefined
      const start = submitted ?? queued?.at
      const isIt = (s: PromptStamp) =>
        queued === undefined ? s.at === submitted && s.over === undefined : s.at === queued.at && s.over === queued.over && s.text === queued.text

      try {
        // A turn no prompt was typed for (an agent's report, a notice) carries on the typed turn before it.
        await logTurnStart($, e.turnId, start, sessionCwd())
      } catch {
        // A log that can't start costs the pane this turn's steps, nothing more.
      }

      try {
        if (start !== undefined && isOn()) await numberTurn($, isIt)
      } catch (error: unknown) {
        $.ui.log(`ghostframe: turn rule not numbered: ${String(error)}`, noticeSink())
      }

      unclaimedSubmit = undefined
    }

    return next(e)
  })

  // Stamp each prompt the person typed with the clock, for its turn rule and Cockpit's turn. An agent's report
  // (`peer`, meta) and a task's notice are not typed: the turn they start carries on the typed one.
  on('prompt.submit', async ($, e, next) => {
    const isTyped = e.origin.kind === 'composer' || e.origin.kind === 'bridge'

    if (isTyped && !e.isMeta && e.command === undefined && e.text.trim().length > 0) {
      const at = await $.clock.now()
      // No number yet: a number is claimed only by a turn that starts (amendment 12). Typed over a running turn, the
      // prompt keeps that turn's id and leaves the next turn's start alone.
      const list = await updatePrompts($, l => [...l, { text: stampText(e.text), at, ...(e.turnId === undefined ? {} : { over: e.turnId }) }].slice(-100))

      if (e.turnId === undefined) {
        lastSubmitted = at
        unclaimedSubmit = at
      }

      try {
        await keepPrompts($, list)
      } catch (error: unknown) {
        $.ui.log(`ghostframe: prompt times not kept for a resume: ${String(error)}`, noticeSink())
      }
    }

    return next(e)
  }).catch((_$, e, next) => next(e)) // a stamp that fails never holds a prompt back

  // Keep the latest main-loop turn's output tokens, for the close rule.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      lastClosed = e.turnId

      try {
        // Every reader of `streaming` (each reply on screen) draws again: tables re-flow.
        await updateStreaming($, () => false)

        const used = await readTally($)
        const browser = openRunBefore(await readFlow($), Number.MAX_SAFE_INTEGER, e.turnId)

        await updateCloses($, list =>
          [...list, { durationMs: e.durationMs, tokens: e.usage?.output_tokens ?? null, tally: tallyText(used), browser, turn: e.turnId }].slice(-500)
        )
      } finally {
        // The next turn starts counting afresh, whatever happened above.
        await updateTally($, () => NO_TALLY)
        await updateCaps($, () => NO_CAPS)
        // A turn that ended before any reply (aborted, a local command) opens nothing later.
        await updateAwaitingFirst($, () => false)

        try {
          // The turn's last answer row: its receipt is drawn under it, and again there after a resume.
          await logTurnEnd($, e.durationMs, e.isAborted, answerRowOf(e.turnId))
        } catch {
          // A step left running reads `running` until the next turn starts.
        }
      }
    }

    return next(e)
  })

  // Thinking time before each block (§5.11): timed off the stream, every chunk passed on
  // untouched. Main loop only; what it counts lands on the capability line.
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)

    if (e.agentId !== undefined) {
      return yield* stream
    }

    let since: number | undefined

    try {
      await logMode($, 'request')
    } catch {
      // The head says `waiting` a little late, nothing more.
    }

    for await (const chunk of stream) {
      try {
        await logMode($, chunk.kind)
        if (chunk.kind === 'thinking' && since === undefined) {
          since = await $.clock.now()
        } else if (since !== undefined && chunk.kind !== 'thinking' && chunk.kind !== 'engine') {
          const ms = (await $.clock.now()) - since
          since = undefined
          await updateCaps($, c => ({ ...c, thoughtMs: c.thoughtMs + ms }))
        }
      } catch {
        since = undefined
      }

      yield chunk
    }

    return await stream.result
  })
}
