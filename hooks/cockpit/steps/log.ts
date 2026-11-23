// Cockpit's step log: one turn's tool calls as steps (spec E.12, E.37, E.39, H.5; amendments 1 and 2; v8 13).
// Pure: hooks/cockpit/log.ts keeps the log in $.state and hooks/cockpit/v8/ draws it.
import type { LastTurn, Receipt, StepLog, LogStep } from '../../../types'
import { DENIED } from '../../shared/calls/describe'
import { levelsOf } from '../../shared/look/trace'
import { exitOf } from '../../shared/look/words'
import { canFail, failureKey, fixes, keyOf, keyText, negativeAnswer } from './failures'
import { UNLISTED, command, kindOf, rec, subjectOf } from './kinds'
import { outcomeOf, plural } from './results'

/** A call as it starts: its id, tool, input, and the wall clock in ms. */
export type StepStart = { id: string; tool: string; input: unknown; at: number }

/** What the call came back with, as `tool.call`'s `next(e)` resolves (a deny, an error, or the tool's record). */
export type Outcome = { result?: unknown; text?: string | undefined; isError?: true | undefined; deny?: string | undefined }

/** A call as it ends; `blockedBy`, what refused it before it ran (a hook, a rule, the ceiling), when one did (13.7). */
export type StepEnd = StepStart & { outcome: Outcome; blockedBy?: string | undefined }

// shortcut: one turn is held whole; past this many steps the oldest are dropped and counted in `dropped`.
// Move the log to $.store when history lands (phase 8).
const STEPS_MAX = 5_000

// The kinds whose steps change a file.
const FILE_KINDS = new Set(['edit', 'write', 'notebook'])

/** An empty log for a turn that started at `startedAt`; unknown (null), the turn's first step starts its clock. */
export function newLog(turn: string | null, startedAt: number | null): StepLog {
  return {
    turn,
    startedAt,
    segmentStart: startedAt,
    segmentFrom: 0,
    segmentMs: 0,
    workedMs: 0,
    steps: [],
    dropped: 0,
    turnNo: 0,
    isTurnRunning: false,
    said: '',
    mode: null,
    modeSince: null,
    asking: [],
    last: null,
    prev: null
  }
}

/**
 * A main-loop turn starts: the next number, an empty log, and the last turn that had steps kept for
 * `[ STEPS · TURN n ]` until this one has its own.
 */
export function newTurn(log: StepLog, turn: string, startedAt: number | null): StepLog {
  const prev = log.steps.length > 0 ? { turnNo: log.turnNo, steps: log.steps, dropped: log.dropped } : log.prev
  // The turn before was interrupted (screen 06): it ended aborted, or it never ended before this prompt came.
  const isCut = log.turnNo > 0 && (log.last?.state === 'interrupted' || log.isTurnRunning)
  const files = new Set(log.steps.filter(s => FILE_KINDS.has(s.kind) && s.mark !== '✕' && s.state === undefined).map(s => s.subject))
  const cut = isCut ? { cut: { turnNo: log.turnNo, steps: log.steps.length + log.dropped, files: files.size, startedAt: log.startedAt } } : {}

  // Agents' work no receipt has counted yet (a background agent's, between turns) goes to this turn's first receipt.
  return {
    ...newLog(turn, startedAt),
    turnNo: log.turnNo + 1,
    isTurnRunning: true,
    prev,
    ...cut,
    ...(log.agentWork === undefined ? {} : { agentWork: log.agentWork })
  }
}

/**
 * A main-loop turn no prompt was typed for starts (its agents' reports, say): it carries on the typed turn before
 * it, its number and its steps, with a start, a first step and a time of its own for its receipt. Before any typed
 * turn, it is a turn of its own.
 */
export function continueTurn(log: StepLog, turn: string, at: number): StepLog {
  if (log.turnNo === 0) return newTurn(log, turn, at)

  return {
    ...log,
    turn,
    isTurnRunning: true,
    segmentStart: at,
    segmentFrom: log.steps.length + log.dropped,
    segmentMs: 0,
    said: '',
    mode: null,
    modeSince: null,
    asking: []
  }
}

/** Claude said something in this turn: its first sentence is `[ NOW ]`'s row 1. */
export function noteSaid(log: StepLog, text: string): StepLog {
  const line =
    text
      .split('\n')
      .find(l => l.trim().length > 0)
      ?.trim() ?? ''
  const sentence = /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line

  return sentence.length === 0 ? log : { ...log, said: sentence }
}

