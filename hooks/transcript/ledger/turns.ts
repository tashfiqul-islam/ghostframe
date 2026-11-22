// The main loop's turns, observed: a typed prompt's stamp (`prompt.submit`), the turn's start and end
// (`turn.start`, `turn.complete`), and the thinking time before each block (`turn.step`).
import type { EngineInterface, On } from 'claude-code'

import { logMode, logTurnEnd, logTurnStart, readLog } from '../../cockpit/log'
import { isOn } from '../../cockpit/switch'
import { readFlow } from '../../shared/flow'
import { NO_CAPS, NO_TALLY, tallyText } from '../live'
import { openRunBefore } from '../browser'
import { answerRowOf, sessionCwd } from './session'
import {
  keepPrompts,
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
// The same stamp, until a main-loop turn takes it as its start (Cockpit's turn clock).
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
 * @param at the stamp's submit time
 */
async function numberTurn($: EngineInterface, at: number): Promise<void> {
  const turnNo = (await readLog($)).turnNo
  const list = await readPrompts($)
  const i = list.findLastIndex(s => s.at === at)
  const prev = list.slice(0, Math.max(0, i)).findLast(s => s.row !== undefined)?.row
  const after = (await takePending($)) ?? (prev !== undefined && (await isGone($, prev)) ? 'rewind' : undefined)
  const next = await updatePrompts($, l => l.map(s => (s.at === at ? { ...s, turnNo, ...(after === undefined ? {} : { after }) } : s)))

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

      try {
        // A turn no prompt was typed for (an agent's report, a notice) carries on the typed turn before it.
        await logTurnStart($, e.turnId, unclaimedSubmit, sessionCwd())
      } catch {
        // A log that can't start costs the pane this turn's steps, nothing more.
      }

      try {
        if (unclaimedSubmit !== undefined && isOn()) await numberTurn($, unclaimedSubmit)
      } catch (error: unknown) {
        $.ui.log(`ghostframe: turn rule not numbered: ${String(error)}`)
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
      // Cockpit on: the number its turn will take, so a row drawn before the turn starts shows it (amendment 12).
      const logged = isOn() ? (await readLog($)).turnNo : undefined
      const list = await updatePrompts($, l => {
        const turnNo = logged === undefined ? undefined : Math.max(logged, ...l.map(s => s.turnNo ?? 0)) + 1

        return [...l, { text: e.text, at, ...(turnNo === undefined ? {} : { turnNo }) }].slice(-100)
      })
      lastSubmitted = at
      unclaimedSubmit = at

      try {
        await keepPrompts($, list)
      } catch (error: unknown) {
        $.ui.log(`ghostframe: prompt times not kept for a resume: ${String(error)}`)
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
