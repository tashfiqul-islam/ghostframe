// Cockpit: the pane beside the transcript. Phase 1, the seat: it opens at session start and docks at the
// width rule (hooks/seat.ts). Phase 2, the step log: the turn's `[ STEPS ]` (hooks/steplog.ts). Phase 3, the
// head: `[ NOW ]` / `[ LAST ]` above it, and the left's live area reduced to one row (hooks/head.ts). Phase 4,
// the quiet left: docked, the transcript keeps the conversation, `↗` rows and the receipt (hooks/quiet.ts).
// Spec: docs/design/cockpit-v7.md C.1, E.1, E.5, E.24, E.32, E.33, E.36 to E.39, H; cockpit-v7-amendments.md.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, RenderInput, SessionStartInput, Timer, ToolCallInput, UiOpenResult } from 'claude-code'

import { liveRow, paneRows } from './head'
import { receiptRows, shipRows } from './quiet'
import { DOCK_MIN, paneColumns, terminalColumns } from './seat'
import { askStep, endTurn, newLog, newTurn, noteMode, noteSaid, receiptOf, settleStep, startStep } from './steplog'
import type { Outcome } from './steplog'
import type { Receipt } from '../types'
import type { Part } from './shared/parts'
import type { Ui } from './shared/rule'

type On = Parameters<Register>[0]
type SessionStart = Pick<SessionStartInput, 'isInteractive' | 'surface'>

const PANE = 'cockpit'

// The current (or last) main-loop turn's log. Change the tag when its fields change.
const stepLog = atom({ plugin: 'ghostframe', key: 'stepLog' } as const, newLog(null, null), { shape: 'stepLog-2' })
// Counters the timers bump while a turn runs: each second (the pane's running clock) and each spinner frame.
const second = atom({ plugin: 'ghostframe', key: 'second' } as const, 0, { shape: 'second-1' })
const frame = atom({ plugin: 'ghostframe', key: 'frame' } as const, 0, { shape: 'frame-1' })
// Each finished turn's receipt, by turn id, so a receipt drawn again later (a resize, a scroll) shows its own turn.
const receipts = atom({ plugin: 'ghostframe', key: 'receipts' } as const, [] as Receipt[], { shape: 'receipts-2' })
const RECEIPTS_MAX = 500

const SECOND_MS = 1_000
const FRAME_MS = 100 // H.1 asks 80 ms; the engine redraws a site at most ten times a second

// shortcut: the timers live in the module; a reload stops them (the engine's rule) and a turn running across a
// reload then shows its last second until the next turn starts. Fine while Cockpit is a test-only feature.
let timers: Timer[] = []

/**
 * A second passed: the pane, which reads `second`, draws again.
 * @param $ the engine interface
 */
async function tickSecond($: EngineInterface): Promise<void> {
  await update($, second, n => n + 1)
}

/**
 * A spinner frame passed: the live row, which reads `frame`, draws again.
 * @param $ the engine interface
 */
async function tickFrame($: EngineInterface): Promise<void> {
  await update($, frame, n => n + 1)
}

/** Stops the turn's timers. */
function stopTimers(): void {
  for (const timer of timers) timer.cancel()

  timers = []
}

/**
 * A main-loop turn starts: its log starts empty, on its own clock, and the timers start.
 * @param $ the engine interface
 * @param turn the turn's id
 * @param at when its prompt was submitted (wall clock, ms); undefined (no prompt was typed), now
 */
export async function logTurnStart($: EngineInterface, turn: string, at: number | undefined): Promise<void> {
  if (!isOn()) return

  const startedAt = at ?? (await $.clock.now())
  await update($, stepLog, log => newTurn(log, turn, startedAt))
  lastMode = undefined
  stopTimers()
  timers = [$.clock.every(SECOND_MS, () => void tickSecond($)), $.clock.every(FRAME_MS, () => void tickFrame($))]
}

// The mode last written, so a stream of text chunks writes the log once, not once per chunk.
let lastMode: string | undefined
const CHUNK_MODE: Record<string, string> = { thinking: 'thinking', text: 'responding', input: 'tool-input', tool: 'tool-input' }

/**
 * What the main loop is doing changed (E.38 row 2 when no step runs): a model call started (`requesting`), or its
 * stream moved to thinking, text or a tool call. Written only on a change; a render may not write.
 * @param $ the engine interface
 * @param what `request`, or the stream chunk's kind
 */