/** The spinner's mode changed (`thinking`, `requesting`, …): kept with when it began, for `[ NOW ]`'s row 2. */
export function noteMode(log: StepLog, mode: string, at: number): StepLog {
  return log.mode === mode ? log : { ...log, mode, modeSince: at }
}

/** A step waits on the person's permission answer. */
export function askStep(log: StepLog, id: string): StepLog {
  return log.asking.includes(id) ? log : { ...log, asking: [...log.asking, id] }
}

/**
 * Whether a step failed in a way the turn is answerable for (13.1): a test, shell, edit, write or agent step that
 * errored. A failed fetch or search is a source problem (amendment 6), and a blocked or denied step is no failure.
 */
/** A step whose settled mark says it failed (its exit, its answer), whatever the turn makes of it. */
export const isFailedMark = (s: LogStep): boolean => s.mark === '✕'

/** A step that committed or published. */
export const isShipMark = (s: LogStep): boolean => s.mark === '↗' || s.mark === '±'

export const isTurnFailure = (s: LogStep): boolean => s.mark === '✕' && canFail(s.kind) && s.state === undefined

/** Whether a step succeeded, so it can fix a failure: settled, not failed, not blocked, denied or cut. */
const succeeded = (t: LogStep) => !t.isRunning && t.mark !== '✕' && t.state === undefined && t.result !== 'interrupted'

/** How many failure rows the left draws for a turn (13.1); past them, one `+ n more · /steps n` row. */
export const FAILURE_ROWS = 3

/**
 * Whether a failed step draws a failure row in fallback (13.1): it is the first failure of its key, and its key is
 * one of the turn's first three to fail. It depends only on the steps before it, so a row drawn stays drawn.
 * @param steps the typed turn's steps
 * @param index the step's place in them
 * @returns whether it draws its row
 */
export function isShownFailure(steps: readonly LogStep[], index: number): boolean {
  const s = steps[index]

  if (s === undefined || !isTurnFailure(s)) return false

  const before = steps.slice(0, index).filter(isTurnFailure)

  return !before.some(t => t.key === s.key) && new Set(before.map(t => t.key)).size < FAILURE_ROWS
}

/** Whether a failed step is still open (13.1): a turn failure no later success with the same or a broader key fixed. */
export function isOpen(steps: readonly LogStep[], index: number): boolean {
  const s = steps[index]

  return s !== undefined && isTurnFailure(s) && !steps.slice(index + 1).some(t => succeeded(t) && fixes(keyOf(t.key), keyOf(s.key)))
}

/** The failures of these steps counted by key (13.1): the same failing command run five times is one failure. */
export function failureCounts(steps: readonly LogStep[], from = 0): { failed: string[]; open: string[] } {
  const failed = new Set<string>()
  const open = new Set<string>()

  for (const [i, s] of steps.entries()) {
    if (i < from || !isTurnFailure(s)) continue

    failed.add(s.key)
    if (isOpen(steps, i)) open.add(s.key)
  }

  return { failed: [...failed], open: [...open] }
}

/** How a refused call is told apart (13.7, 13.8): the person's refusal is a denial; any other refusal is a block. */
function refusal(end: StepEnd): { state: 'blocked' | 'denied'; why: string } | undefined {
  const said = end.outcome.deny ?? end.outcome.text ?? ''

  if (end.blockedBy !== undefined) return { state: 'blocked', why: end.blockedBy }
  if (DENIED.test(said)) return { state: 'denied', why: '' }
  if (end.outcome.deny === undefined) return undefined

  const by = /classifier|auto[- ]mode/i.test(said) ? 'by the classifier' : /sandbox/i.test(said) ? 'by the sandbox' : 'by a policy'
  const reason =
    said
      .split('\n')
      .find(l => l.trim().length > 0)
      ?.trim() ?? ''

  return { state: 'blocked', why: reason.length > 0 ? `${by} · ${reason}` : by }
}

const clockOf = (log: StepLog, at: number) => Math.max(0, at - (log.startedAt ?? at))

/**
 * A call starts: its row appears last, in progress. An agent call joins the launch still running
 * in this turn, so a parallel launch is one row (amendment 1).
 */
