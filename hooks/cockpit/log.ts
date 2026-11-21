// Cockpit's log of the main loop (spec E.24, E.38, H.1): the step log, the receipts and the timers, kept in $.state,
// and the events that write them.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer, ToolCallInput } from 'claude-code'

import { askStep, endTurn, newLog, newTurn, noteMode, noteSaid, receiptOf, settleStep, startStep } from './steps/log'
import type { Outcome } from './steps/log'
import type { Receipt, StepLog } from '../../types'
import { isOn } from './switch'

// The current (or last) main-loop turn's log. Change the tag when its fields change.
const stepLog = atom({ plugin: 'ghostframe', key: 'stepLog' } as const, newLog(null, null), { shape: 'stepLog-2' })
// Counters the timers bump while a turn runs: each second (the pane's running clock) and each spinner frame.
const second = atom({ plugin: 'ghostframe', key: 'second' } as const, 0, { shape: 'second-1' })
const frame = atom({ plugin: 'ghostframe', key: 'frame' } as const, 0, { shape: 'frame-1' })
// Each finished turn's receipt, by turn id, so a receipt drawn again later (a resize, a scroll) shows its own turn.
const receipts = atom({ plugin: 'ghostframe', key: 'receipts' } as const, [] as Receipt[], { shape: 'receipts-2' })
const RECEIPTS_MAX = 500

const SECOND_MS = 1_000
const FRAME_MS = 100 // H.1 asks 80 ms; the engine redraws a site at most ten times a second

// shortcut: the timers live in the module; a reload stops them (the engine's rule) and a turn running across a
// reload then shows its last second until the next turn starts. Fine while Cockpit is a test-only feature.
let timers: Timer[] = []

/**
 * A second passed: the pane, which reads `second`, draws again.
 * @param $ the engine interface
 */
async function tickSecond($: EngineInterface): Promise<void> {
  await update($, second, n => n + 1)
}

/**
 * A spinner frame passed: the live row, which reads `frame`, draws again.
 * @param $ the engine interface
 */
async function tickFrame($: EngineInterface): Promise<void> {
  await update($, frame, n => n + 1)
}

/** Stops the turn's timers. */
function stopTimers(): void {
  for (const timer of timers) timer.cancel()

  timers = []
}

/**
 * A main-loop turn starts: its log starts empty, on its own clock, and the timers start.
 * @param $ the engine interface
 * @param turn the turn's id
 * @param at when its prompt was submitted (wall clock, ms); undefined (no prompt was typed), now
 */
export async function logTurnStart($: EngineInterface, turn: string, at: number | undefined): Promise<void> {
  if (!isOn()) return

  const startedAt = at ?? (await $.clock.now())
  await update($, stepLog, log => newTurn(log, turn, startedAt))
  lastMode = undefined
  stopTimers()
  timers = [$.clock.every(SECOND_MS, () => void tickSecond($)), $.clock.every(FRAME_MS, () => void tickFrame($))]
}

// The mode last written, so a stream of text chunks writes the log once, not once per chunk.
let lastMode: string | undefined
const CHUNK_MODE: Record<string, string> = { thinking: 'thinking', text: 'responding', input: 'tool-input', tool: 'tool-input' }

/**
 * What the main loop is doing changed (E.38 row 2 when no step runs): a model call started (`requesting`), or its
 * stream moved to thinking, text or a tool call. Written only on a change; a render may not write.
 * @param $ the engine interface
 * @param what `request`, or the stream chunk's kind
 */
export async function logMode($: EngineInterface, what: string): Promise<void> {
  const mode = what === 'request' ? 'requesting' : CHUNK_MODE[what]

  if (!isOn() || mode === undefined || mode === lastMode) return

  lastMode = mode
  const at = await $.clock.now()
  await update($, stepLog, log => (log.isTurnRunning ? noteMode(log, mode, at) : log))
}

/**
 * A main-loop call starts: its row appears.
 * @param $ the engine interface
 * @param e the call
 * @param at the wall clock in ms
 * @param cwd the session's folder, for relative paths
 */
