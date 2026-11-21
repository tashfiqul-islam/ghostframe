// Activity (§5.4 under §0.1 r1, r2, r14). A standalone call's row (`ToolUse`): a step row, a browser frame's row,
// the fold row, or the engine's row in the grid.
import type { On } from 'claude-code'

import { isQuietRow } from '../../../cockpit/left'
import { layout } from '../../../shared/layout'
import { foldOf, foldRow } from '../../activity/fold'
import { stepParts } from '../../activity/row'
import { activityHead } from '../../activity/rule'
import { stepOf } from '../../activity/steps'
import { browserTarget, browserTool, browserTop, browserUrl, browserVerb, urlBar } from '../../browser'
import { engineInGutter, inGrid } from '../../draw/grid'
import { drawParts, drawRows } from '../../draw/parts'
import { drawStep, stepTime } from '../../draw/step'
import { frameRow } from '../../frame'
import { afterNarration, browserOpenAbove, flowPlace, isBrowserTool } from '../../ledger/flow'
import { sessionCwd } from '../../ledger/session'
import { openerCaps, readAsked, readFirstTools, readFlow, readSteps, readStreaming, readTurn } from '../../ledger/state'
import { quietEvent } from './quiet'

/**
 * Adds a standalone call's drawing (`ToolUse`).
 * @param on the `on` that `register` receives
 */
export function registerToolUse(on: On): void {
  // A standalone call's row. ctrl+o (expanded) stays the engine's; a tool we can't read is
  // the engine's row, in the gutter grid.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const lay = layout(e.viewport?.columns)
    const width = lay?.width
    // Only the paths that hand the row to the engine pay for the quieted output.
    const quiet = () => quietEvent(e)

    if (e.surface !== 'terminal' || e.props.isExpanded || lay === undefined || width === undefined) {
      return next(quiet())
    }

    const p = e.props

    // Quiet: an agent launch is the pane's (`[ STEPS ]` and `[ AGENTS ]`); the engine's launch row draws nothing.
    if (isQuietRow(e.requestId) && (p.tool === 'Agent' || p.tool === 'Task')) {
      return $.ui.resolve(e).Box({})
    }

    const isAsking = (await readAsked($)).includes(p.tool_use_id)
    const browser = browserTool(p.tool)
    const step = stepOf(
      p.tool,
      p.input,
      p.output,
      { ...p, isAsking },
      sessionCwd(),
      browser === undefined ? undefined : { verb: browserVerb(browser, p.input), target: browserTarget(browser, p.input), isPath: false }
    )
    const list = await readSteps($)
    const opensTurn = (await readFirstTools($)).includes(p.tool_use_id)
    const blocks = await readFlow($)
    const place = flowPlace(blocks, f => f.kind === 'tool' && f.key === p.tool_use_id, await readStreaming($), await readTurn($))
    const above = browserOpenAbove(blocks, place)
    const capsRow = opensTurn ? await openerCaps($, o => o.key === p.tool_use_id, width) : undefined
    const ui = $.ui.resolve(e)
    const head = activityHead(list, p.tool_use_id)
    const time = stepTime(list, p.tool_use_id)
    const fold = foldOf(list, p.tool_use_id, isBrowserTool)
    // §0.2: narration right above this row → one blank row between them.
    const gap = afterNarration(blocks, place)

    // A settled turn: its first folded step draws the one `◦ N earlier steps` row (with
    // the activity rule and `claude` it carried); the other folded steps draw nothing.
    if (fold !== undefined) {
      return fold.isAnchor ? inGrid(ui, head, lay, drawParts(ui, foldRow(fold, width), 'fold'), opensTurn, { close: above, caps: capsRow, gap }) : ui.Box({})
    }

    if (step === undefined) {
      return engineInGutter(ui, await next(quiet()), head, lay, opensTurn, { close: above, caps: capsRow, gap })
    }

    // A browser call whose place is known: one row of the session frame. The first of a
    // run draws the top edge; the block after the run draws the bottom (§5.14).
    if (browser !== undefined && place !== undefined) {
      const opens = above === 0
      const url = browserUrl(browser, p.input)
      const lines = [
        ...(opens ? [browserTop(width, browser.engine)] : []),
        ...(url !== undefined ? [urlBar(width, url, { t: step.dot.text, color: step.dot.color }, time)] : []),
        ...stepParts(step, time, width - 4).map(r => frameRow(width, r))
      ]

      return inGrid(ui, head, lay, drawRows(ui, lines, 'browser'), opensTurn, {
        caps: capsRow,
        gap: (opens && head === undefined && !opensTurn) || gap
      })
    }

    return inGrid(ui, head, lay, drawStep(ui, step, time, width, 'step'), opensTurn, { close: above, caps: capsRow, gap })
  })
}
