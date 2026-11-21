// The ledger's observe hooks, each event hooked once: what the main loop did, for the transcript's drawing.
import type { On } from 'claude-code'

import { registerCalls } from './calls'
import { registerCapabilities } from './capabilities'
import { registerSession } from './session'
import { registerTurns } from './turns'

/**
 * Adds the ledger's observe hooks.
 * @param on the `on` that `register` receives
 */
export function registerLedger(on: On): void {
  registerSession(on)
  registerCalls(on)
  registerTurns(on)
  registerCapabilities(on)
}
