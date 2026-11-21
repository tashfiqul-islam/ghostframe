// The transcript's ledger: what the main loop did, kept in $.state for the drawing. Each value is read and
// written in this file only (the engine's rule); the observe hooks and the render sites call the functions below.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { CapsStamp, FirstText, FlowStamp, OpenerCaps, PromptStamp, ShipStamp, StepStamp, TallyStamp, TestRunStamp, TurnClose } from '../../../types'
import type { Part } from '../../shared/parts'
import { NO_CAPS, NO_TALLY, capsLine } from '../live'

// Session state (survives a reload). Change a shape tag when its fields change.
const prompts = atom({ plugin: 'ghostframe', key: 'prompts' } as const, [] as PromptStamp[], { shape: 'prompts-1' })
// Every finished main-loop turn: its close rule finds its own by duration.
const closes = atom({ plugin: 'ghostframe', key: 'closes' } as const, [] as TurnClose[], { shape: 'closes-1' })
// What the turn used before its first visible block, then what each turn's opener carries.
const caps = atom({ plugin: 'ghostframe', key: 'caps' } as const, NO_CAPS, { shape: 'caps-1' })
const openers = atom({ plugin: 'ghostframe', key: 'openers' } as const, [] as OpenerCaps[], { shape: 'openers-2' })
// What the whole turn used, for the close rule's tally.
const tally = atom({ plugin: 'ghostframe', key: 'tally' } as const, NO_TALLY, { shape: 'tally-1' })
// Assistant blocks in stored order, so a block knows what sits right above it.
const flow = atom({ plugin: 'ghostframe', key: 'flow' } as const, [] as FlowStamp[], { shape: 'flow-1' })
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

export async function readFlow($: EngineInterface): Promise<FlowStamp[]> {
  return read($, flow)
}

export async function updateFlow($: EngineInterface, change: (list: FlowStamp[]) => FlowStamp[]): Promise<FlowStamp[]> {
  return update($, flow, change)
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

export async function readSteps($: EngineInterface): Promise<StepStamp[]> {
  return read($, steps)
}

export async function updateSteps($: EngineInterface, change: (list: StepStamp[]) => StepStamp[]): Promise<StepStamp[]> {
  return update($, steps, change)
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

// The capability line a turn's opener carries (by its text key or its first call's id).
export async function openerCaps($: EngineInterface, match: (o: OpenerCaps) => boolean, width: number): Promise<Part[] | undefined> {
  const found = (await read($, openers)).toReversed().find(match)

  return found === undefined ? undefined : capsLine(found.caps, width)
}
