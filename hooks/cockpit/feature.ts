// Cockpit: the pane beside the transcript. The seat: it opens at session start and docks at the width rule (seat.ts,
// pane.tsx). The step log: the turn's steps (steps/, log.ts). The quiet left: docked, the transcript keeps the
// conversation, the event rows and the receipt (left.tsx). Agents: the roster from `agent.spawn` and `agent.report`
// (agents/). Every row is drawn by the v8 renderers (v8/, ../transcript/v8/).
// Spec: docs/design/cockpit.md; docs/design/history/cockpit-v7.md C.1, E.1, E.5, E.24, E.32, E.33, E.36 to E.40, H.
import { readVersion } from './version'
import type { EngineInterface, PluginOptions, SessionStartInput } from 'claude-code'

import { logAgentEnd, logAgentStart, logSessionStart } from './log'
import { PANE, STEPS, markStarted, setDockedFlag } from './mode'
import { registerBand } from './band'
import { logSeatError, markStartSeated, registerPane, seatAtStart } from './pane'
import type { On } from './pane'
import { envSwitchOf, isOn, noticeSink, setEnvSwitch, setOptionOn } from './switch'

type SessionStart = Pick<SessionStartInput, 'isInteractive' | 'surface'>

/**
 * Cockpit's part of `session.start` (a plugin hooks it once): registers `/cockpit` and opens the pane.
 * Unasked, the engine docks it from 144 columns (110 once asked) and holds it undrawn below that.
 * @param $ the engine interface
 * @param e the session start's input
 */
export async function startCockpit($: EngineInterface, e: SessionStart): Promise<void> {
  markStarted()
  await $.command.register({ name: PANE, description: 'Open or close the Cockpit pane' })
  setEnvSwitch(await envSwitchOf($))
  await $.command.register({
    name: STEPS,
    description: 'Pin a past turn into the Cockpit pane: /steps <n>; /steps alone for live; /steps <n> all prints its steps'
  })

  // The wordmark's version (8.12), read once; a manifest that cannot be read keeps `dev`.
  if (isOn()) await readVersion($)

  try {
    await logSessionStart($)
  } catch (error: unknown) {
    $.ui.log(`cockpit: history not restored: ${String(error)}`, noticeSink())
  }

  if (isOn() && e.isInteractive && e.surface === 'terminal') {
    void seat($).catch((error: unknown) => logSeatError($, error))
  } else {
    markStartSeated()
  }
}

/**
 * Opens the pane at session start. Placed, the resumed transcript (drawn before the pane) draws again in its mode.
 * @param $ the engine interface
 */
async function seat($: EngineInterface): Promise<void> {
  const isPlaced = await seatAtStart($)

  if (!isPlaced) return

  setDockedFlag(true)
  $.ui.invalidate('ui.render')
}

/**
 * Adds the roster's hooks: an agent's start and its report. Both observe only: the spawn and the report go on
 * exactly as they would.
 * @param on the `on` that `register` receives
 */
function registerAgents(on: On): void {
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)

    if (started.deny === undefined && started.agentId !== undefined) {
      const name = [e.description, e.name ?? '', e.subagentType].find(n => n.trim().length > 0) ?? 'agent'
      // A peer's message names its sender by the agent's name, else its type: kept, so a resumed row is known.
      const called = [e.name ?? '', e.subagentType].filter(n => n.trim().length > 0)

      try {
        await logAgentStart($, { id: started.agentId, call: e.tool_use_id, parent: e.parentAgentId ?? null, name, called, isBackground: e.background })
      } catch (error: unknown) {
        $.ui.log(`cockpit: agent row failed: ${String(error)}`, noticeSink())
      }
    }

    return started
  }).catch((_$, e, next) => next(e)) // a row that fails never holds an agent back

  on('agent.report', async ($, e, next) => {
    const reported = await next(e)

    try {
      await logAgentEnd($, { id: e.agentId, status: e.status, text: e.text })
    } catch (error: unknown) {
      $.ui.log(`cockpit: agent row failed: ${String(error)}`, noticeSink())
    }

    return reported
  }).catch((_$, e, next) => next(e)) // nor its report
}

/**
 * Adds Cockpit's hooks: the `/cockpit` command, the pane's drawing, and the roster's agent events.
 * @param on the `on` that `register` receives
 * @param options the plugin's options; `cockpit: true` turns Cockpit on
 */
export function registerCockpit(on: On, options: PluginOptions): void {
  setOptionOn(options['cockpit'] === true)

  registerPane(on)
  registerBand(on)
  registerAgents(on)
}