export async function logStepStart($: EngineInterface, e: ToolCallInput, at: number, cwd: string | undefined): Promise<void> {
  if (!isOn()) return

  await update($, stepLog, log => startStep(log, { id: e.tool_use_id, tool: e.tool, input: e, at }, cwd))
}

/**
 * A main-loop call ends: its row settles.
 * @param $ the engine interface
 * @param e the call
 * @param outcome what `next(e)` resolved to; undefined when it threw
 * @param at the wall clock in ms
 */
export async function logStepEnd($: EngineInterface, e: ToolCallInput, outcome: Outcome | undefined, at: number): Promise<void> {
  if (!isOn()) return

  await update($, stepLog, log => settleStep(log, { id: e.tool_use_id, tool: e.tool, input: e, at, outcome: outcome ?? { isError: true, text: 'failed' } }))
  lastMode = 'requesting'
}

/**
 * A main-loop call waits on the person's permission answer: `[ NOW ]` says `needs you`.
 * @param $ the engine interface
 * @param id the call's id
 */
export async function logAsk($: EngineInterface, id: string): Promise<void> {
  if (!isOn()) return

  await update($, stepLog, log => askStep(log, id))
}

/**
 * Claude said something in the main loop: the last text block's first sentence is `[ NOW ]`'s row 1.
 * @param $ the engine interface
 * @param content the response's content blocks
 */
export async function logSaid($: EngineInterface, content: readonly { type: string; [k: string]: unknown }[]): Promise<void> {
  if (!isOn()) return

  const text = content.findLast(b => b.type === 'text' && typeof b['text'] === 'string' && b['text'].trim().length > 0)?.['text']

  if (typeof text === 'string') await update($, stepLog, log => noteSaid(log, text))
}

/**
 * A main-loop turn ends: a step still running was cut, the head turns to `[ LAST ]`, the timers stop, and the turn's
 * receipt is kept. One clock: the turn's time is Cockpit's own, now less its start, for the head, the receipt and
 * the live row alike; the engine's `durationMs` stands only when the start is unknown.
 * @param $ the engine interface
 * @param durationMs how long the engine says the turn ran
 * @param isAborted whether it was interrupted (correction G: no receipt; `[ LAST ]` carries the state)
 */
export async function logTurnEnd($: EngineInterface, durationMs: number, isAborted: boolean): Promise<void> {
  if (!isOn()) return

  stopTimers()
  const now = await $.clock.now()
  await update($, stepLog, log => endTurn(log, durationMs, isAborted, now))
  const receipt = receiptOf(await read($, stepLog))
  await update($, receipts, list => [...list.filter(r => r.turn !== receipt.turn), receipt].slice(-RECEIPTS_MAX))
}

/**
 * Whether a main-loop turn runs now, and which; read while drawing, so the drawing follows the turn's end.
 * @param $ the engine interface
 * @returns the running turn's id, or undefined
 */
export async function runningTurn($: EngineInterface): Promise<string | undefined> {
  const log = await read($, stepLog)

  return log.isTurnRunning ? (log.turn ?? undefined) : undefined
}

/**
 * The turn's log; read while drawing, so the drawing follows it.
 * @param $ the engine interface
 * @returns the log
 */
export async function readLog($: EngineInterface): Promise<StepLog> {
  return read($, stepLog)
}

/**
 * The finished turns' receipts.
 * @param $ the engine interface
 * @returns the receipts, oldest first
 */
export async function readReceipts($: EngineInterface): Promise<Receipt[]> {
  return read($, receipts)
}

/**
 * The spinner frame's counter; read while drawing, so the live row draws again each frame.
 * @param $ the engine interface
 * @returns the counter
 */
export async function readFrame($: EngineInterface): Promise<number> {
  return read($, frame)
}

/**
 * The seconds' counter; read while drawing, so the pane draws again each second.
 * @param $ the engine interface
 * @returns the counter
 */
export async function readSecond($: EngineInterface): Promise<number> {
  return read($, second)
}
