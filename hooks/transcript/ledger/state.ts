// The transcript's ledger: what the main loop did, kept in $.state for the drawing. Each value is read and
// written in this file only (the engine's rule); the observe hooks and the render sites call the functions below.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type {
  CapsStamp,
  FirstText,
  OpenerCaps,
  PromptStamp,
  ShipStamp,
  StepStamp,
  TallyStamp,
  TaskNotice,
  TestRunStamp,
  TurnAfter,
  TurnClose
} from '../../../types'
import { capTurns, changeHeld, loadHeld, nextTick, type Held } from '../../shared/held'
import type { Part } from '../../shared/parts'
import { NO_CAPS, NO_TALLY, capsLine } from '../live'

// Session state (survives a reload). Change a shape tag when its fields change.
const prompts = atom({ plugin: 'ghostframe', key: 'prompts' } as const, [] as PromptStamp[], { shape: 'prompts-1' })
// What came before the next typed turn (a resume, a compaction), until that turn's stamp takes it.
const pendingAfter = atom({ plugin: 'ghostframe', key: 'pendingAfter' } as const, null as TurnAfter | null, { shape: 'pendingAfter-1' })
// Every finished main-loop turn: its close rule finds its own by duration.
const closes = atom({ plugin: 'ghostframe', key: 'closes' } as const, [] as TurnClose[], { shape: 'closes-1' })
// What the turn used before its first visible block, then what each turn's opener carries.
const caps = atom({ plugin: 'ghostframe', key: 'caps' } as const, NO_CAPS, { shape: 'caps-1' })
const openers = atom({ plugin: 'ghostframe', key: 'openers' } as const, [] as OpenerCaps[], { shape: 'openers-2' })
// What the whole turn used, for the close rule's tally.
const tally = atom({ plugin: 'ghostframe', key: 'tally' } as const, NO_TALLY, { shape: 'tally-1' })
// Read off shell calls as they end: test counts and what was shipped, by call id.
const testRuns = atom({ plugin: 'ghostframe', key: 'testRuns' } as const, [] as TestRunStamp[], { shape: 'testRuns-1' })
const ships = atom({ plugin: 'ghostframe', key: 'ships' } as const, [] as ShipStamp[], { shape: 'ships-1' })
// Each main-loop tool call: its turn, start, and how long it ran (null while running).
const steps = atom({ plugin: 'ghostframe', key: 'steps' } as const, [] as StepStamp[], { shape: 'steps-1' })
const currentTurn = atom({ plugin: 'ghostframe', key: 'turn' } as const, null as string | null, { shape: 'turn-1' })
// The opening text of each turn's first prose block, so `claude` labels only that block.
const firstTexts = atom({ plugin: 'ghostframe', key: 'firstTexts' } as const, [] as FirstText[], { shape: 'firstTexts-2' })
const awaitingFirst = atom({ plugin: 'ghostframe', key: 'awaitingFirst' } as const, false, { shape: 'awaitingFirst-1' })
// The first tool call of each turn that opened on tools, so its activity header carries `claude`.
const firstTools = atom({ plugin: 'ghostframe', key: 'firstTools' } as const, [] as string[], { shape: 'firstTools-1' })

// True while a main-loop turn runs: tables keep their columns until it completes.
const streaming = atom({ plugin: 'ghostframe', key: 'streaming' } as const, false, { shape: 'streaming-1' })
// Main-loop calls whose permission check asked the person, until the call returns.
const asked = atom({ plugin: 'ghostframe', key: 'asked' } as const, [] as string[], { shape: 'asked-1' })

// Each background task's newest notice, by task id: its notices share one row, which shows the newest (7.10).
const taskNotices = atom({ plugin: 'ghostframe', key: 'taskNotices' } as const, [] as TaskNotice[], { shape: 'taskNotices-1' })
const TASK_NOTICES_MAX = 200

/**
 * A background task notified (again): its newest notice replaces the one kept for its id.
 * @param $ the engine interface
 * @param notice the task's id, what it says, how long it ran
 */
export async function noteTaskNotice($: EngineInterface, notice: TaskNotice): Promise<void> {
  await update($, taskNotices, list => [...list.filter(n => n.id !== notice.id), notice].slice(-TASK_NOTICES_MAX))
}

/**
 * A background task's newest notice; read while drawing, so its row draws again when the task notifies again.
 * @param $ the engine interface
 * @param id the task's id
 * @returns the notice, or undefined when none was kept
 */
export async function readTaskNotice($: EngineInterface, id: string): Promise<TaskNotice | undefined> {
  return (await read($, taskNotices)).find(n => n.id === id)
}

// The prompts' stamps are also kept in $.store under the session's id: $.state does not outlive the process, and
// a resumed session's turn rules show their times from there.
const PROMPTS_KEY = 'prompts:'

