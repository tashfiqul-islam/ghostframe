// Activity (§5.4 under §0.1 r1, r2, r14). A standalone call's row (`ToolUse`): a step row, a browser frame's row,
// the fold row, or the engine's row in the grid.
import type { On } from 'claude-code'
import { noteOwnTime } from '../../../shared/budget'

import { readEnvOnce } from '../../../cockpit/switch'
import { drawQuietCall, drawUnfoldedCall, isQuietRow, leftCells, noteView } from '../../../cockpit/left'
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
import { readFlow } from '../../../shared/flow'
import { openerCaps, readAsked, readFirstTools, readSteps, readStreaming, readTurn } from '../../ledger/state'
import { quietEvent } from './quiet'
import { dormantFor } from '../../../shared/engine'

/**
 * Adds a standalone call's drawing (`ToolUse`).
 * @param on the `on` that `register` receives
 */
export function registerToolUse(on: On): void {
  // A standalone call's row. ctrl+o (expanded) stays the engine's; a tool we can't read is
  // the engine's row, in the gutter grid.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    try {
      // Dormant (shared/engine): the engine draws its own row.
      if (await dormantFor($)) return next(e)
      // Cockpit's on switch, read before the first draw decides (a copy of the module loaded by `/tui` or a resume draws before `session.start`).
      await readEnvOnce($)

      const lay = layout(e.viewport?.columns)
      const width = lay?.width
      // Only the paths that hand the row to the engine pay for the quieted output.
      const quiet = () => quietEvent(e)

      // ctrl+o (E.4): every call is a step row under its sentence, with its diff or output in a frame.
      if (e.surface === 'terminal') noteView($, e.props.isExpanded)
      if (e.surface === 'terminal' && e.props.isExpanded === true && lay !== undefined && width !== undefined) {
        const unfolded = await drawUnfoldedCall($, e, leftCells(e))

        if (unfolded !== undefined) return unfolded
      }

      if (e.surface !== 'terminal' || e.props.isExpanded || lay === undefined || width === undefined) {
        return next(quiet())
      }

      const p = e.props

      // Quiet: every step is the pane's, a fetch or an agent launch as much as a folded group; only a push or a pull
      // request leaves a row here (E.5).
      if (isQuietRow(e)) {
        return drawQuietCall($, e, leftCells(e))
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
    } finally {
      noteOwnTime($, 'ui.render ToolUse', next.budget)
    }
  })
}
