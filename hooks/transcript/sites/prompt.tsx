// The user prompt's row: the turn rule with its submit time, then `you` and the message behind a rail. While Cockpit
// is on, the rule is E.1's `─ [ TURN n ] ─── 09:23` (amendment 12), also above the engine's own row in ctrl+o.
import type { EngineInterface, On, RenderPropsOf } from 'claude-code'
import { noteOwnTime } from '../../shared/budget'

import { isOn, noticeSink, readEnvOnce } from '../../cockpit/switch'
import type { LaunchedAgent, PromptStamp } from '../../../types'
import { drawAgentNotice, drawTaskNotice, isFallbackRow, isQuietRow, keptAgents, leftCells } from '../../cockpit/left'
import { readLog } from '../../cockpit/log'
import { G, layout, ruleWidth } from '../../shared/layout'
import { dayWord } from '../../shared/look/format'
import { spineOnly, textCells } from '../../shared/look/spine'
import type { Part } from '../../shared/parts'
import { Rule } from '../../shared/rule'
import { fmtClock } from '../../shared/time'
import { C } from '../../shared/tokens'
import { claim } from '../claim'
import { cell } from '../draw/cell'
import { drawRows } from '../draw/parts'
import { isCompacting, sessionCwd } from '../ledger/session'
import { isSameText, readPrompts, readTaskNotice, storedPrompts } from '../ledger/state'
import { remember } from '../../shared/held'
import { isPendingStart, lastSubmittedAt } from '../ledger/turns'
import { wrapPlain } from '../prose'
import { messageCard, pasteShown, turnHeader } from '../rows/turn'
import type { Header } from '../rows/turn'
import { dormantFor } from '../../shared/engine'

// Which submit stamp each turn rule shows, by the row's request: the same prompt typed
// twice has two stamps. A row keeps the stamp it claimed. A first draw takes the submit
// that just landed when it is free (the row the engine draws for it), else the oldest
// stamp no other row holds (rows redrawn in transcript order after a reload), so an
// earlier rule never takes a later submit's time. Written while drawing.
// shortcut: an older row with the same text that first draws after a reload, between a
// submit and its own row, takes that submit; the new row then shows the older time.
// The engine draws a submitted prompt first in a stand-in row (request `placeholder`, live in 2.1.330), then in
// its own row: the stand-in shows the stamp but never claims it, or the real row would find it taken.
const PLACEHOLDER = 'placeholder'
const promptClaims = new Map<string, number>()
const claimPrompt = (row: string, text: string, list: readonly PromptStamp[]) =>
  claim(
    row === PLACEHOLDER ? new Map(promptClaims) : promptClaims,
    row,
    list.filter(p => isSameText(p.text, text)),
    p => p.at,
    lastSubmittedAt()
  )

/**
 * How a typed prompt opens its row while Cockpit is on (7.1, 7.2, amendment 12): a turn of its own (its header's
 * facts), a message added to the running turn (`↳`, its clock), or one queued for the next (`⋯`, its clock).
 */
type Opening = { kind: 'typed'; header: Header } | { kind: 'added' | 'queued'; at: number | undefined }

// Whether each turn's header first drew while its turn ran, by its number and submit time (a new session numbers
// from 1 again, never at the same time): a header drawn again keeps the `◆` colour it first drew with, so the row never
// changes (7.1). A reload starts empty, and a finished turn then draws `spine`. One entry per typed turn.
const firstDrawnLive = new Map<string, boolean>()

/** A header's live colour: the one it first drew with, for a numbered turn; the turn's state now otherwise. */
function liveAtFirstDraw(turnNo: number | undefined, at: number | undefined, isLiveNow: boolean): boolean {
  if (turnNo === undefined || at === undefined) return isLiveNow

  const key = `${turnNo}@${at}`
  const kept = firstDrawnLive.get(key) ?? isLiveNow
  firstDrawnLive.set(key, kept)

  return kept
}

/**
 * What opens the prompt's row while Cockpit is on (7.1, 7.2, amendment 12): the prompt's stamp, found by the row the
 * engine draws it under (the same live and after a resume), else claimed as before. A prompt typed over a running
 * turn and delivered into it is added to it; one still waiting is queued. Any other opens a turn: its number the one
 * its turn took, else, while that turn is about to start or has just started, the step log's; its submit time, with
 * the day when the previous prompt's was another. This finds the facts only; the drawing is `transcript/rows/turn.ts`'s.
 * @param $ the engine interface
 * @param row the row's request
 * @param text the prompt's text
 * @returns how it opens
 */
