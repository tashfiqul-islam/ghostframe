// The engine's at-a-glance agent list under the prompt (`AgentRow`): while Cockpit's pane is docked, its
// `[ AGENTS ]` is the roster, so the engine's rows are hidden; in fallback, while a turn runs, the live area's
// roster is. Hidden rows stay in the engine's full list.
import type { On } from 'claude-code'

import { readEnvOnce } from '../../cockpit/switch'
import { isFallback, isQuiet } from '../../cockpit/left'
import { runningTurn } from '../../cockpit/log'
import { dormantFor } from '../../shared/engine'

/**
 * Adds the agent list's rows (`AgentRow`).
 * @param on the `on` that `register` receives
 */
export function registerAgentRows(on: On): void {
  on('ui.render', { component: 'AgentRow' }, async ($, e, next) => {
    // Dormant (shared/engine): the engine draws its own row.
    if (await dormantFor($)) return next(e)
    // Cockpit's on switch, read before the first draw decides (a copy of the module loaded by `/tui` or a resume draws before `session.start`).
    await readEnvOnce($)

    if (e.surface !== 'terminal' || !(isQuiet() || (isFallback() && (await runningTurn($)) !== undefined))) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, isHidden: true } })
  })
}
