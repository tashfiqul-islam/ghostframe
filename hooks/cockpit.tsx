// Cockpit: the pane beside the transcript. Phase 1, the seat: it opens at session start and docks at the
// width rule (hooks/seat.ts). Phase 2, the step log: it draws the turn's `[ STEPS ]` (hooks/steplog.ts).
// Spec: docs/design/cockpit-v7.md C.1, E.24, E.36 to E.39; docs/design/cockpit-v7-amendments.md.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, SessionStartInput, ToolCallInput, UiOpenResult } from 'claude-code'

import { DOCK_MIN, paneColumns, terminalColumns } from './seat'
import { endTurn, newLog, settleStep, startStep, stepRows } from './steplog'
import type { Outcome } from './steplog'

type On = Parameters<Register>[0]
type SessionStart = Pick<SessionStartInput, 'isInteractive' | 'surface'>

const PANE = 'cockpit'

// The current (or last) main-loop turn's steps. Change the tag when a step's fields change.
const stepLog = atom({ plugin: 'ghostframe', key: 'stepLog' } as const, newLog(null, 0), { shape: 'stepLog-1' })

/**
 * A main-loop turn starts: its log starts empty, on its own clock.
 * @param $ the engine interface
 * @param turn the turn's id
 * @param at when its prompt was submitted (wall clock, ms); undefined, its first step starts the clock
 */
export async function logTurnStart($: EngineInterface, turn: string, at: number | undefined): Promise<void> {
  if (!isOn()) return

  await update($, stepLog, () => newLog(turn, at ?? null))
}

/**
 * A main-loop call starts: its row appears.
 * @param $ the engine interface
 * @param e the call
 * @param at the wall clock in ms
 * @param cwd the session's folder, for relative paths
 */
export async function logStepStart($: EngineInterface, e: ToolCallInput, at: number, cwd: string | undefined): Promise<void> {
  if (!isOn()) return

  await update($, stepLog, log => startStep(log, { id: e.tool_use_id, tool: e.tool, input: e, at }, cwd))
}

/**
 * A main-loop call ends: its row settles.
 * @param $ the engine interface
 * @param e the call
 * @param outcome what `next(e)` resolved to; undefined when it threw
 * @param at the wall clock in ms
 */
export async function logStepEnd($: EngineInterface, e: ToolCallInput, outcome: Outcome | undefined, at: number): Promise<void> {
  if (!isOn()) return

  await update($, stepLog, log => settleStep(log, { id: e.tool_use_id, tool: e.tool, input: e, at, outcome: outcome ?? { isError: true, text: 'failed' } }))
}

/**
 * A main-loop turn ends: a step still running was cut.
 * @param $ the engine interface
 * @param durationMs how long the turn ran
 */
export async function logTurnEnd($: EngineInterface, durationMs: number): Promise<void> {
  if (!isOn()) return

  await update($, stepLog, log => endTurn(log, durationMs))
}

// The first open comes before any drawing has measured the terminal: ask for the hero width,
// and the first Pane render opens again at the width rule.
const FIRST_COLUMNS = 72

// shortcut: kept in the module, so a reload forgets them; the next Pane render then opens once more
// at the width rule, and an inline pane the person asked for before the reload is closed. Move them
// to $.state when the pane holds anything worth keeping across a reload.
/** The terminal's columns at Cockpit's last open, so it opens again only when the width changes (correction K). */
let openedAt: number | undefined
/** The terminal's columns where Cockpit last closed an inline pane, so a refused close cannot loop. */
let leftAt: number | undefined
/** The person's `/cockpit` ran where no dock exists, so an inline pane is theirs and stays. */
let isAskedInline = false

// Cockpit is unfinished, so it is off unless asked for: the `cockpit` option (/config, `pluginConfigs`)
// or GHOSTFRAME_COCKPIT=1 for a test session. Off, it opens nothing and draws nothing.
/** The `cockpit` option, as `register` received it. */
let isOptionOn = false
/** GHOSTFRAME_COCKPIT, as read at session start. */
let isEnvOn = false
const OFF_NOTE = 'cockpit is off · enable with /config (Cockpit pane) or GHOSTFRAME_COCKPIT=1'

