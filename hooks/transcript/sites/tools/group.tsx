// A folded group of reads and searches (`ToolGroup`): one step row per call, the fold row, or the engine's line.
import type { On } from 'claude-code'

import { drawQuietGroup, isQuietRow } from '../../../cockpit/left'
import { layout, ruleWidth } from '../../../shared/layout'
import { foldOf, foldRow } from '../../activity/fold'
import { activityHead } from '../../activity/rule'
import { stepOf } from '../../activity/steps'
import { engineInGutter, inGrid } from '../../draw/grid'
import { drawParts } from '../../draw/parts'
import { drawStep, stepTime } from '../../draw/step'
import { afterNarration, browserOpenAbove, flowPlace, isBrowserTool } from '../../ledger/flow'
import { sessionCwd } from '../../ledger/session'
import { openerCaps, readAsked, readFirstTools, readFlow, readSteps, readStreaming, readTurn } from '../../ledger/state'

/**
 * Adds a folded group's drawing (`ToolGroup`).
 * @param on the `on` that `register` receives
 */
export function registerToolGroup(on: On): void {
  // A folded group of reads/searches: one timeline row per call (v3), when every call is
  // one we can read and the group holds nothing but calls. Expanded → the engine.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const lay = layout(e.viewport?.columns)
    const width = lay?.width

    if (e.surface !== 'terminal' || e.props.isExpanded || lay === undefined || width === undefined) {
      return next(e)
    }

    // Quiet: the steps are the pane's; only a push or a pull request leaves a row here (E.5).
    if (isQuietRow(e.requestId)) {
      return drawQuietGroup($, e, ruleWidth(lay) ?? width)
    }

    const asking = await readAsked($)
    const rows =
      e.props.isCallsOnly === true
        ? e.props.calls.map(c =>
            stepOf(c.tool, c.input, c.output, { ...c, isAsking: c.tool_use_id !== undefined && asking.includes(c.tool_use_id) }, sessionCwd())
          )
        : []
    const list = await readSteps($)
    const first = e.props.calls[0]?.tool_use_id
    const opensTurn = first !== undefined && (await readFirstTools($)).includes(first)
    const blocks = await readFlow($)
    const place = first === undefined ? undefined : flowPlace(blocks, f => f.kind === 'tool' && f.key === first, await readStreaming($), await readTurn($))
    const extra = {
      close: browserOpenAbove(blocks, place),
      caps: opensTurn ? await openerCaps($, o => o.key === first, width) : undefined,
      gap: afterNarration(blocks, place)
    }
    const ui = $.ui.resolve(e)
    const folds = e.props.calls.map(c => foldOf(list, c.tool_use_id, isBrowserTool))
    const readable = rows.length > 0 && rows.every(r => r !== undefined)

    // A settled turn reaches into this group: folded calls leave, the anchor draws the
    // fold row. A group we can't draw whole folds only when all of it folds.
    if (folds.some(f => f !== undefined) && (readable || folds.every(f => f !== undefined))) {
      const anchor = folds.find(f => f?.isAnchor === true)
      const kept = rows.flatMap((r, i) =>
        folds[i] !== undefined || r === undefined ? [] : [drawStep(ui, r, stepTime(list, e.props.calls[i]?.tool_use_id), width, `step-${i}`)]
      )

      if (anchor === undefined && kept.length === 0) {
        return ui.Box({})
      }

      return inGrid(
        ui,
        anchor === undefined ? undefined : activityHead(list, first),
        lay,
        [...(anchor === undefined ? [] : [drawParts(ui, foldRow(anchor, width), 'fold')]), ...kept],
        opensTurn && anchor !== undefined,
        extra
      )
    }

    // Anything we can't draw whole is the engine's line, kept whole: indented to the step
    // dots, under the activity rule and `claude` when it opens the turn.
    if (rows.length === 0 || rows.some(r => r === undefined)) {
      return engineInGutter(ui, await next(e), activityHead(list, first), lay, opensTurn, extra)
    }

    return inGrid(
      ui,
      activityHead(list, first),
      lay,
      rows.map((r, i) => (r === undefined ? null : drawStep(ui, r, stepTime(list, e.props.calls[i]?.tool_use_id), width, `step-${i}`))),
      opensTurn,
      extra
    )
  })
}