export async function logMode($: EngineInterface, what: string): Promise<void> {
  const mode = what === 'request' ? 'requesting' : CHUNK_MODE[what]

  if (!isOn() || mode === undefined || mode === lastMode) return

  lastMode = mode
  const at = await $.clock.now()
  await update($, stepLog, log => (log.isTurnRunning ? noteMode(log, mode, at) : log))
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
  lastMode = 'requesting'
}

/**
 * A main-loop call waits on the person's permission answer: `[ NOW ]` says `needs you`.
 * @param $ the engine interface
 * @param id the call's id
 */
export async function logAsk($: EngineInterface, id: string): Promise<void> {
  if (!isOn()) return

  await update($, stepLog, log => askStep(log, id))
}

/**
 * Claude said something in the main loop: the last text block's first sentence is `[ NOW ]`'s row 1.
 * @param $ the engine interface
 * @param content the response's content blocks
 */
export async function logSaid($: EngineInterface, content: readonly { type: string; [k: string]: unknown }[]): Promise<void> {
  if (!isOn()) return

  const text = content.findLast(b => b.type === 'text' && typeof b['text'] === 'string' && b['text'].trim().length > 0)?.['text']

  if (typeof text === 'string') await update($, stepLog, log => noteSaid(log, text))
}

/**
 * A main-loop turn ends: a step still running was cut, the head turns to `[ LAST ]`, the timers stop, and the turn's
 * receipt is kept. One clock: the turn's time is Cockpit's own, now less its start, for the head, the receipt and
 * the live row alike; the engine's `durationMs` stands only when the start is unknown.
 * @param $ the engine interface
 * @param durationMs how long the engine says the turn ran
 * @param isAborted whether it was interrupted (correction G: no receipt; `[ LAST ]` carries the state)
 */
export async function logTurnEnd($: EngineInterface, durationMs: number, isAborted: boolean): Promise<void> {
  if (!isOn()) return

  stopTimers()
  const now = await $.clock.now()
  await update($, stepLog, log => endTurn(log, durationMs, isAborted, now))
  const receipt = receiptOf(await read($, stepLog))
  await update($, receipts, list => [...list.filter(r => r.turn !== receipt.turn), receipt].slice(-RECEIPTS_MAX))
}

/** Whether the left is quiet now: Cockpit on and its pane docked (phase 4). Off, the transcript is as it was. */
export const isQuiet = () => isOn() && isDocked

/**
 * Whether a main-loop turn runs now, and which; read while drawing, so the drawing follows the turn's end.
 * @param $ the engine interface
 * @returns the running turn's id, or undefined
 */
export async function runningTurn($: EngineInterface): Promise<string | undefined> {
  const log = await read($, stepLog)

  return log.isTurnRunning ? (log.turn ?? undefined) : undefined
}

/**
 * Sets whether the pane is docked. A change redraws the transcript, so it turns quiet, or back, at once.
 * @param $ the engine interface
 * @param docked whether it is
 */
function setDocked($: EngineInterface, docked: boolean): void {
  if (docked === isDocked) return

  isDocked = docked
  $.ui.invalidate('ui.render')
}

/**
 * Cockpit's part of a folded `ToolGroup` while quiet: nothing, except a `↗` row for a push or a pull request.
 * @param $ the engine interface
 * @param e the render
 * @param width the transcript rule's width
 * @returns the rows' tree (an empty Box draws nothing)
 */
export async function drawQuietGroup($: EngineInterface, e: RenderInput<'ToolGroup', 'terminal'>, width: number) {
  const ui = $.ui.resolve(e)
  const log = await read($, stepLog)
  const steps = [...log.steps, ...(log.prev?.steps ?? [])]
  const clockOf = (id: string) => steps.find(s => s.id === id || s.calls?.includes(id) === true)?.clock
  const rows = shipRows(e.props.calls, clockOf, width)

  return <ui.Box flexDirection="column">{drawRows(ui, rows)}</ui.Box>
}

