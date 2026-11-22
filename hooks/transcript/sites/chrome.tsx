// The transcript's chrome: the prompt footer's modes, the turn's close rule, the spinner, a slash command's
// output and the info notice under the logo.
import type { On } from 'claude-code'

import type { TurnClose } from '../../../types'
import { drawLive, drawQuietFooter, isQuietRow, noteView } from '../../cockpit/left'
import { G, layout, ruleWidth } from '../../shared/layout'
import { fitParts, partsWidth } from '../../shared/parts'
import type { Part } from '../../shared/parts'
import { Rule } from '../../shared/rule'
import { fmtDuration, fmtTokens } from '../../shared/time'
import { C } from '../../shared/tokens'
import { claim } from '../claim'
import { closeRow } from '../draw/grid'
import { drawParts } from '../draw/parts'
import { readCloses } from '../ledger/state'
import { lastClosedTurn } from '../ledger/turns'
import { spinnerWord } from '../live'
import { commandNotice } from '../notices'

const WARNING = /paused|warn|limit|low|error|fail|denied|stale/i
const SAME_TURN_MS = 250

// Which close each footer row shows, by the row's request: the footer has only a
// duration to go on, and several turns of about the same length (the same prompt run
// again, say) used to leave it no single match, so it dropped its tokens and tally.
// A row keeps the close it claimed. A first draw takes the turn that just completed when
// its duration fits (the row the engine draws as a turn ends), else the oldest unclaimed
// close that fits (rows redrawn in transcript order after a reload). Written while drawing.
const footerClaims = new Map<string, string>()
const claimClose = (row: string, durationMs: number, list: readonly TurnClose[]) =>
  claim(
    footerClaims,
    row,
    list.filter(c => Math.abs(c.durationMs - durationMs) <= SAME_TURN_MS),
    c => c.turn,
    lastClosedTurn()
  )

/**
 * Adds the chrome's drawing: `SessionMode`, `TurnDuration`, `Spinner`, `CommandOutput` and `InfoNotice`.
 * @param on the `on` that `register` receives
 */
export function registerChrome(on: On): void {
  // Mode labels at the right of the prompt footer: grid cells split by │.
  on('ui.render', { component: 'SessionMode' }, ($, e, next) => {
    if (e.surface !== 'terminal') {
      return next(e)
    }

    const modes = e.props.modes

    if (modes.length === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        {modes.map((mode, i) => (
          <Box key={`m${i}`}>
            {i > 0 && <Text color={C.rule}>{'   │   '}</Text>}
            <Text color={WARNING.test(mode) ? C.warn : C.text}>{mode}</Text>
          </Box>
        ))}
      </Box>
    )
  })
  // Turn close: the grid rule, `+` at both ends, `3s · 412 tokens · 2 skills · 1 hook`
  // right (§0.1 r3, r13, §5.17). Each rule finds its own turn by duration; when two turns
  // ran too close to tell apart, the rule shows its duration alone. A browser frame left
  // open by the turn's last calls gets its bottom edge above the rule.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (e.surface === 'terminal') noteView($, e.props.isExpanded)

    if (e.surface !== 'terminal' || e.props.isExpanded) {
      return next(e)
    }

    // Quiet: the footer draws nothing. Each turn's receipt (E.32) ends its answer instead: the turns an agent's
    // reports start share one footer, or get none, so a footer can't say which turn it closes. In fallback, a turn
    // that wrote no text has its capsule and receipt here (E.3 case 3).
    if (isQuietRow(e)) {
      const lay = layout(e.viewport?.columns)

      return drawQuietFooter($, e, ruleWidth(lay) ?? lay?.width ?? 0)
    }

    if (e.props.waitingFor) {
      return next(e)
    }

    const took = fmtDuration(e.props.durationMs)

    if (took.length === 0) {
      return next(e)
    }

    const mine = claimClose(e.requestId, e.props.durationMs, await readCloses($))
    const tokens = mine?.tokens === null || mine?.tokens === undefined ? '' : fmtTokens(mine.tokens)
    const label = [took, tokens, mine?.tally ?? ''].filter(x => x.length > 0).join(G.sep)
    const ui = $.ui.resolve(e)
    const { Box } = ui
    const lay = layout(e.viewport?.columns)
    // §0.2: one blank row above the footer rule; its meta ends at the measure.
    const rule = <Box marginTop={1}>{Rule(ui, undefined, { text: label, color: C.muted }, ruleWidth(lay))}</Box>

    if (mine === undefined || mine.browser === 0 || lay === undefined) {
      return rule
    }

    return (
      <Box flexDirection="column">
        {closeRow(ui, lay, mine.browser)}
        {rule}
      </Box>
    )
  })

  // The spinner (§5.11): props only. The verb says what the turn does; the engine keeps
  // its own time, tokens and `esc` hint. A state's own message stands.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // Docked Cockpit: the live area is one `working` row (E.33).
    const live = e.surface === 'terminal' ? await drawLive($, e) : undefined

    if (live !== undefined) {
      return live
    }

    const word = spinnerWord(e.props.mode)

    if (e.surface !== 'terminal' || e.props.message !== null || word === undefined) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, word, suffix: '' } })
  })
  // Slash-command output: muted, behind a small › (errors keep the engine's red).
  on('ui.render', { component: 'CommandOutput' }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isErrored || e.props.text.trim().length === 0) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Text, Markdown } = ui
    const lay = layout(e.viewport?.columns)
    // One line of output → a notice in the content column: `/  /effort high · applies from next turn`.
    const notice = lay === undefined ? undefined : commandNotice(e.props.command, e.props.args, e.props.text, lay.width)

    if (notice !== undefined && lay !== undefined) {
      return <Box paddingLeft={lay.gutter}>{drawParts(ui, notice, 'notice')}</Box>
    }

    return (
      <Box>
        <Text color={C.muted}>{'› '}</Text>
        <Box flexShrink={1}>
          <Markdown text={e.props.text} dimColor />
        </Box>
      </Box>
    )
  })

  // Info notice under the logo: one line in the content column, `› text · /command`,
  // muted text and dim marks, clipped at the measure (§0.2). No measure → the old row.
  on('ui.render', { component: 'InfoNotice' }, ($, e, next) => {
    if (e.surface !== 'terminal') {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const lay = layout(e.viewport?.columns)

    if (lay !== undefined) {
      const text = e.props.text.replace(/\s+/g, ' ').trim()
      const parts: Part[] = [{ t: '› ', color: C.dim }, { t: text, color: C.muted }, ...(e.props.command ? [{ t: ` · ${e.props.command}`, color: C.dim }] : [])]

      return <Box paddingLeft={lay.gutter}>{drawParts(ui, partsWidth(parts) <= lay.width ? parts : fitParts(parts, lay.width), 'info')}</Box>
    }

    return (
      <Box>
        <Text color={C.muted}>{'› '}</Text>
        <Box flexShrink={1}>
          <Text color={C.muted}>{e.props.command ? `${e.props.text} ${e.props.command}` : e.props.text}</Text>
        </Box>
      </Box>
    )
  })
}
