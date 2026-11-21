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