async function promptOpening($: EngineInterface, row: string, text: string): Promise<Opening> {
  const live = await readPrompts($)
  // A resumed transcript is drawn before the session starts (amendment 8): its stamps are still only in the store.
  const list = live.length > 0 || sessionCwd() !== undefined ? live : await storedPrompts($)
  // A prompt typed over a running turn is never claimed: the engine draws it under rows of its own while it waits.
  const waiting = list.findLast(p => p.over !== undefined && p.row === undefined && isSameText(p.text, text))
  const typed = list.filter(p => p.over === undefined || p.row !== undefined)
  // The stand-in may show a stamp another row holds (it claims nothing); a real row claims only a stamp with no row.
  const stamp = list.find(p => p.row === row) ?? waiting ?? claimPrompt(row, text, row === PLACEHOLDER ? typed : typed.filter(p => p.row === undefined))

  if (stamp?.over !== undefined && stamp.turnNo === undefined && !isPendingStart(stamp)) {
    return { kind: stamp.steerMs === undefined ? 'queued' : 'added', at: stamp.at }
  }

  // A prompt typed while a compaction runs waits in the engine's queue, drawn before its submit: no stamp, no clock.
  // shortcut: a stampless older row first drawn during a compaction (scrolled into view) draws queued until it ends.
  if (stamp === undefined && isCompacting()) return { kind: 'queued', at: undefined }

  // A numbered turn whose header has drawn needs nothing of the step log (its number is the stamp's, its colour the
  // one it first drew with): it is not read, so a row the person scrolls past costs no read of every step, and the
  // row no longer draws again at each step of the running turn.
  const isSettled = stamp?.turnNo !== undefined && firstDrawnLive.has(`${stamp.turnNo}@${stamp.at}`)
  const log = isSettled ? undefined : await readLog($)
  const turnNo =
    stamp === undefined || log === undefined
      ? stamp?.turnNo
      : (stamp.turnNo ?? (log.startedAt === stamp.at ? log.turnNo : isPendingStart(stamp) ? log.turnNo + 1 : undefined))
  const prev = stamp === undefined ? undefined : list.slice(0, Math.max(0, list.indexOf(stamp))).findLast(p => p.over === undefined || p.turnNo !== undefined)
  // The engine draws a typed prompt's row when it is submitted, before its turn starts: a turn about to start is live.
  const isLiveNow = log !== undefined && ((log.isTurnRunning && turnNo === log.turnNo) || (stamp !== undefined && isPendingStart(stamp)))
  const isLive = liveAtFirstDraw(turnNo, stamp?.at, isLiveNow)

  return { kind: 'typed', header: { at: stamp?.at, turnNo, after: stamp?.after, day: stamp === undefined ? '' : dayWord(stamp.at, prev?.at), isLive } }
}

/**
 * A prompt row's rows while Cockpit is on (7.1, 7.2): the turn header, your message as a card, the spine's blank row;
 * an added or queued message as its card alone.
 * @param o how it opens
 * @param text the message
 * @param width the text column's cells
 * @returns the rows
 */
function openingRows(o: Opening, text: string, width: number): Part[][] {
  return o.kind === 'typed'
    ? [turnHeader(o.header, width), ...messageCard(text, 'typed', width), spineOnly()]
    : [...messageCard(text, o.kind, width, o.at), spineOnly()]
}

// The row each task's notices share, by task id: the first drawn (rows draw again in transcript order after a
// reload, so the first claims it again). Written while drawing.
const noticeRows = new Map<string, string>()
const NOTICE_ROWS_MAX = 200

/**
 * Whether a task notice's row is the one its task's notices share: the first drawn for its id.
 * @param taskId the task's id
 * @param row the row's request
 * @returns whether it is
 */
function isFirstNoticeRow(taskId: string, row: string): boolean {
  const first = noticeRows.get(taskId) ?? row

  remember(noticeRows, taskId, first, NOTICE_ROWS_MAX)

  return first === row
}

function durationLabel(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))

  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/**
 * Whether a row is one of this session's agents speaking: the notice that it finished (`task-notification`, its
 * task an agent) or its message to the main loop (`peer`, from an agent's name or type). Cockpit's roster and every
 * kept turn's say which agents this session launched (the engine's list may have dropped one that finished, and
 * after a resume holds none), else the engine's own list; a list it cannot give keeps the row.
 * @param $ the engine interface
 * @param p the row's props
 * @returns whether the row is an agent's
 */
async function isAgentRow($: EngineInterface, p: RenderPropsOf['UserMessage']): Promise<boolean> {
  const id = p.origin.kind === 'task-notification' ? p.task?.id : undefined
  const from = p.origin.kind === 'peer' ? p.from?.name : undefined

  if (id === undefined && from === undefined) return false

  const task = p.origin.kind === 'task-notification' ? p.task : undefined

  const isIt = (a: LaunchedAgent) =>
    a.id === id ||
    (task?.toolUseId !== undefined && a.call === task.toolUseId) ||
    (from !== undefined && (a.name === from || a.called?.includes(from) === true))

  if ((await keptAgents($)).some(isIt)) return true

  try {
    const agents = await $.agent.list()

    return agents.some(a => a.id === id || (from !== undefined && (a.name === from || a.type === from || a.description === from)))
  } catch (error: unknown) {
    const notice = `agent list unavailable: ${String(error)}`

    $.ui.log(notice, noticeSink())

    return false
  }
}