/**
 * Cockpit's part of `TurnDuration` while quiet: the receipt of the turn the footer stands for, with its
 * `still failing` rows, and one blank row above. Nothing for an interrupted turn (correction G).
 * @param $ the engine interface
 * @param e the render
 * @param turn the id of the turn the footer stands for, when known; unknown, the current turn's
 * @param width the transcript rule's width
 * @returns the tree; an empty one while the current turn's receipt is on its way (the engine may raise the
 *   footer before `turn.complete` keeps it, and the old footer must not flash); undefined for an earlier turn
 *   that has no receipt, which keeps the old footer
 */
export async function drawReceipt($: EngineInterface, e: RenderInput<'TurnDuration', 'terminal'>, turn: string | undefined, width: number) {
  const ui = $.ui.resolve(e)
  const current = (await read($, stepLog)).turn
  const wanted = turn ?? current
  const receipt = (await read($, receipts)).findLast(r => r.turn === wanted)

  if (receipt === undefined) return wanted === current ? <ui.Box /> : undefined

  const rows = receiptRows(receipt, width)

  return rows.length === 0 ? (
    <ui.Box />
  ) : (
    <ui.Box flexDirection="column" marginTop={1}>
      {drawRows(ui, rows)}
    </ui.Box>
  )
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
/** The pane is docked now: the left's live area is then one row (E.33); otherwise it is the engine's. */
let isDocked = false

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
 * Rows as Text lines, one per row.
 * @param ui the surface's elements
 * @param rows the rows
 * @returns the lines
 */
function drawRows(ui: Pick<Ui, 'Text'>, rows: readonly (readonly Part[])[]) {
  const { Text } = ui

  return rows.map((row, i) => (
    <Text key={`row:${i}`} wrap="truncate">
      {row.map((p, j) => (
        <Text key={`${j}`} color={p.color} {...(p.bold === true ? { weight: 'bold' as const } : {})}>
          {p.t}
        </Text>
      ))}
    </Text>
  ))
}

/**
 * Cockpit's part of the `Spinner` site (a plugin hooks it once): while the pane is docked, the left's live area
 * is one row, `working` and the turn's time (E.33). Undefined leaves the site to the caller.
 * @param $ the engine interface
 * @param e the render
 * @returns the row's tree, or undefined
 */
export async function drawLive($: EngineInterface, e: RenderInput<'Spinner', 'terminal'>) {
  if (!isOn() || !isDocked || e.viewport === undefined) return undefined

  const now = await $.clock.now()
  const ui = $.ui.resolve(e)
  const { Box } = ui
  // The transcript's frame: its last column stays empty, and it never passes 120 (C.1).
  const width = Math.min(e.viewport.columns - 1, 120)

  return <Box>{drawRows(ui, [liveRow(await read($, stepLog), now, await read($, frame), width)])}</Box>
}

/**
 * Adds Cockpit's hooks: the `/cockpit` command and the pane's drawing.
 * @param on the `on` that `register` receives
 * @param options the plugin's options; `cockpit: true` turns Cockpit on
 */
export function registerCockpit(on: On, options: PluginOptions): void {
  isOptionOn = options['cockpit'] === true

  // The person closed the pane: the transcript is no longer quiet.
  on('ui.close', { id: PANE }, ($, e, next) => {
    setDocked($, false)

    return next(e)
  })

  on('command.run', { command: PANE }, async ($, e) => {
    if (!isOn()) {
      return { text: OFF_NOTE }
    }

    const isPlaced = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced)

    if (isPlaced) {
      await $.ui.close({ id: PANE })

      setDocked($, false)

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

    const ui = $.ui.resolve(e)
    const { Box } = ui
    const { placement, bodyColumns, scroll } = e.props
    const viewport = e.viewport

    if (e.surface === 'terminal' && viewport !== undefined) {
      const columns = terminalColumns(placement, viewport.columns, bodyColumns)
      setDocked($, placement !== 'inline')

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

    // The head, one blank row, then `[ STEPS ]`, fitted to the body so the engine never scrolls it (E.37).
    // Reading `second` redraws this each second while a turn runs; only the running step's clock changes.
    await read($, second)
    const log = await read($, stepLog)
    const rows = paneRows(log, log.isTurnRunning ? await $.clock.now() : 0, bodyColumns, scroll.bodyRows, e.props.isPromptCovered === true)

    return <Box flexDirection="column">{drawRows(ui, rows)}</Box>
  })
}
