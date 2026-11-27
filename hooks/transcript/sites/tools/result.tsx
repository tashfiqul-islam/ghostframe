// Under a standalone row (`ToolResult`): outcome cards, a new file's diff card, the plan line, the task list.
import type { On } from 'claude-code'
import { noteOwnTime } from '../../../shared/budget'

import { isQuietRow, isUnfoldedResult } from '../../../cockpit/left'
import { mcpName } from '../../../shared/calls/describe'
import { isObject } from '../../../shared/calls/fields'
import { remember } from '../../../shared/held'
import { layout } from '../../../shared/layout'
import type { Part } from '../../../shared/parts'
import { relPath } from '../../../shared/url'
import { foldOf } from '../../activity/fold'
import { diffRows } from '../../activity/diff'
import { drawDiff } from '../../draw/diff'
import { engineInGutter, inGrid } from '../../draw/grid'
import { drawFrame, drawParts } from '../../draw/parts'
import { isBrowserTool } from '../../ledger/flow'
import { sessionCwd } from '../../ledger/session'
import { readShips, readSteps, readTestRuns } from '../../ledger/state'
import { cardCalls, mergeShips, previousRun, shippedFrame, testsFrame } from '../../outcome'
import { planLine, tasksFrame } from '../../states'
import { quietEvent } from './quiet'
import { dormantFor } from '../../../shared/engine'

// Tools whose result rows we draw (the step row already carries the result).
const OWN = new Set([
  'Read',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Write',
  'Bash',
  'PowerShell',
  'Grep',
  'Glob',
  'WebFetch',
  'WebSearch',
  'Agent',
  'Task',
  'TodoWrite',
  'Skill',
  'AskUserQuestion',
  'ExitPlanMode',
  'EnterPlanMode',
  'TaskCreate',
  'TaskUpdate'
])
const OWN_RESULT = (tool: string) => OWN.has(tool) || mcpName(tool) !== undefined

// Each outcome card's lines as first drawn complete, by call and measure: a card, once
// on screen, never changes (§6, streaming stability). A card that gives way to a later
// run's simply stops drawing. Written while drawing, so it lives here, like `frozen`.
const cardLines = new Map<string, Part[][][]>()
const CARDS_MAX = 300
// The calls whose result row drew a frame (a card, the task list) as last drawn, so the
// prose under one knows its own blank row is already there. Written while drawing.
const framedCalls = new Map<string, true>()
const FRAMED_MAX = 2000

/**
 * Whether a call's result row drew a frame (a card, the task list) as last drawn.
 * @param id the call's id
 * @returns true when it did, so the prose under it knows its blank row is already there
 */
export function isFramed(id: string): boolean {
  return framedCalls.has(id)
}

function frozenCard(key: string, ready: boolean, make: () => Part[][][]): Part[][][] {
  const held = cardLines.get(key)

  if (held !== undefined) return held

  const lines = make()

  if (ready) remember(cardLines, key, lines, CARDS_MAX)

  return lines
}

/**
 * Adds the drawing under a standalone row (`ToolResult`).
 * @param on the `on` that `register` receives
 */
