// The unfolded view's flag (spec E.4, F.8; spec 7.17): ctrl+o is the full record, drawn by hooks/cockpit/rows/left.ts
// and the left's sites. Pure, except the flag: no site says "this is the ctrl+o view", so the sites that do say it (`ToolUse`, `ToolGroup`,
// `TurnDuration`, probe 6) set it, and a change redraws the text blocks, which carry no such prop.
import type { EngineInterface } from 'claude-code'

import type { Part } from '../shared/parts'

let isUnfolded = false

/** Whether the transcript is the ctrl+o view now. */
export const unfolded = (): boolean => isUnfolded

/**
 * Notes what a site says of the view (`isExpanded`); a change redraws every site, so the text blocks follow.
 * @param $ the engine interface
 * @param value the site's `isExpanded`, undefined where it says nothing
 */
export function noteUnfolded($: EngineInterface, value: boolean | undefined): void {
  if (value === undefined || value === isUnfolded) return

  isUnfolded = value
  $.ui.invalidate('ui.render')
}

/** The text of a row of parts, as a selection or a copy reads it. */
export const rowText = (row: readonly Part[]): string =>
  row
    .map(p => p.t)
    .join('')
    .trimEnd()
