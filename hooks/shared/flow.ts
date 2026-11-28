// The flow: Claude's blocks and calls in stored order, by engine turn, kept in $.state and read by both features
// (the transcript's layout, Cockpit's capsules). This value is read and written in this file only (the engine's rule).
import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { FlowStamp } from '../../types'
import { changeHeld, loadHeld, nextTick, type Held } from './held'

// Session state (survives a reload). Change the shape tag when its fields change.
const flow = atom({ plugin: 'ghostframe', key: 'flow' } as const, [] as FlowStamp[], { shape: 'flow-1' })
// Up to 600 stamps, written on every stored message: held as last written (held.ts), so a write never reads it back
// and a hook outside a draw reads it with no copy through $.state.
const held: Held<FlowStamp[]> = {}

// Moved at each write of the flow: a draw reads this number, which draws it again when the flow changes, and takes the
// flow itself as held, so no draw copies 600 stamps (held.ts).
const flowTick = atom({ plugin: 'ghostframe', key: 'flowTick' } as const, 0, { shape: 'flowTick-1' })

/**
 * The flow, for a draw: it is drawn again when the flow changes.
 * @param $ the engine interface
 * @returns the flow
 */
export async function readFlow($: EngineInterface): Promise<readonly FlowStamp[]> {
  await read($, flowTick)

  return flowNow($)
}

/**
 * The flow, for a hook that is not drawing: as last written, read from $.state only after a reload. Never changed in
 * place.
 * @param $ the engine interface
 * @returns the flow
 */
export async function flowNow($: EngineInterface): Promise<readonly FlowStamp[]> {
  if (held.value === undefined) await loadHeld(held, read($, flow))

  return changeHeld(held, list => list)
}

export async function updateFlow($: EngineInterface, change: (list: FlowStamp[]) => FlowStamp[]): Promise<FlowStamp[]> {
  if (held.value === undefined) await loadHeld(held, read($, flow))
  const value = changeHeld(held, change)

  await $.state.set({ plugin: 'ghostframe', key: 'flow' }, { shape: 'flow-1', value })
  await $.state.set({ plugin: 'ghostframe', key: 'flowTick' }, { shape: 'flowTick-1', value: nextTick(held) })

  return value
}

// Text before these tools is a question or a plan put to the person: they must act on it, so it is not narration.
export const ASKS_THE_PERSON: Set<string> = new Set(['AskUserQuestion', 'ExitPlanMode'])

/** Narration (phase 4): a text block that a tool call follows in its own turn, unless that call asks the person. */
export const isNarrationAt = (list: readonly FlowStamp[], at: number): boolean => {
  const f = list[at]
  const next = f === undefined ? undefined : list.slice(at + 1).find(g => g.turn === f.turn && g.kind === 'tool')

  return next !== undefined && !ASKS_THE_PERSON.has(next.tool ?? '')
}