const isStamp = (p: unknown): p is PromptStamp =>
  typeof p === 'object' && p !== null && 'text' in p && typeof p.text === 'string' && 'at' in p && typeof p.at === 'number'
const isStamps = (v: unknown): v is PromptStamp[] => Array.isArray(v) && v.every(isStamp)

// A stamp keeps the first 200 characters of its prompt: enough to find its row, and a pasted log costs the store
// nothing (amendment 12). Its row, once noted, finds it by id.
const STAMP_TEXT_MAX = 200

/**
 * The text a stamp keeps of a prompt: trimmed, its first 200 characters.
 * @param text the prompt as typed
 * @returns the stamp's text
 */
export const stampText = (text: string): string => text.trim().slice(0, STAMP_TEXT_MAX)

/**
 * Whether a stamp's text is a prompt's, as stamps keep them (`stampText`): a stamp kept whole before is the same.
 * @param a one text
 * @param b the other
 * @returns whether they are the same prompt's
 */
export const isSameText = (a: string, b: string): boolean => stampText(a) === stampText(b)

/**
 * Keeps the prompts' stamps in the store, for a resume.
 * @param $ the engine interface
 * @param list the stamps, oldest first
 */
export async function keepPrompts($: EngineInterface, list: readonly PromptStamp[]): Promise<void> {
  await $.store.set(`${PROMPTS_KEY}${await $.session.id()}`, [...list])
}

/**
 * The stamps the store holds for this session: what a resumed transcript, drawn before the session starts, reads.
 * @param $ the engine interface
 * @returns the stamps, oldest first; none when the store holds none
 */
export async function storedPrompts($: EngineInterface): Promise<PromptStamp[]> {
  const kept: unknown = await $.store.get(`${PROMPTS_KEY}${await $.session.id()}`)

  return isStamps(kept) ? kept : []
}

/**
 * Session start: the stamps this session kept before a restart come back, unless the state holds some (a reload).
 * Taking them back is a resume: the next typed turn's rule says `RESUMED` (amendment 12).
 * @param $ the engine interface
 */
export async function restorePrompts($: EngineInterface): Promise<void> {
  const kept = await storedPrompts($)
  let isResume = false

  await update($, prompts, list => {
    isResume = list.length === 0 && kept.length > 0

    return isResume ? kept : list
  })

  if (isResume) await notePending($, 'resume')
}

/**
 * Notes what the next typed turn comes after; the latest wins.
 * @param $ the engine interface
 * @param after a resume or a compaction
 */
export async function notePending($: EngineInterface, after: TurnAfter): Promise<void> {
  await update($, pendingAfter, () => after)
}

/**
 * Takes what the typed turn starting now comes after, and clears it.
 * @param $ the engine interface
 * @returns it, or undefined when nothing came between
 */
export async function takePending($: EngineInterface): Promise<TurnAfter | undefined> {
  let taken: TurnAfter | null = null

  await update($, pendingAfter, held => {
    taken = held

    return null
  })

  return taken ?? undefined
}

export async function readPrompts($: EngineInterface): Promise<PromptStamp[]> {
  return read($, prompts)
}

export async function updatePrompts($: EngineInterface, change: (list: PromptStamp[]) => PromptStamp[]): Promise<PromptStamp[]> {
  return update($, prompts, change)
}

export async function readCloses($: EngineInterface): Promise<TurnClose[]> {
  return read($, closes)
}

export async function updateCloses($: EngineInterface, change: (list: TurnClose[]) => TurnClose[]): Promise<TurnClose[]> {
  return update($, closes, change)
}

export async function updateCaps($: EngineInterface, change: (c: CapsStamp) => CapsStamp): Promise<CapsStamp> {
  return update($, caps, change)
}

export async function updateOpeners($: EngineInterface, change: (list: OpenerCaps[]) => OpenerCaps[]): Promise<OpenerCaps[]> {
  return update($, openers, change)
}

export async function readTally($: EngineInterface): Promise<TallyStamp> {
  return read($, tally)
}

export async function updateTally($: EngineInterface, change: (t: TallyStamp) => TallyStamp): Promise<TallyStamp> {
  return update($, tally, change)
}

export async function readTestRuns($: EngineInterface): Promise<TestRunStamp[]> {
  return read($, testRuns)
}

export async function updateTestRuns($: EngineInterface, change: (list: TestRunStamp[]) => TestRunStamp[]): Promise<TestRunStamp[]> {
  return update($, testRuns, change)
}

export async function readShips($: EngineInterface): Promise<ShipStamp[]> {
  return read($, ships)
}

export async function updateShips($: EngineInterface, change: (list: ShipStamp[]) => ShipStamp[]): Promise<ShipStamp[]> {
  return update($, ships, change)
}

/**
 * Every call's stamp, the calls still running last; read while drawing a tool row.
 * @param $ the engine interface
 * @returns the stamps
 */
