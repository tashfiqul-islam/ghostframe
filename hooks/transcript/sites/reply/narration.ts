// Quiet (Cockpit docked): whether a reply block is narration the transcript leaves to the pane.
import type { EngineInterface } from 'claude-code'

import { isNarrationRow } from '../../../cockpit/left'
import { runningTurn } from '../../../cockpit/log'
import { ASKS_THE_PERSON, isNarrationAt, readFlow } from '../../../shared/flow'
import { firstKey, textAt } from '../../ledger/flow'

// Quiet (Cockpit docked): narration leaves the transcript; its sentence is the pane's [ NOW ] (probe 1).
// While the turn runs, its text waits unseen until it is known not to be narration, so nothing flashes:
// the engine may raise a block before its message (and the tool call after it) is stored. The answer is
// raised after `turn.complete` (probe 1), so waiting costs it nothing; a question to the person shows at once.
/**
 * Whether a reply block stays off the transcript while Cockpit is docked.
 * A block the flow does not hold (a resumed transcript: the flow lives in the state, which a new process starts
 * empty) is narration when the history kept its row id as such (amendment 10).
 * @param $ the engine interface
 * @param text the block's text as the engine draws it
 * @param row the block's row id
 * @returns true for narration, and for a running turn's text not yet known not to be narration
 */
export async function isHiddenNarration($: EngineInterface, text: string, row: string): Promise<boolean> {
  const quietFlow = await readFlow($)
  const at = textAt(quietFlow, firstKey(text.replace(/…$/, '')))
  const running = await runningTurn($)
  const block = quietFlow[at]
  const nextTool = block === undefined ? undefined : quietFlow.slice(at + 1).find(f => f.turn === block.turn && f.kind === 'tool')
  const isUndecided = running !== undefined && (block === undefined || block.turn === running) && !ASKS_THE_PERSON.has(nextTool?.tool ?? '')

  if (at >= 0) return isNarrationAt(quietFlow, at) || isUndecided

  return isUndecided || (await isNarrationRow($, row))
}
