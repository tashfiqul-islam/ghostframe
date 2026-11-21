// Which message a reply draw belongs to across remounts, and each reply block's top gap: decided once, then kept.
import type { FlowStamp } from '../../../../types'
import { remember } from '../../../shared/held'
import { sameKey } from '../../ledger/flow'
import { isFramed } from '../tools/result'

/** A drawn block's identity: its key, and the turn it sits in (null: none known). */
type Keyed = { key: string; turn: string | null }

// Each reply block's top gap, fixed the first time it draws (§6: a drawn row never moves).
const replyGaps = new Map<string, number>()
// The message each reply draw belongs to, so a remount keeps what its first draw decided.
// The engine may mount a message again when its turn ends (a new request for the same
// message); keyed by request alone, that draw would lay its table out afresh and pick its
// gap again. A new request whose text names a message drawn earlier in the same turn takes
// that message's request: its frozen table layouts and gap. Written while drawing.
const drawnMessages = new Map<string, Keyed>()
const sameMessage = new Map<string, string>()
export const messageOf = (request: string, key: string, turn: string | null) => {
  const had = sameMessage.get(request)

  if (had !== undefined) return had

  let owner = request

  for (const [r, m] of drawnMessages) {
    if (r !== request && m.turn === turn && sameKey(m.key, key)) owner = sameMessage.get(r) ?? r
  }

  remember(sameMessage, request, owner, 2000)

  return owner
}
const GAPS_MAX = 2000

/**
 * Notes what a reply draw showed, so a later request for the same message takes this one's (see `messageOf`).
 * @param request the draw's request
 * @param drawn the block it drew: its key and turn
 */
export function drawnAs(request: string, drawn: Keyed): void {
  remember(drawnMessages, request, drawn, 2000)
}

/**
 * A reply block's top gap, fixed the first time its message draws: one blank row, except right under a frame
 * that drew its own (a card, the task list).
 * @param message the draw's message (see `messageOf`)
 * @param prev the flow entry right above the block, if any
 * @param turn the block's turn
 * @returns the rows of margin above the block
 */
export function replyGap(message: string, prev: FlowStamp | undefined, turn: string | null | undefined): number {
  const held = replyGaps.get(message)
  const gap = held ?? (prev !== undefined && prev.kind === 'tool' && prev.turn === turn && isFramed(prev.key) ? 0 : 1)

  if (held === undefined) remember(replyGaps, message, gap, GAPS_MAX)

  return gap
}