export async function readSteps($: EngineInterface): Promise<StepStamp[]> {
  await read($, stepsTick)
  if (heldSteps.value === undefined) await loadHeld(heldSteps, read($, steps))

  return [...changeHeld(heldSteps, list => list), ...stamping.values()]
}

// Up to 400 stamps, so each tool call writes the list once, at its end, and never reads it back (shared/held.ts): a
// running call's stamp is held here until then, and `readSteps` gives it with the rest. A draw reads `stepsTick`, which
// moves at a call's start and at its end, so its rows draw again at both, as they did, with no copy of the list.
// shortcut: a reload while a call runs loses that call's stamp; its end then stamps it from its end alone.
const stamping = new Map<string, StepStamp>()
const heldSteps: Held<StepStamp[]> = {}
const stepsTick = atom({ plugin: 'ghostframe', key: 'stepsTick' } as const, 0, { shape: 'stepsTick-1' })

/**
 * A main-loop call started: its stamp, held until it ends, and its rows told.
 * @param $ the engine interface
 * @param stamp the call's id, turn, start and tool
 */
export async function stampStart($: EngineInterface, stamp: StepStamp): Promise<void> {
  stamping.set(stamp.id, stamp)
  await $.state.set({ plugin: 'ghostframe', key: 'stepsTick' }, { shape: 'stepsTick-1', value: nextTick(heldSteps) })
}

/**
 * A main-loop call ended: its stamp joins the list, in start order, which keeps its turns within `max` (oldest turn
 * first, never `turn`'s), with no read of the list.
 * @param $ the engine interface
 * @param id the call's id
 * @param end what its end adds: the start where the clock gave none, its time and whether it worked; null drops it
 * @param max the stamps kept
 */
export async function stampEnd($: EngineInterface, id: string, end: Pick<StepStamp, 'at' | 'ms' | 'ok'> | null, max: number): Promise<void> {
  const start = stamping.get(id)

  stamping.delete(id)
  if (end === null || start === undefined) return
  if (heldSteps.value === undefined) await loadHeld(heldSteps, read($, steps))
  const stamp = { ...start, ...end }
  const value = changeHeld(heldSteps, list => {
    const after = list.findLastIndex(s => s.at <= stamp.at) + 1

    return capTurns([...list.slice(0, after), stamp, ...list.slice(after)], max, stamp.turn)
  })

  await $.state.set({ plugin: 'ghostframe', key: 'steps' }, { shape: 'steps-1', value })
  await $.state.set({ plugin: 'ghostframe', key: 'stepsTick' }, { shape: 'stepsTick-1', value: nextTick(heldSteps) })
}

export async function readTurn($: EngineInterface): Promise<string | null> {
  return read($, currentTurn)
}

export async function updateTurn($: EngineInterface, change: (turn: string | null) => string | null): Promise<string | null> {
  return update($, currentTurn, change)
}

export async function readFirstTexts($: EngineInterface): Promise<FirstText[]> {
  return read($, firstTexts)
}

export async function updateFirstTexts($: EngineInterface, change: (list: FirstText[]) => FirstText[]): Promise<FirstText[]> {
  return update($, firstTexts, change)
}

export async function readAwaitingFirst($: EngineInterface): Promise<boolean> {
  return read($, awaitingFirst)
}

export async function updateAwaitingFirst($: EngineInterface, change: (is: boolean) => boolean): Promise<boolean> {
  return update($, awaitingFirst, change)
}

export async function readFirstTools($: EngineInterface): Promise<string[]> {
  return read($, firstTools)
}

export async function updateFirstTools($: EngineInterface, change: (list: string[]) => string[]): Promise<string[]> {
  return update($, firstTools, change)
}

export async function readStreaming($: EngineInterface): Promise<boolean> {
  return read($, streaming)
}

export async function updateStreaming($: EngineInterface, change: (is: boolean) => boolean): Promise<boolean> {
  return update($, streaming, change)
}

export async function readAsked($: EngineInterface): Promise<string[]> {
  return read($, asked)
}

export async function updateAsked($: EngineInterface, change: (list: string[]) => string[]): Promise<string[]> {
  return update($, asked, change)
}

/**
 * How long Claude thought before a turn's opener (7.3), from the opener's capability stamp; 0 when it did not.
 * @param $ the engine interface
 * @param match which opener
 * @returns the thinking time in ms
 */
export async function openerThought($: EngineInterface, match: (o: OpenerCaps) => boolean): Promise<number> {
  return (await read($, openers)).toReversed().find(match)?.caps.thoughtMs ?? 0
}

// The capability line a turn's opener carries (by its text key or its first call's id).
export async function openerCaps($: EngineInterface, match: (o: OpenerCaps) => boolean, width: number): Promise<Part[] | undefined> {
  const found = (await read($, openers)).toReversed().find(match)

  return found === undefined ? undefined : capsLine(found.caps, width)
}
