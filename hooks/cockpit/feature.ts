// Cockpit: the pane beside the transcript. Phase 1, the seat: it opens at session start and docks at the
// width rule (seat.ts, pane.tsx). Phase 2, the step log: the turn's `[ STEPS ]` (steps/, log.ts). Phase 3, the
// head: `[ NOW ]` / `[ LAST ]` above it, and the left's live area reduced to one row (head.ts). Phase 4,
// the quiet left: docked, the transcript keeps the conversation, `↗` rows and the receipt (quiet.ts, left.tsx).
// Phase 5, agents: `[ AGENTS ]` from `agent.spawn` and `agent.report` (agents/), one `[ STEPS ]` row per launch.
// Spec: docs/design/cockpit-v7.md C.1, E.1, E.5, E.24, E.32, E.33, E.36 to E.40, H; cockpit-v7-amendments.md.
import type { EngineInterface, PluginOptions, SessionStartInput } from 'claude-code'

import { logAgentEnd, logAgentStart } from './log'
import { FIRST_COLUMNS, PANE, logSeatError, registerPane } from './pane'
import type { On } from './pane'
import { isEnvSet, isOn, setEnvOn, setOptionOn } from './switch'

type SessionStart = Pick<SessionStartInput, 'isInteractive' | 'surface'>

/**
 * Cockpit's part of `session.start` (a plugin hooks it once): registers `/cockpit` and opens the pane.
 * Unasked, the engine docks it from 144 columns (110 once asked) and holds it undrawn below that.
 * @param $ the engine interface
 * @param e the session start's input
 */
export async function startCockpit($: EngineInterface, e: SessionStart): Promise<void> {
  await $.command.register({ name: PANE, description: 'Open or close the Cockpit pane' })
  setEnvOn(await isEnvSet($))

  if (isOn() && e.isInteractive && e.surface === 'terminal') {
    void $.ui.open({ id: PANE, columns: FIRST_COLUMNS }).catch((error: unknown) => logSeatError($, error))
  }
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

      try {
        await logAgentStart($, { id: started.agentId, call: e.tool_use_id, parent: e.parentAgentId ?? null, name, isBackground: e.background })
      } catch (error: unknown) {
        $.ui.log(`cockpit: agent row failed: ${String(error)}`)
      }
    }

    return started
  }).catch((_$, e, next) => next(e)) // a row that fails never holds an agent back

  on('agent.report', async ($, e, next) => {
    const reported = await next(e)

    try {
      await logAgentEnd($, { id: e.agentId, status: e.status, text: e.text })
    } catch (error: unknown) {
      $.ui.log(`cockpit: agent row failed: ${String(error)}`)
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
  registerAgents(on)
}
