// A reply's summary row: text written between tool calls, dim in the content column.
import type { EngineInterface, RenderInput } from 'claude-code'

import type { Lay } from '../../../shared/layout'
import { C } from '../../../shared/tokens'
import { cell, claude } from '../../draw/cell'
import { ANY_TURN, isTurnOpener } from '../../ledger/flow'
import { readFirstTexts } from '../../ledger/state'
import { wrapPlain } from '../../prose'

/**
 * Draws a reply's summary row, `claude` in the gutter when it stands for the turn's opening text.
 * @param $ the engine interface
 * @param e the reply's render event
 * @param lay the grid's layout at this width
 * @returns the summary's row
 */
export async function drawSummary($: EngineInterface, e: RenderInput<'AssistantMessage', 'terminal'>, lay: Lay) {
  const width = lay.width
  const sui = $.ui.resolve(e)
  const { Text } = sui
  const plain = e.props.text.replace(/\s+/g, ' ').trim()
  const rows = wrapPlain(plain, width)
  const key = plain.replace(/…$/, '').trim()
  const label = e.props.isFirstOfReply && key.length >= 20 && isTurnOpener(await readFirstTexts($), key, ANY_TURN) ? 'claude' : ''

  return cell(
    sui,
    lay,
    claude(label.length > 0),
    <Text color={C.dim} wrap="wrap">
      {rows.join('\n')}
    </Text>,
    1
  )
}
