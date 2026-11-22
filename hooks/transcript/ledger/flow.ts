// Queries over the ledger's flow and first-of-turn lists: a block's key, where it sits in its turn, what is above it.
import type { FirstText, FlowStamp } from '../../../types'
import { isNarrationAt } from '../../shared/flow'
import { browserTool, openRunBefore } from '../browser'

/** A block's identity for first-of-turn matching: whitespace folded, first 100 chars. */
export const firstKey = (t: string): string => t.replace(/\s+/g, ' ').trim().slice(0, 100)
/** Two block keys name the same block: equal, or one (≥ 20 chars) a prefix of the other while it streams. */
export const sameKey = (x: string, k: string): boolean =>
  k.length > 0 && (x === k || (k.length >= 20 && x.startsWith(k)) || (x.length >= 20 && k.startsWith(x)))
/**
 * Whether an entry recorded under `entry` belongs to a block placed in `turn`: the same
 * turn, or either side unknown (a block not in the flow, an opener seeded from history).
 */
// A block with no place in the turn's flow (a summary row): it may match any turn's opener.
export const ANY_TURN: undefined = undefined
export const inTurn = (entry: string | null | undefined, turn: string | null | undefined): boolean =>
  entry === undefined || turn === undefined || entry === turn
/** Where a text block sits in the flow, by its key, newest first. */
export const textAt = (list: readonly FlowStamp[], key: string): number => list.findLastIndex(f => f.kind === 'text' && sameKey(f.key, key))
/** Quiet, `claude` goes on the first text block of its turn that is not narration: the first one left on screen. */
export const isQuietOpenerAt = (list: readonly FlowStamp[], at: number): boolean => {
  const turn = list[at]?.turn

  return list.findIndex((f, i) => f.turn === turn && f.kind === 'text' && !isNarrationAt(list, i)) === at
}
export const isTurnOpener = (list: readonly FirstText[], text: string, turn: string | null | undefined): boolean => {
  const k = firstKey(text)

  return list.some(x => inTurn(x.turn, turn) && sameKey(x.key, k))
}

/**
 * Where a block sits in the turn's flow: its own index, or, while the turn runs and
 * the block isn't stored yet, the end (it's the newest). Unknown → undefined.
 */
export const flowPlace = (
  list: readonly FlowStamp[],
  find: (f: FlowStamp) => boolean,
  live: boolean,
  turn: string | null
): { at: number; turn: string | null } | undefined => {
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i]

    if (f !== undefined && find(f)) return { at: i, turn: f.turn }
  }

  return live ? { at: list.length, turn } : undefined
}

/** How many browser calls the block closes the frame of (0: none open above it). */
export const browserOpenAbove = (list: readonly FlowStamp[], place: { at: number; turn: string | null } | undefined): number =>
  place === undefined ? 0 : openRunBefore(list, place.at, place.turn)

/** The tools that fetch from the web: a turn using one draws [ SOURCES ] frames (§0.2). */
const WEB_TOOLS = new Set(['WebSearch', 'WebFetch'])
export const isWebTool = (tool: string | undefined): boolean => tool !== undefined && WEB_TOOLS.has(tool)

export const isBrowserTool = (tool: string | undefined): boolean => tool !== undefined && browserTool(tool) !== undefined

/** Whether the block right above a call in its turn is prose (narration): §0.2 wants a blank row. */
export const afterNarration = (list: readonly FlowStamp[], place: { at: number; turn: string | null } | undefined): boolean => {
  const prev = place !== undefined && place.at > 0 ? list[place.at - 1] : undefined

  return prev !== undefined && prev.kind === 'text' && prev.turn === place?.turn
}