export function startStep(started: StepLog, call: StepStart, cwd?: string): StepLog {
  if (UNLISTED.has(call.tool)) return started

  const log = started.startedAt === null ? { ...started, startedAt: call.at, segmentStart: started.segmentStart ?? call.at } : started
  const kind = kindOf(call.tool, call.input)

  if (kind === 'agent') {
    const at = log.steps.findLastIndex(s => s.kind === 'agent' && s.isRunning)
    const launch = log.steps[at]

    if (launch !== undefined) {
      const calls = [...(launch.calls ?? []), call.id]
      const joined: LogStep = { ...launch, calls, subject: `${calls.length} launched` }

      return { ...log, steps: log.steps.with(at, joined) }
    }

    const row: LogStep = {
      id: call.id,
      kind,
      subject: '1 launched',
      key: `agent:${call.id}`,
      result: '',
      mark: '',
      isRunning: true,
      clock: clockOf(log, call.at),
      calls: [call.id],
      done: 0,
      failed: 0
    }

    return push(log, row)
  }

  const subject = subjectOf(call.tool, call.input, cwd)
  const file = rec(call.input)['file_path'] ?? rec(call.input)['notebook_path']
  const row: LogStep = {
    id: call.id,
    kind,
    subject,
    key: keyText(failureKey(kind, command(call.input), typeof file === 'string' ? file : '', cwd, call.tool === 'PowerShell' ? 'pwsh' : 'bash')),
    result: '',
    mark: '',
    isRunning: true,
    clock: clockOf(log, call.at)
  }

  return push(log, row)
}

function push(log: StepLog, row: LogStep): StepLog {
  const steps = [...log.steps, row]
  const over = Math.max(0, steps.length - STEPS_MAX)

  return { ...log, steps: steps.slice(over), dropped: log.dropped + over }
}

/** A call ends: its row settles, once. A launch settles when its last agent returns. */
export function settleStep(log: StepLog, end: StepEnd): StepLog {
  const at = log.steps.findIndex(s => s.isRunning && (s.id === end.id || s.calls?.includes(end.id) === true))
  const row = log.steps[at]

  if (row === undefined) return log

  const clock = clockOf(log, end.at)

  if (row.kind === 'agent') {
    const isFailed = end.outcome.isError === true || end.outcome.deny !== undefined

    // A background agent's call returns as it launches: its report ends it (`endLaunched`).
    return !isFailed && isLaunchedOnly(end.outcome.result) ? log : endLaunched(log, end.id, isFailed, end.at)
  }

  const asking = log.asking.filter(id => id !== end.id)
  const settled = (step: LogStep): StepLog => ({ ...log, asking, mode: 'requesting', modeSince: end.at, steps: log.steps.with(at, step) })
  const refused = refusal(end)

  // Refused before it ran: blocked by a system (13.7) or denied by the person (13.8); neither is a failure.
  if (refused !== undefined) return settled({ ...row, result: refused.state, mark: '', isRunning: false, clock, state: refused.state, why: refused.why })

  const said = end.outcome.text ?? ''
  const stderr = rec(end.outcome.result)['stderr']
  const negative = end.outcome.isError === true ? negativeAnswer(command(end.input), exitOf(said), typeof stderr === 'string' ? stderr : undefined) : undefined

  // A search or a compare that answered "no" (13.1): a passing step.
  if (negative !== undefined) return settled({ ...row, result: negative, mark: '', isRunning: false, clock })

  const isFix = log.steps.some((s, i) => i < at && isOpen(log.steps, i) && fixes(keyOf(row.key), keyOf(s.key)))
  const { result, mark } = outcomeOf(row.kind, end.tool, end.input, end.outcome, isFix)

  // The step is answered; the model is called again: `[ NOW ]` says `waiting` from here.
  return settled({ ...row, result, mark, isRunning: false, clock })
}

/** Whether an Agent call's record says it only launched its agent, which runs on in the background. */
function isLaunchedOnly(result: unknown): boolean {
  const status = typeof result === 'object' && result !== null && 'status' in result ? result.status : undefined

  return status === 'async_launched' || status === 'remote_launched'
}

/**
 * One agent of a launch ended (amendment 1): the launch counts it once, by its Agent call's id, whether its report
 * or its call's return said so first; the row settles, `6 done · 1 failed`, when the last of its agents has ended.
 * A launch of an earlier turn (its agents ran in the background) settles in that turn's steps.
 */
