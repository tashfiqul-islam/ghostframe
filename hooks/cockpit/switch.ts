// Cockpit's on switch, read by every part of it.
import type { EngineInterface } from 'claude-code'
import { isDormant } from '../shared/engine'

// Cockpit is on unless turned off: the `cockpit` option (/config, `pluginConfigs`; the manifest's default is on),
// overridden for one session by GHOSTFRAME_COCKPIT=0 or =1. Off, it opens nothing and draws nothing.
/** The `cockpit` option, as `register` received it. */
let isOptionOn = false
/** GHOSTFRAME_COCKPIT, as read at session start: on, off, or unset (the option decides). */
let envSwitch: boolean | undefined
export const OFF_NOTE = 'cockpit is off · enable with /config (Cockpit pane) or GHOSTFRAME_COCKPIT=1'

// Dormant (shared/engine: the engine is outside the tested range), Cockpit is off whatever the switch says.
export const isOn = (): boolean => !isDormant() && (envSwitch ?? isOptionOn)

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
 * @param value true or false when it turns Cockpit on or off, undefined when it leaves the option in charge
 */
export function setEnvSwitch(value: boolean | undefined): void {
  envSwitch = value
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
  setEnvSwitch(await envSwitchOf($))

  if (isOn() !== was) $.ui.invalidate('ui.render')
}

/**
 * What GHOSTFRAME_COCKPIT says. An environment the engine cannot read leaves the option in charge:
 * this must never be what holds back the rest of `session.start`.
 * @param $ the engine interface
 * @returns true for `1`, `true`, `on` or `yes`; false for `0`, `false`, `off` or `no`; otherwise undefined
 */
export async function envSwitchOf($: EngineInterface): Promise<boolean | undefined> {
  try {
    const value = (await $.env.get('GHOSTFRAME_COCKPIT')) ?? ''
    if (/^(1|true|on|yes)$/i.test(value)) return true
    if (/^(0|false|off|no)$/i.test(value)) return false
    return undefined
  } catch {
    return undefined
  }
}
