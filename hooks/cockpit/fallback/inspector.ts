// The inline inspector (spec E.46): where no dock exists, `/steps` opens the pane and the engine seats it inline,
// above the prompt, across the terminal. It shows one section, `[ STEPS · TURN n · PINNED ]` (or the live turn's
// `[ STEPS · TURN n ]`), fitted to the rows the engine gives. Pure: pane.tsx draws what `inspectorLines` returns.
import type { StepLog, TurnRecord } from '../../../types'
import { formatSpan } from '../../shared/time'
import { C } from '../../shared/tokens'
import type { Line } from '../line'
import { plain } from '../line'
import { sectionLabel, stepLines } from '../steps/rows'

/** The body rows `/steps` asks for (E.46); the engine grants what the layout spares. */
export const INSPECTOR_ROWS = 12

/**
 * The inspector's rows: the pinned turn's steps, else the live turn's (or, while it has none, the last turn's that
 * had any), under one label, fitted to `rows`.
 * @param log the turn's log
 * @param width the pane's body columns
 * @param rows the body rows to fit
 * @param pinned the turn pinned in place of the live one
 * @returns the rows
 */
export function inspectorLines(log: StepLog, width: number, rows: number, pinned?: TurnRecord): Line[] {
  const own = log.steps.length > 0 || log.dropped > 0
  const shown =
    pinned !== undefined
      ? { ...log, steps: pinned.steps, dropped: pinned.dropped, turnNo: pinned.turnNo }
      : own || log.prev === null
        ? log
        : { ...log, steps: log.prev.steps, dropped: log.prev.dropped, turnNo: log.prev.turnNo }
  const title = `STEPS · TURN ${shown.turnNo}${pinned === undefined ? '' : ' · PINNED'}`
  const style = pinned === undefined ? {} : { color: C.textBright, extra: formatSpan(pinned.durationMs) }
  const listed = stepLines(shown, width, rows, title, style)

  return listed.length > 0 ? listed : [plain(sectionLabel(title, [{ t: '0 steps', color: C.muted }], width, style.color))]
}
