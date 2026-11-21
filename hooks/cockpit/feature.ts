// Cockpit: the pane beside the transcript. Phase 1, the seat: it opens at session start and docks at the
// width rule (seat.ts, pane.tsx). Phase 2, the step log: the turn's `[ STEPS ]` (steps/, log.ts). Phase 3, the
// head: `[ NOW ]` / `[ LAST ]` above it, and the left's live area reduced to one row (head.ts). Phase 4,
// the quiet left: docked, the transcript keeps the conversation, `↗` rows and the receipt (quiet.ts, left.tsx).
// Spec: docs/design/cockpit-v7.md C.1, E.1, E.5, E.24, E.32, E.33, E.36 to E.39, H; cockpit-v7-amendments.md.
import type { EngineInterface, PluginOptions, SessionStartInput } from 'claude-code'

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
 * Adds Cockpit's hooks: the `/cockpit` command and the pane's drawing.
 * @param on the `on` that `register` receives
 * @param options the plugin's options; `cockpit: true` turns Cockpit on
 */
export function registerCockpit(on: On, options: PluginOptions): void {
  setOptionOn(options['cockpit'] === true)

  registerPane(on)
}