export function endLaunched(log: StepLog, call: string, isFailed: boolean, at: number): StepLog {
  // `clockAt` undefined: an earlier turn's launch, whose start is no longer known, keeps its row's clock.
  const settle = (steps: readonly LogStep[], clockAt: number | undefined): LogStep[] | undefined => {
    const i = steps.findIndex(s => s.kind === 'agent' && s.calls?.includes(call) === true)
    const row = steps[i]

    if (row === undefined || row.ended?.includes(call) === true) return undefined

    const ended = [...(row.ended ?? []), call]
    const done = (row.done ?? 0) + (isFailed ? 0 : 1)
    const failed = (row.failed ?? 0) + (isFailed ? 1 : 0)
    const isRunning = ended.length < (row.calls?.length ?? 1)
    const result = isRunning ? '' : [`${done} done`, ...(failed > 0 ? [`${failed} failed`] : [])].join(' · ')

    return steps.with(i, { ...row, ended, done, failed, isRunning, result, mark: '', clock: isRunning || clockAt === undefined ? row.clock : clockAt })
  }
  const own = settle(log.steps, clockOf(log, at))

  if (own !== undefined) return { ...log, steps: own }

  const prev = log.prev === null ? undefined : settle(log.prev.steps, undefined)

  return prev === undefined || log.prev === null ? log : { ...log, prev: { ...log.prev, steps: prev } }
}

/** `[ LAST ]`'s verdict: the state word, the story in a few words, and what waits. */
function verdict(steps: readonly LogStep[], isAborted: boolean): Pick<LastTurn, 'state' | 'story' | 'wait'> {
  if (isAborted) {
    const cutAt = steps.findLast(s => s.result === 'interrupted')

    return { state: 'interrupted', story: cutAt === undefined ? plural(steps.length, 'step') : `cut at ${cutAt.kind} ${cutAt.subject}`, wait: '' }
  }

  if (steps.length === 0) return { state: 'done', story: 'no steps', wait: '' }

  // Counted by key (13.1): a failing command run five times is one failure.
  const counts = failureCounts(steps)
  const failures = counts.failed
  const first = steps.find((s, i) => isOpen(steps, i) && s.key === counts.open[0])

  if (first !== undefined) {
    return { state: 'failed', story: `${plural(counts.open.length, 'failure')} · ${first.kind} ${first.subject}`, wait: 'ask Claude to continue' }
  }

  const shipped = steps.findLast(s => s.mark === '↗')
  const committed = steps.findLast(s => s.mark === '±')
  const facts = [
    ...(failures.length > 0 ? [`${plural(failures.length, 'failure')} → fixed`] : []),
    ...(committed === undefined ? [] : [`± ${committed.result}`]),
    ...(shipped === undefined ? [] : [`↗ ${shipped.result}`])
  ]

  return { state: 'done', story: facts.length > 0 ? facts.join(' · ') : plural(steps.length, 'step'), wait: '' }
}

/**
 * An engine turn ended: a step still running was cut (an interrupted turn has no receipt; correction G), its clock
 * the turn's end, or where it started when the turn's start is unknown. The head turns to `[ LAST ]`. One clock:
 * `endedAt` (Cockpit's) makes the engine turn's time `endedAt − segmentStart`, the one value its receipt and the
 * live row read; `[ LAST ]` adds the typed turn's earlier engine turns (`workedMs`). Without `endedAt`, or without
 * a known start, the engine's `engineMs` stands.
 */
export function endTurn(log: StepLog, engineMs: number, isAborted = false, endedAt?: number): StepLog {
  const segmentMs = endedAt !== undefined && log.segmentStart !== null ? Math.max(0, endedAt - log.segmentStart) : engineMs
  const turnEnd = log.startedAt === null ? undefined : endedAt !== undefined ? Math.max(0, endedAt - log.startedAt) : log.workedMs + segmentMs
  // A launch still running when the turn ends ran its agents in the background: it settles when they report.
  const isCut = (s: LogStep) => s.isRunning && (isAborted || s.kind !== 'agent')
  const steps = log.steps.map(s => (isCut(s) ? { ...s, isRunning: false, result: 'interrupted', mark: '' as const, clock: turnEnd ?? s.clock } : s))
  const workedMs = log.workedMs + segmentMs
  // One clock (13.9): an engine turn's time is its own start to its end (`segmentMs`), for its receipt, the pane head,
  // the live line and `/steps` alike. A typed turn's first engine turn starts at the prompt, so for a turn no agent's
  // report carried on, that is the typed turn's time; a report turn's receipt and the head after it say its own.
  const last: LastTurn = { ...verdict(steps, isAborted), durationMs: segmentMs, endedAt: log.segmentStart === null ? null : log.segmentStart + segmentMs }

  return { ...log, steps, segmentMs, workedMs, isTurnRunning: false, asking: [], mode: null, modeSince: null, last }
}

