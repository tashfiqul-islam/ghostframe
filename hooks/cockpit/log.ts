// Cockpit's log of the main loop (spec E.24, E.38, E.40, H.1): the step log, the roster of agents, the receipts and
// the timers, kept in $.state, and the events that write them.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer, ToolCallInput } from 'claude-code'

import { addAgent, agentStep, anyRunning, endAgent, endTurnAgents, reconcile, startTurnAgents, waitingOn } from './agents/roster'
import type { AgentEnd, AgentStart } from './agents/roster'
import { askStep, continueTurn, endLaunched, endTurn, newLog, newTurn, noteMode, noteSaid, receiptOf, settleStep, startStep } from './steps/log'
import type { Outcome } from './steps/log'
import type { Receipt, RosterAgent, StepLog } from '../../types'
import { fileDiff, resetSnapshots, snapshotBefore } from './history/snapshots'
import { restoredLog } from './history/record'
import { loadHistory, saveTurn, setPin } from './history/store'
import { noteEnd, noteStart, readDetails, restoreDetails } from './keys/details'
import { noteShown } from './mode'
import { isOn } from './switch'
import { noteCited, noteWork, readWork, restoreWork, startWork } from './work'

// The current (or last) main-loop turn's log. Change the tag when its fields change.
const stepLog = atom({ plugin: 'ghostframe', key: 'stepLog' } as const, newLog(null, null), { shape: 'stepLog-4' })
// The agents of the current (or last) turn, and background agents still running from earlier ones (E.40).
const roster = atom({ plugin: 'ghostframe', key: 'roster' } as const, [] as RosterAgent[], { shape: 'roster-2' })
// Counters the timers bump while a turn runs: each second (the pane's running clock) and each spinner frame.
const second = atom({ plugin: 'ghostframe', key: 'second' } as const, 0, { shape: 'second-1' })
const frame = atom({ plugin: 'ghostframe', key: 'frame' } as const, 0, { shape: 'frame-1' })
// Each finished turn's receipt, by turn id, so a receipt drawn again later (a resize, a scroll) shows its own turn.
const receipts = atom({ plugin: 'ghostframe', key: 'receipts' } as const, [] as Receipt[], { shape: 'receipts-4' })
const RECEIPTS_MAX = 500

const SECOND_MS = 1_000
const FRAME_MS = 100 // H.1 asks 80 ms; the engine redraws a site at most ten times a second

// shortcut: the timers live in the module; a reload stops them (the engine's rule) and a turn running across a
// reload then shows its last second until the next turn starts. Fine while Cockpit is a test-only feature.
let timers: Timer[] = []
/** The session's folder, as the last call gave it: where the turn's files are read for their diffs. */
let lastCwd: string | undefined

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
 * Starts the timers: both while a turn runs; the second alone while only background agents do, so their rows'
 * clocks go on in an idle pane.
 * @param $ the engine interface
 * @param isTurn whether a turn runs
 */
function startTimers($: EngineInterface, isTurn: boolean): void {
  stopTimers()
  timers = [$.clock.every(SECOND_MS, () => void tickSecond($)), ...(isTurn ? [$.clock.every(FRAME_MS, () => void tickFrame($))] : [])]
}

/**
 * A main-loop turn starts, and the timers with it. A turn the person typed for starts a new log on its own clock
 * (its number the next typed prompt's) and a new roster; a turn no prompt was typed for (its agents' reports)
 * carries on the typed turn before it, with its number, steps and roster.
 * @param $ the engine interface
 * @param turn the turn's id
 * @param at when its prompt was typed (wall clock, ms); undefined when none was
 * @param cwd the session's folder, where the turn's file changes are read
 */
export async function logTurnStart($: EngineInterface, turn: string, at: number | undefined, cwd?: string): Promise<void> {
  if (!isOn()) return

  const now = await $.clock.now()
  await noteShown($)

  if (at === undefined) {
    await update($, stepLog, log => continueTurn(log, turn, now))
  } else {
    await update($, stepLog, log => newTurn(log, turn, at))
    // A typed prompt means the person has moved on: the pin goes (E.45), and the new turn's files are read afresh.
    await setPin($, null, 0)
    resetSnapshots()
    await startWork($, cwd)
    await settleUnreported($, now)
    await update($, roster, startTurnAgents)
  }

  lastMode = undefined
  startTimers($, true)
}

/**
 * Agents still running here that the engine's own list says ended (correction M: the list is the roster's second
 * source), for a run whose report never came. A list the engine cannot give leaves them as they are.
 * @param $ the engine interface
 * @param now the wall clock in ms
 */
async function settleUnreported($: EngineInterface, now: number): Promise<void> {
  if (!anyRunning(await read($, roster))) return

  try {
    const listed = await $.agent.list()
    await update($, roster, list => reconcile(list, listed, now))
  } catch (error: unknown) {
    $.ui.log(`cockpit: agent list unavailable: ${String(error)}`)
  }
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

  lastCwd = cwd ?? lastCwd
  await snapshotBefore($, e.tool, e, cwd)

  await update($, stepLog, log => startStep(log, { id: e.tool_use_id, tool: e.tool, input: e, at }, cwd))
  await noteStart($, e.tool_use_id, e.tool, e, at)
}

/**
 * A main-loop call ends: its row settles, and what it did joins the turn's to-dos, files and pages.
 * @param $ the engine interface
 * @param e the call
 * @param outcome what `next(e)` resolved to; undefined when it threw
 * @param at the wall clock in ms
 * @param cwd the session's folder, for paths from the project root
 */
