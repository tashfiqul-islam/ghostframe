// The user prompt's row: the turn rule with its submit time, then `you` and the message behind a rail. While Cockpit
// is on, the rule is E.1's `─ [ TURN n ] ─── 09:23` (amendment 12), also above the engine's own row in ctrl+o.
import type { EngineInterface, On, RenderElement, RenderPropsOf } from 'claude-code'

import { readEnvOnce } from '../../cockpit/switch'
import type { PromptStamp } from '../../../types'
import { drawAgentNotice, isQuietRow } from '../../cockpit/left'
import { readRoster } from '../../cockpit/log'
import { G, layout, ruleWidth } from '../../shared/layout'
import type { Lay } from '../../shared/layout'
import { Rule } from '../../shared/rule'
import type { Ui } from '../../shared/rule'
import { fmtClock } from '../../shared/time'
import { C } from '../../shared/tokens'
import { claim } from '../claim'
import { cell } from '../draw/cell'
import { drawParts } from '../draw/parts'
import { sessionCwd } from '../ledger/session'
import { readPrompts, storedPrompts } from '../ledger/state'
import { lastSubmittedAt } from '../ledger/turns'
import { wrapPlain } from '../prose'
import { turnClock, turnRuleParts } from '../turn-rule'

// Which submit stamp each turn rule shows, by the row's request: the same prompt typed
// twice has two stamps. A row keeps the stamp it claimed. A first draw takes the submit
// that just landed when it is free (the row the engine draws for it), else the oldest
// stamp no other row holds (rows redrawn in transcript order after a reload), so an
// earlier rule never takes a later submit's time. Written while drawing.
// shortcut: an older row with the same text that first draws after a reload, between a
// submit and its own row, takes that submit; the new row then shows the older time.
// The engine draws a submitted prompt first in a stand-in row (request `placeholder`, live in 2.1.330), then in
// its own row: the stand-in shows the stamp but never claims it, or the real row would find it taken.
const PLACEHOLDER = 'placeholder'
const promptClaims = new Map<string, number>()
const claimPrompt = (row: string, text: string, list: readonly PromptStamp[]) =>
  claim(
    row === PLACEHOLDER ? new Map(promptClaims) : promptClaims,
    row,
    list.filter(p => p.text.trim() === text.trim()),
    p => p.at,
    lastSubmittedAt()
  )

/**
 * The turn rule while Cockpit is on (E.1, amendment 12): the prompt's stamp, found by the row the engine draws it
 * under (the same live and after a resume), else claimed as before; its turn number and what came before it; its
 * clock, with the day when the previous prompt's was another. At the receipt's width, so both end on one edge.
 * @param $ the engine interface
 * @param ui the site's elements
 * @param row the row's request
 * @param text the prompt's text
 * @param lay the transcript's layout
 * @returns the rule's row
 */
async function turnRule($: EngineInterface, ui: Ui, row: string, text: string, lay: Lay): Promise<RenderElement> {
  const live = await readPrompts($)
  // A resumed transcript is drawn before the session starts (amendment 8): its stamps are still only in the store.
  const list = live.length > 0 || sessionCwd() !== undefined ? live : await storedPrompts($)
  // The stand-in may show a stamp another row holds (it claims nothing); a real row claims only a stamp with no row.
  const stamp = list.find(p => p.row === row) ?? claimPrompt(row, text, row === PLACEHOLDER ? list : list.filter(p => p.row === undefined))
  const prev = stamp === undefined ? undefined : list[list.indexOf(stamp) - 1]
  const clock = stamp === undefined ? '' : turnClock(stamp.at, prev?.at)

  return drawParts(ui, turnRuleParts(stamp?.turnNo, stamp?.after, clock, ruleWidth(lay) ?? lay.width), 'rule')
}

function durationLabel(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))

  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/**
 * Whether a row is one of this session's agents speaking: the notice that it finished (`task-notification`, its
 * task an agent) or its message to the main loop (`peer`, from an agent's name or type). Cockpit's roster says which
 * agents this session launched (the engine's list may have dropped one that finished), else the engine's own list;
 * a list it cannot give keeps the row.
 * @param $ the engine interface
 * @param p the row's props
 * @returns whether the row is an agent's
 */
