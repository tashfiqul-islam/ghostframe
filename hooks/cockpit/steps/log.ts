// Cockpit's step log: one turn's tool calls as `[ STEPS ]` rows (spec E.12, E.37, E.39, H.5; amendments 1
// and 2). Pure: hooks/cockpit/log.ts keeps the log in $.state and draws what `stepRows` returns.
import type { LastTurn, Receipt, StepLog, LogStep } from '../../../types'
import { UNLISTED, fixKey, kindOf, subjectOf } from './kinds'
import { outcomeOf, plural } from './results'

/** A call as it starts: its id, tool, input, and the wall clock in ms. */
export type StepStart = { id: string; tool: string; input: unknown; at: number }

/** What the call came back with, as `tool.call`'s `next(e)` resolves (a deny, an error, or the tool's record). */
export type Outcome = { result?: unknown; text?: string | undefined; isError?: true | undefined; deny?: string | undefined }

/** A call as it ends. */
export type StepEnd = StepStart & { outcome: Outcome }

// shortcut: one turn is held whole; past this many steps the oldest are dropped and counted in `dropped`.
// Move the log to $.store when history lands (phase 8).
const STEPS_MAX = 5_000

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

  return { ...newLog(turn, startedAt), turnNo: log.turnNo + 1, isTurnRunning: true, prev }
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

// A fetch or search that fails is a source problem, not the turn's (amendment 6): its row keeps its ✕ and its status,
// and [ SOURCES ] its pink status, but nothing waits on it being fixed.
const SOURCE_KINDS = new Set(['fetch', 'web'])

/** Whether a step failed in a way the turn is answerable for: a failed fetch or search is not. */
export const isTurnFailure = (s: LogStep): boolean => s.mark === '✕' && !SOURCE_KINDS.has(s.kind)

/** Whether a failed step is still open: a turn failure no later step with its key settled without failing. */
export function isOpen(steps: readonly LogStep[], index: number): boolean {
  const s = steps[index]

  return s !== undefined && isTurnFailure(s) && !steps.slice(index + 1).some(t => !t.isRunning && t.key === s.key && t.mark !== '✕')
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
  const row: LogStep = {
    id: call.id,
    kind,
    subject,
    key: fixKey(kind, subject, call.input),
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

  const fixes = log.steps.some((s, i) => i < at && s.key === row.key && isOpen(log.steps, i))
  const { result, mark } = outcomeOf(row.kind, end.tool, end.input, end.outcome, fixes)
  const asking = log.asking.filter(id => id !== end.id)

  // The step is answered; the model is called again: `[ NOW ]` says `waiting` from here.
  return { ...log, asking, mode: 'requesting', modeSince: end.at, steps: log.steps.with(at, { ...row, result, mark, isRunning: false, clock }) }
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

  const failures = steps.filter(isTurnFailure)
  const open = failures.filter(s => isOpen(steps, steps.indexOf(s)))
  const first = open[0]

  if (first !== undefined) {
    return { state: 'failed', story: `${plural(open.length, 'failure')} · ${first.kind} ${first.subject}`, wait: 'ask Claude to continue' }
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
  const last: LastTurn = { ...verdict(steps, isAborted), durationMs: workedMs, endedAt: log.segmentStart === null ? null : log.segmentStart + segmentMs }

  return { ...log, steps, segmentMs, workedMs, isTurnRunning: false, asking: [], mode: null, modeSince: null, last }
}

const FILE_KINDS = new Set(['edit', 'write', 'notebook'])

/**
 * A finished engine turn's receipt (E.32): its state, and its own steps only (a turn its agents' reports started
 * borrows nothing from the typed turn before it): their count, failures and how many were fixed, files changed,
 * the last commit, the failures left open, and its time. `waiting` while `agents` background agents still run.
 */
export function receiptOf(log: StepLog, agents = 0): Receipt {
  const from = Math.max(0, log.segmentFrom - log.dropped)
  const all = log.steps
  const failed = all.flatMap((s, i) => (i >= from && isTurnFailure(s) ? [i] : []))
  const open = failed.flatMap(i => {
    const s = all[i]

    return s === undefined || !isOpen(all, i) ? [] : [{ kind: s.kind, subject: s.subject, result: s.result, clock: s.clock }]
  })
  const steps = all.slice(from)
  const files = new Set(steps.filter(s => FILE_KINDS.has(s.kind) && s.mark !== '✕' && !s.isRunning).map(s => s.subject))
  // A page is the fetch's host and path, as `[ SOURCES ]` keeps one row per page.
  const pages = new Set(steps.filter(s => s.kind === 'fetch').map(s => s.subject.toLowerCase().replace(/^www\./, '')))
  const launched = steps.filter(s => s.kind === 'agent').reduce((n, s) => n + (s.calls?.length ?? 1), 0)
  const isCut = log.last?.state === 'interrupted'
  const state = isCut ? 'interrupted' : open.length > 0 ? 'failed' : agents > 0 ? 'waiting' : 'done'

  return {
    turn: log.turn,
    turnNo: log.turnNo,
    answer: '',
    state,
    agents: state === 'waiting' ? agents : 0,
    steps: Math.max(0, all.length + log.dropped - log.segmentFrom),
    failures: failed.length,
    fixed: failed.length - open.length,
    files: files.size,
    launched,
    sources: pages.size,
    commit: steps.findLast(s => s.mark === '±')?.result ?? '',
    open,
    durationMs: log.segmentMs
  }
}