const isOn = () => isOptionOn || isEnvOn

/**
 * Whether GHOSTFRAME_COCKPIT turns Cockpit on. An environment the engine cannot read leaves it off:
 * this must never be what holds back the rest of `session.start`.
 * @param $ the engine interface
 * @returns true for `1`, `true`, `on` or `yes`
 */
async function isEnvSet($: EngineInterface): Promise<boolean> {
  try {
    return /^(1|true|on|yes)$/i.test((await $.env.get('GHOSTFRAME_COCKPIT')) ?? '')
  } catch {
    return false
  }
}

/**
 * Opens (or re-opens) the pane at the width rule for a terminal this wide.
 * @param $ the engine interface
 * @param columns the terminal's columns
 * @returns whether the engine placed it
 */
async function openAt($: EngineInterface, columns: number): Promise<UiOpenResult> {
  openedAt = columns

  return $.ui.open({ id: PANE, columns: paneColumns(columns) })
}

/**
 * Closes an inline pane nobody asked for. In fullscreen it then opens again on its own, which waits
 * undrawn until the terminal is wide enough for the dock again.
 * @param $ the engine interface
 * @param columns the terminal's columns
 * @param isFullscreen whether this session docks panes at all
 */
async function leaveInline($: EngineInterface, columns: number, isFullscreen: boolean): Promise<void> {
  leftAt = columns
  await $.ui.close({ id: PANE })

  if (isFullscreen) {
    await openAt($, columns)
  }
}

/**
 * Logs a seat change that failed; the pane keeps the seat it had.
 * @param $ the engine interface
 * @param error what the engine answered
 */
function logSeatError($: EngineInterface, error: unknown): void {
  $.ui.log(`cockpit: seat change failed: ${String(error)}`)
}

/**
 * Cockpit's part of `session.start` (a plugin hooks it once): registers `/cockpit` and opens the pane.
 * Unasked, the engine docks it from 144 columns (110 once asked) and holds it undrawn below that.
 * @param $ the engine interface
 * @param e the session start's input
 */
export async function startCockpit($: EngineInterface, e: SessionStart): Promise<void> {
  await $.command.register({ name: PANE, description: 'Open or close the Cockpit pane' })
  isEnvOn = await isEnvSet($)

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
  isOptionOn = options['cockpit'] === true

  on('command.run', { command: PANE }, async ($, e) => {
    if (!isOn()) {
      return { text: OFF_NOTE }
    }

    const isPlaced = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced)

    if (isPlaced) {
      await $.ui.close({ id: PANE })

      return { text: 'pane closed' }
    }

    const { columns, isFullscreen } = e.presentation
    isAskedInline = !isFullscreen || columns < DOCK_MIN
    leftAt = undefined
    const opened = await openAt($, columns)

    return { text: opened.isPlaced ? `pane open · ${paneColumns(columns)} columns` : `pane not placed · ${opened.reason}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (!isOn()) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const { placement, bodyColumns, scroll } = e.props
    const viewport = e.viewport

    if (e.surface === 'terminal' && viewport !== undefined) {
      const columns = terminalColumns(placement, viewport.columns, bodyColumns)

      if (placement === 'inline') {
        if (!isAskedInline && leftAt !== columns) {
          void leaveInline($, columns, viewport.isFullscreen === true).catch((error: unknown) => logSeatError($, error))
        }

        if (!isAskedInline) {
          return <Box />
        }
      } else if (columns !== openedAt) {
        void openAt($, columns).catch((error: unknown) => logSeatError($, error))
      }
    }

    // `[ STEPS ]` alone, fitted to the body so the engine never scrolls it (E.37).
    const rows = stepRows(await read($, stepLog), bodyColumns, scroll.bodyRows)

    return (
      <Box flexDirection="column">
        {rows.map((row, i) => (
          <Text key={`row:${i}`} wrap="truncate">
            {row.map((p, j) => (
              <Text key={`${j}`} color={p.color} {...(p.bold === true ? { weight: 'bold' as const } : {})}>
                {p.t}
              </Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  })
}