async function isAgentRow($: EngineInterface, p: RenderPropsOf['UserMessage']): Promise<boolean> {
  const id = p.origin.kind === 'task-notification' ? p.task?.id : undefined
  const from = p.origin.kind === 'peer' ? p.from?.name : undefined

  if (id === undefined && from === undefined) return false

  const task = p.origin.kind === 'task-notification' ? p.task : undefined

  if ((await readRoster($)).some(a => a.id === id || (task?.toolUseId !== undefined && a.call === task.toolUseId))) return true

  try {
    const agents = await $.agent.list()

    return agents.some(a => a.id === id || (from !== undefined && (a.name === from || a.type === from || a.description === from)))
  } catch (error: unknown) {
    $.ui.log(`ghostframe: agent list unavailable: ${String(error)}`)

    return false
  }
}

/**
 * Adds the user prompt's drawing (`UserMessage`).
 * @param on the `on` that `register` receives
 */
export function registerPrompt(on: On): void {
  // User prompt: peach rail over the full height, text verbatim. Task notifications get the tree look.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    // Cockpit's on switch, read before the first draw decides (a copy of the module loaded by `/tui` or a resume draws before `session.start`).
    await readEnvOnce($)

    if (e.surface !== 'terminal' || e.props.text.length === 0) {
      return next(e)
    }

    // ctrl+o: the prompt row is the engine's (amendment 11); Cockpit's turn rule opens it, the same as folded.
    if (e.props.isExpanded) {
      const lay = layout(e.viewport?.columns)

      if (e.props.origin.kind !== 'composer' || lay === undefined || !isQuietRow(e)) return next(e)

      const ui = $.ui.resolve(e)
      const rule = await turnRule($, ui, e.requestId, e.props.text, lay)

      return (
        <ui.Box flexDirection="column">
          <ui.Box marginTop={1}>{rule}</ui.Box>
          {await next(e)}
        </ui.Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)

    // Quiet: an agent's notice or message is the pane's (`[ AGENTS ]`); the row draws nothing, except in fallback
    // for an agent that failed (its `✕` row).
    if (isQuietRow(e) && (await isAgentRow($, e.props))) {
      const lay = layout(e.viewport?.columns)

      return drawAgentNotice($, e, ruleWidth(lay) ?? lay?.width ?? 0)
    }

    if (e.props.origin.kind === 'task-notification') {
      const launched = /launched|started/i.test(e.props.text)
      const ms = e.props.task?.durationMs

      return (
        <Box flexWrap="nowrap">
          <Box flexShrink={0}>
            <Text color={launched ? C.accent : C.muted}>{'◇ '}</Text>
          </Box>
          <Box flexShrink={1} minWidth={0}>
            <Text color={C.text} wrap="truncate-end">
              {e.props.text.split('\n')[0] ?? ''}
            </Text>
          </Box>
          {ms !== undefined && (
            <Box flexShrink={0}>
              <Text color={C.muted}>{` · ${durationLabel(ms)}`}</Text>
            </Box>
          )}
        </Box>
      )
    }

    const lay = layout(e.viewport?.columns)

    if (e.props.origin.kind !== 'composer' || lay === undefined) {
      return next(e)
    }

    const width = lay.width

    // Turn open rule with the submit time (dropped when we never saw the submit; v6's claimed by text),
    // then `you` in the gutter and the message behind a ▎ rail on every row.
    const rows = wrapPlain(e.props.text, width - 2)
    const ui = $.ui.resolve(e)
    // Cockpit's left (docked or fallback): E.1's turn rule; otherwise the v6 rule, as before.
    const v6 = isQuietRow(e) ? undefined : claimPrompt(e.requestId, e.props.text, await readPrompts($))
    const rule = isQuietRow(e)
      ? await turnRule($, ui, e.requestId, e.props.text, lay)
      : Rule(ui, v6 ? { text: fmtClock(v6.at), color: C.muted } : undefined, undefined, ruleWidth(lay))

    return (
      <Box flexDirection="column">
        {/* §0.2: one blank row between the last turn's footer rule and this one. */}
        <Box marginTop={1}>{rule}</Box>
        {cell(
          ui,
          lay,
          { text: 'you', color: C.text },
          // One Text for the whole message: rows pre-wrapped to the measure, joined by \n.
          <Text wrap="wrap">
            {rows.flatMap((row, i) => [
              ...(i > 0 ? ['\n'] : []),
              <Text key={`${i}.rail`} color={C.accent}>
                {G.rail}
              </Text>,
              <Text key={`${i}.text`} color={C.textBright}>{` ${row}`}</Text>
            ])}
          </Text>,
          1
        )}
      </Box>
    )
  })
}