export function registerToolResult(on: On): void {
  // Under a standalone row: the diff card for a small new file, outcome cards, states;
  // nothing for the rest. A shell's output never shows here: the row's result says how
  // it went, and ctrl+o (expanded) is the engine's output, without its own notes.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    try {
      // Dormant (shared/engine): the engine draws its own row.
      if (await dormantFor($)) return next(e)
      const lay = layout(e.viewport?.columns)
      const width = lay?.width
      const { tool, output, isErrored } = e.props
      // Only the paths that hand the result to the engine pay for the quieted output.
      const quiet = () => quietEvent(e)

      // ctrl+o (E.4): a step's output is in the frame under its row; its result row draws nothing.
      if (e.surface === 'terminal' && e.props.isExpanded === true && (await isUnfoldedResult($, e.props.tool_use_id))) {
        return $.ui.resolve(e).Box({})
      }

      if (e.surface !== 'terminal' || e.props.isExpanded || lay === undefined || width === undefined) {
        return next(quiet())
      }

      // Cockpit on: the call's row is Cockpit's (a pane step, or fallback's failure rows), so its result row draws nothing;
      // an outcome card here would sit off the spine, in the look Cockpit replaces.
      if (isQuietRow(e)) return $.ui.resolve(e).Box({})

      const ui = $.ui.resolve(e)
      const { Box } = ui
      // The engine's own result block, indented under its row in the content column.
      const engine = async () => engineInGutter(ui, await next(quiet()), undefined, lay, false)

      // A step folded into its turn's settled row takes its result with it.
      if (foldOf(await readSteps($), e.props.tool_use_id, isBrowserTool) !== undefined) {
        return <Box />
      }

      if (!OWN_RESULT(tool)) {
        return engine()
      }

      // Outcome cards (§5.15, §5.16), read off the call when it ended; a failing run is an
      // errored call, so this comes before the error branch. Nothing read → the rows below.
      // Only a turn's last test run and last shipping call draw a card (the final
      // evidence); earlier ones are their step rows, which already say how they went.
      if (tool === 'Bash' || tool === 'PowerShell') {
        const id = e.props.tool_use_id
        const stepList = await readSteps($)
        const runs = await readTestRuns($)
        const shipList = await readShips($)
        const shows = cardCalls(stepList, runs, shipList).has(id)
        const run = shows ? runs.find(r => r.id === id) : undefined
        const ship = shows && shipList.some(x => x.id === id) ? mergeShips(stepList, shipList, id) : undefined

        if (run === undefined && ship === undefined) framedCalls.delete(id)

        if (run !== undefined || ship !== undefined) {
          const ms = stepList.find(x => x.id === id)?.ms ?? null
          const cards = frozenCard(`${id}|${width}`, ms !== null, () => [
            ...(run !== undefined ? [testsFrame(width, run, previousRun(runs, id), ms)] : []),
            ...(ship !== undefined ? [shippedFrame(width, ship)] : [])
          ])

          remember(framedCalls, id, true, FRAMED_MAX)

          return inGrid(
            ui,
            undefined,
            lay,
            cards.map((l, i) => <Box key={`card${i}`}>{drawFrame(ui, l)}</Box>)
          )
        }
      }

      if (isErrored) {
        return <Box />
      }

      // Edits: the step row's `+a −r` is enough; ctrl+o (expanded, handled above) shows the
      // engine's full diff. The card shows only for a new file under 12 lines.
      if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'Write') {
        const isNew = typeof output === 'object' && output !== null && (output as { type?: unknown }).type === 'create'
        const diff = isNew ? diffRows(output) : undefined

        return diff !== undefined && diff.rows.length < 12 ? inGrid(ui, undefined, lay, drawDiff(ui, diff, width)) : <Box />
      }

      if (tool === 'Bash' || tool === 'PowerShell') {
        const o = isObject(output) ? output : undefined
        const special =
          o === undefined ||
          o['isImage'] === true ||
          o['backgroundTaskId'] !== undefined ||
          o['persistedOutputPath'] !== undefined ||
          o['rawOutputPath'] !== undefined ||
          o['structuredContent'] !== undefined

        if (special) {
          return engine()
        }

        return <Box />
      }

      // An approved plan: one dim line in the content column; ctrl+o (expanded, handled
      // above) is the engine's whole plan. Unreadable → the engine's block.
      if (tool === 'ExitPlanMode') {
        const line = planLine(width, output, p => relPath(p, sessionCwd()))

        return line === undefined ? engine() : inGrid(ui, undefined, lay, drawParts(ui, line, 'plan'))
      }

      // States (§5.10): the task list is framed; unreadable → the engine's.
      if (tool === 'TodoWrite') {
        const lines = tasksFrame(width, output)

        if (lines === undefined) return engine()

        remember(framedCalls, e.props.tool_use_id, true, FRAMED_MAX)

        return inGrid(ui, undefined, lay, drawFrame(ui, lines))
      }

      return <Box />
    } finally {
      noteOwnTime($, 'ui.render ToolResult', next.budget)
    }
  })
}
