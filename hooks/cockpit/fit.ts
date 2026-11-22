// The pane, fitted (spec E.37, amendment 2): the head, then `[ STEPS ]`, `[ AGENTS ]`, `[ TODO ]`, `[ FILES ]` and
// `[ SOURCES ]`, one blank row between every section. The lower sections are measured first and `[ STEPS ]` takes
// what is left, so nothing above moves while a turn runs; short of room, the lower sections fold, down E.37's
// ladder. Pure: pane.tsx draws what `paneRows` returns.
import type { RosterAgent, StepLog, TurnWork } from '../../types'
import type { Part } from '../shared/parts'
import { C } from '../shared/tokens'
import { waitingOn } from './agents/roster'
import { AGENTS_CAP, agentRows } from './agents/rows'
import type { AgentsLevel } from './agents/rows'
import { headRows } from './head'
import { fileLines } from './sections/files'
import { sourceRows } from './sections/sources'
import { todoRows } from './sections/todo'
import type { TodoLevel } from './sections/todo'
import { stepLines } from './steps/rows'
import { partsOf, plain } from './line'
import type { Line } from './line'

const STEP_ROWS_MIN = 3 // fewer step rows than this, with their label, shows no steps
const STEP_ROWS_WANT = 6 // what the lower sections give way for (3 in a pane under 24 rows; E.37 step 4)
const TALL = 40 // a tall pane: larger caps for the lower sections (E.37 step 2)

/** How far each lower section has folded. */
type Levels = {
  agents: AgentsLevel | 'none'
  todo: TodoLevel | 'none'
  files: 'full' | 'label' | 'none'
  sources: 'full' | 'label' | 'none'
}

/** One rung of the ladder: a section and the level it folds to. */
type Rung = { [K in keyof Levels]: readonly [K, Levels[K]] }[keyof Levels]

// E.37 step 4, with amendment 2 (the blank rows never go).
const LADDER: readonly Rung[] = [
  ['sources', 'label'],
  ['files', 'label'],
  ['todo', 'one'],
  ['agents', 'running'],
  ['agents', 'label'],
  ['todo', 'label'],
  ['sources', 'none'],
  ['files', 'none'],
  ['todo', 'none'],
  ['agents', 'none']
]

/** Everything the pane shows besides the turn's log. */
export type PaneData = { roster: readonly RosterAgent[]; work: TurnWork }

const NO_DATA: PaneData = { roster: [], work: { todo: [], isRevised: false, files: [], sources: [], cited: [] } }

/** A lower section `a`, `t`, `f` or `u` shows whole (E.44): no cap, no folding; the pane may then grow past its body and scroll. */
export type Section = 'agents' | 'todo' | 'files' | 'sources'

/**
 * The whole pane, fitted to `rows`: the head, `[ STEPS ]` for this turn (or for the last turn that had steps while
 * this one has none), then each lower section that has anything, one blank row before each. A section that has
 * nothing for this turn is absent; idle, every section shows the last turn as it ended.
 * @param log the turn's log
 * @param now the wall clock in ms, for the running clocks
 * @param width the pane's body columns
 * @param rows the rows to fit: the pane's body rows, or, while a dialog has grown the pane, those it had before
 * @param isPromptCovered a dialog covers the prompt (the `Pane` prop): a permission answer is awaited
 * @param data the roster and the turn's work
 * @returns one Part list per row, at most `rows`
 */
export function paneRows(log: StepLog, now: number, width: number, rows: number, isPromptCovered = false, data: PaneData = NO_DATA): Part[][] {
  return partsOf(paneLines(log, now, width, rows, isPromptCovered, data))
}

/**
 * The pane as `paneRows` fits it, each openable row (a step, a file) under its id. A section in `whole` shows every
 * row and never folds: the pane may then be taller than `rows`, and the engine scrolls it.
 * @param log the turn's log
 * @param now the wall clock in ms
 * @param width the pane's body columns
 * @param rows the rows to fit
 * @param isPromptCovered a dialog covers the prompt
 * @param data the roster and the turn's work
 * @param whole the sections shown whole
 * @returns the rows
 */
export function paneLines(
  log: StepLog,
  now: number,
  width: number,
  rows: number,
  isPromptCovered = false,
  data: PaneData = NO_DATA,
  whole: ReadonlySet<Section> = new Set()
): Line[] {
  const { roster, work } = data
  const head = headRows(log, now, width, isPromptCovered, waitingOn(roster)).map(plain)
  const own = log.steps.length > 0 || log.dropped > 0
  const shown = own ? log : log.prev === null ? undefined : { ...log, steps: log.prev.steps, dropped: log.prev.dropped }
  const count = shown === undefined ? 0 : shown.steps.length + shown.dropped
  const want = rows < 24 ? STEP_ROWS_MIN : STEP_ROWS_WANT
  const stepsNeed = shown === undefined ? 0 : 1 + 1 + Math.max(STEP_ROWS_MIN, Math.min(want, count + (count > want ? 1 : 0)))
  const isTall = rows >= TALL
  const blank = plain([{ t: ' '.repeat(width), color: C.muted }])
  const levels: Levels = { agents: 'full', todo: 'full', files: 'full', sources: 'full' }
  const cap = (section: Section, n: number) => (whole.has(section) ? Infinity : n)
  const lowerRows = (): Line[] => {
    const sections: Line[][] = [
      levels.agents === 'none' ? [] : agentRows(roster, now, width, levels.agents, cap('agents', AGENTS_CAP)).map(plain),
      levels.todo === 'none' ? [] : todoRows({ items: work.todo, isRevised: work.isRevised }, width, cap('todo', isTall ? 5 : 3), levels.todo).map(plain),
      levels.files === 'none' ? [] : fileLines(work.files, width, cap('files', isTall ? 6 : 4), levels.files === 'label'),
      levels.sources === 'none'
        ? []
        : sourceRows(work.sources, work.cited, log.isTurnRunning, width, cap('sources', isTall ? 4 : 3), levels.sources === 'label').map(plain)
    ]

    return sections.flatMap(section => (section.length > 0 ? [blank, ...section] : []))
  }
  let lower = lowerRows()

  for (const [key, level] of LADDER) {
    if (rows - head.length - lower.length - stepsNeed >= 0) break
    if (whole.has(key)) continue

    Object.assign(levels, { [key]: level })
    lower = lowerRows()
  }

  const left = rows - head.length - lower.length - 1
  const title = own ? 'STEPS' : `STEPS · TURN ${log.prev?.turnNo ?? 0}`
  // Too short for three step rows: no steps, unless a section shown whole already scrolls the pane.
  const room = left >= 1 + STEP_ROWS_MIN ? left : whole.size > 0 ? 1 + STEP_ROWS_MIN : 0
  const steps = shown === undefined || room === 0 ? [] : stepLines(shown, width, room, title)
  const fitted = [...head, ...(steps.length > 0 ? [blank, ...steps] : []), ...lower]

  // A section shown whole may make the pane taller than its body: the engine scrolls it.
  return fitted.length <= rows || whole.size > 0 ? fitted : head
}
