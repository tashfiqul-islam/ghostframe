// The flow: Claude's blocks and calls in stored order, by engine turn, kept in $.state and read by both features
// (the transcript's layout, Cockpit's capsules). This value is read and written in this file only (the engine's rule).
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { FlowStamp } from '../../types'

// Session state (survives a reload). Change the shape tag when its fields change.
const flow = atom({ plugin: 'ghostframe', key: 'flow' } as const, [] as FlowStamp[], { shape: 'flow-1' })

export async function readFlow($: EngineInterface): Promise<FlowStamp[]> {
  return read($, flow)
}

export async function updateFlow($: EngineInterface, change: (list: FlowStamp[]) => FlowStamp[]): Promise<FlowStamp[]> {
  return update($, flow, change)
}

// Text before these tools is a question or a plan put to the person: they must act on it, so it is not narration.
export const ASKS_THE_PERSON: Set<string> = new Set(['AskUserQuestion', 'ExitPlanMode'])

/** Narration (phase 4): a text block that a tool call follows in its own turn, unless that call asks the person. */
export const isNarrationAt = (list: readonly FlowStamp[], at: number): boolean => {
  const f = list[at]
  const next = f === undefined ? undefined : list.slice(at + 1).find(g => g.turn === f.turn && g.kind === 'tool')

  return next !== undefined && !ASKS_THE_PERSON.has(next.tool ?? '')
}
