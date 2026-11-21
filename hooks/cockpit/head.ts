// Cockpit's head (spec E.38, H.1 to H.3): `[ NOW ]` while a turn runs, `[ LAST ]` when it has ended; and the
// left's one-row live area. Pure: fit.ts puts the head in the pane, left.tsx draws the live row.
import type { LogStep, StepLog } from '../../types'
import type { Part } from '../shared/parts'
import { vw } from '../shared/text'
import { fmtClock, formatSpan } from '../shared/time'
import { C } from '../shared/tokens'
import { cut, sectionLabel } from './steps/rows'

const KIND_W = 9 // the kind word's 8 cells and a space
const LEAD = 2 + KIND_W
const CLOCK_W = 7
const CLOCK_GAP = 2

/** The spinner's frames (H.1), one every 100 ms: the only animated cell on screen. */
export const FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

const spaces = (n: number) => ' '.repeat(Math.max(0, n))
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Text padded to exactly `width` cells. */
function line(t: string, width: number, color: string): Part[] {
  const s = cut(t, width)

  return [{ t: s + spaces(width - vw(s)), color }]
}

/** `  kind     subject …   12s`: a kind word, a subject, a clock on the time edge; exactly `width` cells. */
function stepLine(kind: string, subject: string, clock: string, width: number, clockColor: string): Part[] {
  const room = width - LEAD - CLOCK_GAP - CLOCK_W
  const s = cut(subject, room)

  return [
    { t: `  ${kind.padEnd(KIND_W).slice(0, KIND_W)}`, color: C.muted },
    { t: s + spaces(room - vw(s)), color: C.textBright },
    { t: spaces(CLOCK_GAP) + spaces(CLOCK_W - vw(clock)) + clock, color: clockColor }
  ]
}

// A live clock: hidden for its first second (H.2), so a step that takes 0.3 s never flashes a `0.3s`.
const since = (now: number, at: number | null) => (at === null || now - at < 1_000 ? '' : formatSpan(now - at))

/**
 * What the turn waits on the person for, when the oldest running step asked. A permission check that a
 * classifier answers asks nobody: `permission` only while a dialog covers the prompt.
 */
function needsYou(log: StepLog, step: LogStep | undefined, isPromptCovered: boolean): string | undefined {
  if (step === undefined) return undefined
  if (log.asking.includes(step.id) && isPromptCovered) return 'permission'
  if (step.kind === 'ask') return 'question'
  if (step.kind === 'plan') return 'plan'

  return undefined
}

/** `[ NOW ]`: the label with the turn and the step, the sentence, and the step (or the moment) with its own clock. */
function nowRows(log: StepLog, now: number, width: number, isPromptCovered: boolean): Part[][] {
  const running = log.steps.filter(s => s.isRunning)
  const first = running[0]
  const total = log.steps.length + log.dropped
  const turn = `turn ${log.turnNo}`
  const meta = first !== undefined ? `${turn} · step ${log.dropped + log.steps.indexOf(first) + 1}` : total > 0 ? `${turn} · ${plural(total, 'step')}` : turn
  const asked = needsYou(log, first, isPromptCovered)
  const label = sectionLabel('NOW', [{ t: meta, color: C.muted }], width, asked === undefined ? C.muted : C.warn)
  const sentence = log.said.length > 0 ? log.said : total === 0 ? 'Waiting for the first token.' : 'Working.'
  const row1 = asked === undefined ? [{ t: '▸ ', color: C.textBright }, ...line(sentence, width - 2, C.text)] : line(`! needs you · ${asked}`, width, C.warn)

  if (first !== undefined && log.startedAt !== null) {
    const more = running.length > 1 ? ` +${running.length - 1}` : ''

    return [label, row1, stepLine(first.kind, first.subject + more, since(now, log.startedAt + first.clock), width, asked === undefined ? C.muted : C.warn)]
  }

  const moment: Record<string, [string, string]> = {
    thinking: ['thinking', ''],
    requesting: ['waiting', ''],
    responding: ['writing', 'the answer'],
    'tool-input': ['tool', 'preparing…'],
    'tool-use': ['tool', 'preparing…']
  }
  const [kind, subject] = moment[log.mode ?? 'requesting'] ?? ['waiting', '']

  return [label, row1, stepLine(kind, subject, since(now, log.modeSince), width, C.muted)]
}

const STATE_COLOR = { done: C.ok, failed: C.err, interrupted: C.warn } as const

/**
 * `[ LAST ]`: the label with the turn and when it ended; the state word, the story, the time; what waits. While
 * background agents still run, the turn is not done: `waiting · N agents`, in the agents' colour.
 */
function lastRows(log: StepLog, width: number, waiting: number): Part[][] {
  const last = log.last

  if (log.turnNo === 0 || last === null) {
    return [sectionLabel('LAST', [{ t: 'no turn yet', color: C.muted }], width), line('  nothing has run in this session', width, C.muted)]
  }

  const when = last.endedAt === null ? '' : ` · ${fmtClock(last.endedAt)}`
  const time = formatSpan(last.durationMs)
  const room = width - 2 - CLOCK_GAP - CLOCK_W
  const isWaiting = waiting > 0 && last.state === 'done'
  const state = isWaiting ? `waiting · ${plural(waiting, 'agent')}` : last.state
  const story = cut(`${state} · ${last.story}`, room).slice(state.length)

  return [
    sectionLabel('LAST', [{ t: `turn ${log.turnNo}${when}`, color: C.muted }], width),
    [
      { t: `  ${state}`, color: isWaiting ? C.agent : STATE_COLOR[last.state] },
      { t: story + spaces(room - vw(state) - vw(story)), color: C.text },
      { t: spaces(CLOCK_GAP) + spaces(CLOCK_W - vw(time)) + time, color: C.muted }
    ],
    ...(last.wait.length > 0 ? [line(`  ${last.wait}`, width, C.muted)] : [])
  ]
}

/**
 * The pane's head (E.38): `[ NOW ]` while a turn runs, else `[ LAST ]`, `waiting · N agents` while background
 * agents the main loop launched still run.
 * @param log the turn's log
 * @param now the wall clock in ms
 * @param width the pane's body columns
 * @param isPromptCovered a dialog covers the prompt (the `Pane` prop): a permission answer is awaited
 * @param waiting how many of the main loop's background agents still run
 * @returns one Part list per row
 */
export function headRows(log: StepLog, now: number, width: number, isPromptCovered: boolean, waiting: number): Part[][] {
  return log.isTurnRunning ? nowRows(log, now, width, isPromptCovered) : lastRows(log, width, waiting)
}

/**
 * The left's live area while docked (E.33, H.1): one row, the spinner frame, `working` (or `writing` while the
 * answer streams), and the engine turn's elapsed time on the time edge, the time its receipt will show.
 * @param log the turn's log
 * @param now the wall clock in ms
 * @param frame the spinner's frame count
 * @param width the transcript frame's width
 * @returns exactly `width` cells
 */
export function liveRow(log: StepLog, now: number, frame: number, width: number): Part[] {
  const word = log.mode === 'responding' ? 'writing' : 'working'
  const time = since(now, log.segmentStart)
  const glyph = FRAMES[frame % FRAMES.length] ?? FRAMES[0] ?? ''

  return [
    { t: glyph, color: C.accent },
    { t: ` ${word}`, color: C.text },
    { t: spaces(width - 1 - vw(` ${word}`) - vw(time)) + time, color: C.muted }
  ]
}