/**
 * Adds the user prompt's drawing (`UserMessage`).
 * @param on the `on` that `register` receives
 */
export function registerPrompt(on: On): void {
  // User prompt: peach rail over the full height, text verbatim. Task notifications get the tree look.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    try {
      // Dormant (shared/engine): the engine draws its own row.
      if (await dormantFor($)) return next(e)
      // Cockpit's on switch, read before the first draw decides (a copy of the module loaded by `/tui` or a resume draws before `session.start`).
      await readEnvOnce($)

      if (e.surface !== 'terminal' || e.props.text.length === 0) {
        return next(e)
      }

      // Cockpit's left, folded and in ctrl+o alike (screen 30): the turn header and your message as a card (7.1, 7.2).
      if (e.props.origin.kind === 'composer' && isQuietRow(e)) {
        const ui = $.ui.resolve(e)
        const o = await promptOpening($, e.requestId, e.props.text)
        const rows = openingRows(o, pasteShown(e.props.text, e.props.isExpanded), textCells(e.viewport?.columns, !isFallbackRow(e)))

        return (
          <ui.Box flexDirection="column" marginTop={o.kind === 'typed' ? 1 : 0}>
            {drawRows(ui, rows, 'prompt')}
          </ui.Box>
        )
      }

      if (e.props.isExpanded) return next(e)

      const { Box, Text } = $.ui.resolve(e)

      // Quiet: an agent's notice or message is the pane's (`[ AGENTS ]`); the row draws nothing, except in fallback
      // for an agent that failed (its `✕` row).
      if (isQuietRow(e) && (await isAgentRow($, e.props))) {
        return drawAgentNotice($, e, leftCells(e))
      }

      // A task that notifies again under its id (an agent that waits again) keeps one row: the first draws the newest
      // notice, kept as it was submitted, and the later ones draw nothing (7.10).
      const taskId = e.props.origin.kind === 'task-notification' ? e.props.task?.id : undefined

      if (taskId !== undefined && !isFirstNoticeRow(taskId, e.requestId)) return <Box />

      const newest = taskId === undefined ? undefined : await readTaskNotice($, taskId)
      const said = newest !== undefined && newest.text.length > 0 ? newest.text : (e.props.text.split('\n')[0] ?? '')
      const took = newest?.durationMs ?? e.props.task?.durationMs

      // Cockpit on: on the left's grid like every other row (6.1, 7.10).
      if (e.props.origin.kind === 'task-notification' && isOn()) {
        return drawTaskNotice($, e, said, took)
      }

      if (e.props.origin.kind === 'task-notification') {
        const launched = /launched|started/i.test(said)
        const ms = took

        return (
          <Box flexWrap="nowrap">
            <Box flexShrink={0}>
              <Text color={launched ? C.accent : C.muted}>{'◇ '}</Text>
            </Box>
            <Box flexShrink={1} minWidth={0}>
              <Text color={C.text} wrap="truncate-end">
                {said}
              </Text>
            </Box>
            {ms !== undefined && (
              <Box flexShrink={0}>
                <Text color={C.muted}>{` · ${durationLabel(ms)}`}</Text>
              </Box>
            )}
          </Box>
        )
      }

      const lay = layout(e.viewport?.columns)

      if (e.props.origin.kind !== 'composer' || lay === undefined) {
        return next(e)
      }

      const width = lay.width

      // Turn open rule with the submit time (dropped when we never saw the submit; the classic rule's, claimed by text),
      // then `you` in the gutter and the message behind a ▎ rail on every row.
      const ui = $.ui.resolve(e)
      // Cockpit off: the classic rule with the submit time, as on main.
      const claimed = claimPrompt(e.requestId, e.props.text, await readPrompts($))
      const rule = Rule(ui, claimed ? { text: fmtClock(claimed.at), color: C.muted } : undefined, undefined, ruleWidth(lay))
      const rows = wrapPlain(pasteShown(e.props.text, false), width - 2)

      return (
        <Box flexDirection="column">
          {/* §0.2: one blank row between the last turn's footer rule and this one. */}
          <Box marginTop={1}>{rule}</Box>
          {cell(
            ui,
            lay,
            { text: 'you', color: C.text },
            // One Text for the whole message: rows pre-wrapped to the measure, joined by \n.
            <Text wrap="wrap">
              {rows.flatMap((row, i) => [
                ...(i > 0 ? ['\n'] : []),
                <Text key={`${i}.rail`} color={C.accent}>
                  {G.rail}
                </Text>,
                <Text key={`${i}.text`} color={C.textBright}>{` ${row}`}</Text>
              ])}
            </Text>,
            1
          )}
        </Box>
      )
    } finally {
      noteOwnTime($, 'ui.render UserMessage', next.budget)
    }
  })
}
