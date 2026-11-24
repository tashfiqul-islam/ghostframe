// The band above the prompt with no pane docked (7.11, 9.2): while background agents still run after Claude's answer,
// one line, `◇◇◇  Waiting on 3 agents` in the agent colour, its count updating in place. The engine draws no spinner
// row while only background agents run, so the left has no live line for it; docked, the pane head says it and the
// band is left to the engine. The `[-]` at the band's right end is the engine's collapse toggle (ctrl+x ctrl+a), drawn
// beside any band row in the five cells `bodyColumns` leaves out; Cockpit cannot remove it.
import type { On } from 'claude-code'

import { GLYPH } from '../shared/look/glyphs'
import { TOKEN } from '../shared/look/palette'
import { waitingOn } from './agents/roster'
import { readLog, readRoster, readSecond } from './log'
import { docked } from './mode'
import { isOn } from './switch'

/**
 * The band's waiting line: what it says while `n` background agents run after the answer.
 * @param n the agents still running
 * @returns the line
 */
export const waitingLine = (n: number): string => `${GLYPH.agent.repeat(n)}  Waiting on ${n} ${n === 1 ? 'agent' : 'agents'}`

/**
 * Adds the band's waiting line.
 * @param on the `on` that `register` receives
 */
export function registerBand(on: On): void {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isOn() || e.surface !== 'terminal' || e.props.hasSurvey || docked()) return next(e)

    // Reading the second redraws the band each second while agents run (the roster's count in place).
    await readSecond($)
    const log = await readLog($)
    const n = log.isTurnRunning ? 0 : waitingOn(await readRoster($))

    if (n === 0) return next(e)

    const { Text } = $.ui.resolve(e)

    return <Text color={TOKEN.agent}>{waitingLine(n)}</Text>
  })
}
