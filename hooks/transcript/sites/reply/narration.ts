// Quiet (Cockpit docked): whether a reply block is narration the transcript leaves to the pane.
import type { EngineInterface } from 'claude-code'

import { isNarrationRow } from '../../../cockpit/left'
import type { FlowStamp } from '../../../../types'
import { ASKS_THE_PERSON, isNarrationAt } from '../../../shared/flow'
import { firstKey, textAt } from '../../ledger/flow'
import { isStartRow } from '../../ledger/session'

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
 * @param quietFlow the flow, as the row's draw read it
 * @param running the main-loop turn running now, as the row's draw read it; undefined when none runs
 * @returns true for narration, and for a running turn's text not yet known not to be narration
 */
export async function isHiddenNarration(
  $: EngineInterface,
  text: string,
  row: string,
  quietFlow: readonly FlowStamp[],
  running: string | undefined
): Promise<boolean> {
  // The flow a draw reads is the one held until the next write (shared/flow.ts): what it says of a row it holds is
  // worked out once per flow, not on every draw as the person scrolls.
  const key = `${row}␟${running ?? ''}␟${text}`
  const known = scanned.get(quietFlow)?.get(key)

  if (known !== undefined) return known
  const at = textAt(quietFlow, firstKey(text.replace(/…$/, '')))
  const block = quietFlow[at]
  const nextTool = block === undefined ? undefined : quietFlow.slice(at + 1).find(f => f.turn === block.turn && f.kind === 'tool')
  // A row the session held when it started (a resumed answer, drawn before the start) is never the running turn's:
  // the flow, empty after a resume, does not hold it, yet it is decided (amendment 12).
  const isStart = isStartRow(row, running !== undefined)
  const isUndecided = running !== undefined && !isStart && (block === undefined || block.turn === running) && !ASKS_THE_PERSON.has(nextTool?.tool ?? '')

  if (at >= 0) {
    const is = isNarrationAt(quietFlow, at) || isUndecided
    const answers = scanned.get(quietFlow) ?? new Map<string, boolean>()

    answers.set(key, is)
    scanned.set(quietFlow, answers)

    return is
  }

  return isUndecided || (await isNarrationRow($, row))
}

// What each flow says of each row it holds, while that flow is the one held: dropped with it.
const scanned = new WeakMap<readonly FlowStamp[], Map<string, boolean>>()