/** A page as a receipt counts it: the fetch's host and path, as `[ SOURCES ]` keeps one row per page. */
const pageOf = (subject: string) => subject.toLowerCase().replace(/^www\./, '')

/**
 * An agent's own call ended (B3): a file it changed (an edit that did not fail) or a page it fetched joins what the
 * next receipt counts, by the same subject a main-loop step of it would have. Its step counts nothing.
 */
export function noteAgentWork(log: StepLog, tool: string, input: unknown, outcome: Outcome, cwd?: string): StepLog {
  const kind = kindOf(tool, input)
  const isFile = FILE_KINDS.has(kind) && outcome.isError !== true && outcome.deny === undefined

  if (!isFile && kind !== 'fetch') return log

  const subject = subjectOf(tool, input, cwd)
  const had = log.agentWork ?? { files: [], pages: [] }
  const agentWork = isFile ? { ...had, files: [...new Set([...had.files, subject])] } : { ...had, pages: [...new Set([...had.pages, pageOf(subject)])] }

  return { ...log, agentWork }
}

/** A receipt was written: the agents' work it counted clears; what came after it waits for the next receipt. */
export function clearAgentWork(log: StepLog, counted: StepLog['agentWork']): StepLog {
  const had = log.agentWork

  if (had === undefined || counted === undefined) return log

  const files = had.files.filter(f => !counted.files.includes(f))
  const pages = had.pages.filter(p => !counted.pages.includes(p))
  const { agentWork: _, ...rest } = log

  return files.length === 0 && pages.length === 0 ? rest : { ...rest, agentWork: { files, pages } }
}

/**
 * A finished engine turn's receipt (E.32): its state, and its own steps only (a turn its agents' reports started
 * borrows nothing from the typed turn before it): their count, failures and how many were fixed, files changed,
 * the last commit, the failures left open, and its time. `waiting` while `agents` background agents still run.
 */
export function receiptOf(log: StepLog, agents = 0): Receipt {
  const from = Math.max(0, log.segmentFrom - log.dropped)
  const all = log.steps
  const counts = failureCounts(all, from)
  // One open row per key (13.1), its latest attempt's.
  const open = counts.open.flatMap(key => {
    const s = all.findLast((t, i) => i >= from && t.key === key && isTurnFailure(t))

    return s === undefined ? [] : [{ kind: s.kind, subject: s.subject, result: s.result, clock: s.clock }]
  })
  const steps = all.slice(from)
  // Agents' files and pages count too, once each beside the main loop's (B3); their steps do not.
  const files = new Set([...steps.filter(s => FILE_KINDS.has(s.kind) && s.mark !== '✕' && !s.isRunning).map(s => s.subject), ...(log.agentWork?.files ?? [])])
  const pages = new Set([...steps.filter(s => s.kind === 'fetch').map(s => pageOf(s.subject)), ...(log.agentWork?.pages ?? [])])
  const launched = steps.filter(s => s.kind === 'agent').reduce((n, s) => n + (s.calls?.length ?? 1), 0)
  const kinds: Record<string, number> = {}

  for (const s of steps) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1

  // The trace (7.12): the steps bucketed over the engine turn's own time, one cell per bucket, 3 to 12 cells.
  const from0 = log.segmentStart === null || log.startedAt === null ? 0 : log.segmentStart - log.startedAt
  const levels = levelsOf(
    steps.map(s => s.clock - from0),
    log.segmentMs,
    Math.max(3, Math.min(12, steps.length))
  )
  const pr = steps.findLast(s => s.mark === '↗' && /^PR #\d+$/.test(s.result))?.result
  const isCut = log.last?.state === 'interrupted'
  const state = isCut ? 'interrupted' : open.length > 0 ? 'failed' : agents > 0 ? 'waiting' : 'done'

  return {
    turn: log.turn,
    turnNo: log.turnNo,
    answer: '',
    state,
    agents: state === 'waiting' ? agents : 0,
    steps: Math.max(0, all.length + log.dropped - log.segmentFrom),
    failures: counts.failed.length,
    fixed: counts.failed.length - counts.open.length,
    blocked: steps.filter(s => s.state === 'blocked').length,
    files: files.size,
    launched,
    sources: pages.size,
    commit: steps.findLast(s => s.mark === '±')?.result ?? '',
    levels,
    kinds,
    shipped: steps.findLast(s => s.mark === '±')?.result ?? pr ?? '',
    open,
    // One clock (13.9): the same time the pane head shows for this turn.
    durationMs: log.segmentMs
  }
}
