// The engine's at-a-glance agent list under the prompt (`AgentRow`): while Cockpit's pane is docked, its
// `[ AGENTS ]` is the roster, so the engine's rows are hidden; in fallback, while a turn runs, the live area's
// roster is. Hidden rows stay in the engine's full list.
import type { On } from 'claude-code'

import { isFallback, isQuiet } from '../../cockpit/left'
import { runningTurn } from '../../cockpit/log'

/**
 * Adds the agent list's rows (`AgentRow`).
 * @param on the `on` that `register` receives
 */
export function registerAgentRows(on: On): void {
  on('ui.render', { component: 'AgentRow' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(isQuiet() || (isFallback() && (await runningTurn($)) !== undefined))) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, isHidden: true } })
  })
}
