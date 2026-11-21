// The engine's at-a-glance agent list under the prompt (`AgentRow`): while Cockpit's pane is docked, its
// `[ AGENTS ]` is the roster, so the engine's rows are hidden. Hidden rows stay in the engine's full list.
import type { On } from 'claude-code'

import { isQuiet } from '../../cockpit/left'

/**
 * Adds the agent list's rows (`AgentRow`).
 * @param on the `on` that `register` receives
 */
export function registerAgentRows(on: On): void {
  on('ui.render', { component: 'AgentRow' }, (_$, e, next) => {
    if (e.surface !== 'terminal' || !isQuiet()) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, isHidden: true } })
  })
}
