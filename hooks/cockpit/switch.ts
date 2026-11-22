// Cockpit's on switch, read by every part of it.
import type { EngineInterface } from 'claude-code'

// Cockpit is unfinished, so it is off unless asked for: the `cockpit` option (/config, `pluginConfigs`)
// or GHOSTFRAME_COCKPIT=1 for a test session. Off, it opens nothing and draws nothing.
/** The `cockpit` option, as `register` received it. */
let isOptionOn = false
/** GHOSTFRAME_COCKPIT, as read at session start. */
let isEnvOn = false
export const OFF_NOTE = 'cockpit is off · enable with /config (Cockpit pane) or GHOSTFRAME_COCKPIT=1'

export const isOn = (): boolean => isOptionOn || isEnvOn

/**
 * Where the plugin's own notices go (spec 13.3): the debug log while Cockpit is on, so the left holds only the
 * conversation; the transcript, as on main, while it is off.
 * @returns `$.ui.log`'s options
 */
export const noticeSink = (): { to?: 'debug' } => (isOn() ? { to: 'debug' } : {})

/**
 * Keeps the `cockpit` option, as `register` received it.
 * @param value whether it is `true`
 */
export function setOptionOn(value: boolean): void {
  isOptionOn = value
}

/**
 * Keeps GHOSTFRAME_COCKPIT, as read at session start.
 * @param value whether it turns Cockpit on
 */
export function setEnvOn(value: boolean): void {
  isEnvOn = value
  isEnvRead = true
}

/** Whether this copy of the module has read GHOSTFRAME_COCKPIT yet. */
let isEnvRead = false

/**
 * Reads GHOSTFRAME_COCKPIT once per copy of the module. `session.start` reads it, but `/tui` loads the hooks module
 * again with no `session.start` (probe 19), so the first draw after a reload reads it, and redraws when it turns
 * Cockpit on: the rows already drawn off then draw again.
 * @param $ the engine interface
 */
export async function readEnvOnce($: EngineInterface): Promise<void> {
  if (isEnvRead) return

  isEnvRead = true
  const was = isOn()
  setEnvOn(await isEnvSet($))

  if (isOn() !== was) $.ui.invalidate('ui.render')
}

/**
 * Whether GHOSTFRAME_COCKPIT turns Cockpit on. An environment the engine cannot read leaves it off:
 * this must never be what holds back the rest of `session.start`.
 * @param $ the engine interface
 * @returns true for `1`, `true`, `on` or `yes`
 */
export async function isEnvSet($: EngineInterface): Promise<boolean> {
  try {
    return /^(1|true|on|yes)$/i.test((await $.env.get('GHOSTFRAME_COCKPIT')) ?? '')
  } catch {
    return false
  }
}