export async function logStepEnd($: EngineInterface, e: ToolCallInput, outcome: Outcome | undefined, at: number, cwd?: string): Promise<void> {
  if (!isOn()) return

  const ran = outcome ?? { isError: true as const, text: 'failed' }
  await update($, stepLog, log => settleStep(log, { id: e.tool_use_id, tool: e.tool, input: e, at, outcome: ran }))
  await noteWork($, e.tool, e, ran, cwd)
  await noteEnd($, e.tool_use_id, e, ran, at)
  lastMode = 'requesting'
}

/**
 * The answer cites pages: their marks in `[ SOURCES ]`, in the order the transcript numbers them. An answer that
 * cites nothing leaves the marks the turn already has.
 * @param $ the engine interface
 * @param cited the pages, first-cited order
 */
export async function logCited($: EngineInterface, cited: readonly { url: string; title: string }[]): Promise<void> {
  if (!isOn() || cited.length === 0) return

  await noteCited($, cited)
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

  const now = await $.clock.now()
  await update($, stepLog, log => endTurn(log, durationMs, isAborted, now))
  await update($, roster, list => endTurnAgents(list, isAborted, now))
  const waiting = waitingOn(await read($, roster))
  const receipt = receiptOf(await read($, stepLog), waiting)
  await update($, receipts, list => [...list.filter(r => r.turn !== receipt.turn), receipt].slice(-RECEIPTS_MAX))

  if (anyRunning(await read($, roster))) startTimers($, false)
  else stopTimers()

  await keepTurn($)
}

const DIFFS_MAX = 50 // files whose diff a turn keeps

/**
 * Keeps the typed turn in history (E.45): its log, its work, its agents, its receipts, its steps' details and each
 * file's diff over the turn. A history that cannot be kept costs the pane its pins, never the turn.
 * @param $ the engine interface
 */
async function keepTurn($: EngineInterface): Promise<void> {
  try {
    const log = await read($, stepLog)
    const work = await readWork($)
    const diffs = await Promise.all(work.files.slice(0, DIFFS_MAX).map(async f => fileDiff($, f.path, lastCwd)))

    const mine = (await read($, receipts)).filter(r => r.turnNo === log.turnNo)
    await saveTurn($, { log, work, roster: await read($, roster), receipts: mine, details: await readDetails($), diffs })
  } catch (error: unknown) {
    $.ui.log(`cockpit: turn ${String((await read($, stepLog)).turnNo)} not kept in history: ${String(error)}`)
  }
}

/**
 * Session start (a resume, a restart, a reload): history comes back from the store, and a pane that has no turn yet
 * shows the last kept one as it ended (`[ LAST ]`, its sections, its receipts).
 * @param $ the engine interface
 */
export async function logSessionStart($: EngineInterface): Promise<void> {
  if (!isOn()) return

  const records = await loadHistory($)
  const last = records.at(-1)

  if (last === undefined || (await read($, stepLog)).turnNo > 0) return

  await update($, stepLog, log => restoredLog(log, last))
  await update($, receipts, list => (list.length > 0 ? list : records.flatMap(r => r.receipts).slice(-RECEIPTS_MAX)))
  await update($, roster, list => (list.length > 0 ? list : last.roster))
  await restoreWork($, last)
  await restoreDetails($, last.details)
}

/**
 * An agent started (`agent.spawn`): its row appears in `[ AGENTS ]`.
 * @param $ the engine interface
 * @param start the agent, its launching call, its parent and its name
 */
export async function logAgentStart($: EngineInterface, start: Omit<AgentStart, 'at'>): Promise<void> {
  if (!isOn()) return

  const at = await $.clock.now()
  await update($, roster, list => addAgent(list, { ...start, at }))
}

/**
 * An agent's own call started (`tool.call` with its `agentId`): its row says what it does now.
 * @param $ the engine interface
 * @param id the agent's id
 * @param e the call
 * @param cwd the session's folder, for relative paths
 */
export async function logAgentStep($: EngineInterface, id: string, e: ToolCallInput, cwd: string | undefined): Promise<void> {
  if (!isOn()) return

  const at = await $.clock.now()
  await update($, roster, list => (list.some(a => a.id === id) ? agentStep(list, id, e.tool, e, cwd, at) : list))
}

/**
 * An agent reported (`agent.report`): its row settles, and so does its launch in `[ STEPS ]` once every agent of
 * it has. The last background agent to end stops the clock of an idle pane.
 * @param $ the engine interface
 * @param end the agent and how it ended
 */
export async function logAgentEnd($: EngineInterface, end: Omit<AgentEnd, 'at'>): Promise<void> {
  if (!isOn()) return

  const at = await $.clock.now()
  const agent = (await read($, roster)).find(a => a.id === end.id)

  if (agent === undefined) return

  await update($, roster, list => endAgent(list, { ...end, at }))

  // The launch counts each agent once (`endLaunched` keeps which); a later report of a finished one counts nothing.
  if (agent.parent === null && agent.call.length > 0) {
    await update($, stepLog, log => endLaunched(log, agent.call, end.status !== 'completed', at))
  }

  const log = await read($, stepLog)

  if (!log.isTurnRunning && !anyRunning(await read($, roster))) stopTimers()
}

/**
 * The roster; read while drawing, so the drawing follows it.
 * @param $ the engine interface
 * @returns the agents, in launch order
 */
export async function readRoster($: EngineInterface): Promise<RosterAgent[]> {
  return read($, roster)
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
