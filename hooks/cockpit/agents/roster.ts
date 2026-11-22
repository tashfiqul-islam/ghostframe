// Cockpit's roster of agents (spec E.40, correction M): one entry per agent from its launch to the end of the
// turn, changed in place and never reordered. Pure: hooks/cockpit/log.ts keeps it in $.state.
import type { RosterAgent, StepLog } from '../../../types'
import { UNLISTED, kindOf, subjectOf } from '../steps/kinds'
import { endLaunched, newLog, settleStep, startStep } from '../steps/log'
import type { StepEnd } from '../steps/log'

/** An agent as it starts: `agent.spawn`'s answer and input, and the wall clock in ms. */
export type AgentStart = { id: string; call: string; parent: string | null; name: string; called?: readonly string[]; isBackground: boolean; at: number }

/** How an agent's run ended, as `agent.report` says. */
export type AgentEnd = { id: string; status: 'completed' | 'failed' | 'stopped'; text: string; at: number }

// shortcut: a session that launches more agents than this drops the oldest finished ones from the roster;
// the section shows at most 7 rows anyway (E.40). Raise it if `a` ever lists them all (E.44).
const ROSTER_MAX = 200

/** An agent started: its row appears last, `start · reading its brief`, 0 steps (E.40 *Launched*). */
export function addAgent(roster: readonly RosterAgent[], start: AgentStart): RosterAgent[] {
  const agent: RosterAgent = {
    id: start.id,
    call: start.call,
    parent: start.parent,
    name: start.name,
    ...(start.called === undefined || start.called.length === 0 ? {} : { called: [...start.called] }),
    isBackground: start.isBackground,
    state: 'running',
    kind: 'start',
    subject: 'reading its brief',
    steps: 0,
    startedAt: start.at,
    endedAt: null,
    subjectAt: start.at,
    pending: null
  }
  const at = roster.findIndex(a => a.id === start.id)

  // A known id is the engine waking an agent (a parent, to read its child's report): its row stays as it is. An
  // agent runs from its spawn to its final report; a wake-up never makes a finished one run again.
  if (at >= 0) return [...roster]

  const list = [...roster, agent]
  const over = list.length - ROSTER_MAX

  return over > 0 ? list.filter((a, i) => a.state === 'running' || i >= over) : list
}

const SUBJECT_MS = 1_000 // an agent's subject changes at most once a second (E.40)

const AGENT_STEPS_MAX = 500 // an agent's own rows kept; older ones are counted in `logDropped`

/** An agent's own steps as a step log on its own clock, so the main loop's pure step functions write it. */
function logOf(a: RosterAgent): StepLog {
  return { ...newLog(null, a.startedAt), steps: a.log ?? [], dropped: a.logDropped ?? 0, turnNo: 1, isTurnRunning: true }
}

/** The agent with its step log written back, the oldest rows past the cap counted. */
function withLog(a: RosterAgent, log: StepLog): RosterAgent {
  const over = Math.max(0, log.steps.length - AGENT_STEPS_MAX)

  return { ...a, log: log.steps.slice(over), logDropped: log.dropped + over }
}

/**
 * An agent's own call started at `at`: the step counts at once; its row says what it does now if its subject last
 * changed a second ago or more, else the step waits as `pending` (see `shownStep`), so a fast agent never flickers.
 * With the call's id, the step also joins the agent's own log (B1). A call that draws no step row (UNLISTED) counts
 * for nothing.
 */
export function agentStep(
  roster: readonly RosterAgent[],
  id: string,
  tool: string,
  input: unknown,
  cwd: string | undefined,
  at: number,
  callId?: string
): RosterAgent[] {
  return roster.map(a => {
    if (a.id !== id || a.state !== 'running' || UNLISTED.has(tool)) return a

    const step = { kind: kindOf(tool, input), subject: subjectOf(tool, input, cwd) }
    const logged = callId === undefined ? a : withLog(a, startStep(logOf(a), { id: callId, tool, input, at }, cwd))

    return at - a.subjectAt >= SUBJECT_MS
      ? { ...logged, ...step, steps: a.steps + 1, subjectAt: at, pending: null }
      : { ...logged, steps: a.steps + 1, pending: step }
  })
}

/** An agent's own call ended: its row in the agent's log settles, once (a launch, when its agents have reported). */
export function agentStepEnd(roster: readonly RosterAgent[], id: string, end: StepEnd): RosterAgent[] {
  return roster.map(a => (a.id === id && a.log !== undefined ? withLog(a, settleStep(logOf(a), end)) : a))
}

/** A nested agent ended: its launch in its parent's own log counts it (amendment 1), settling once all have. */
export function agentLaunchEnd(roster: readonly RosterAgent[], parent: string, call: string, isFailed: boolean, at: number): RosterAgent[] {
  return roster.map(a => (a.id === parent && a.log !== undefined ? withLog(a, endLaunched(logOf(a), call, isFailed, at)) : a))
}

/** What a running agent's row says at `now`: its pending step once a second has passed since its subject changed. */
export function shownStep(a: RosterAgent, now: number): { kind: string; subject: string } {
  return a.state === 'running' && a.pending !== null && now - a.subjectAt >= SUBJECT_MS ? a.pending : { kind: a.kind, subject: a.subject }
}

/** The first line of a report with its Markdown marks taken off: `4 findings`. */
function head(text: string): string {
  const line = text.split('\n').find(l => l.trim().length > 0) ?? ''

  return line
    .replace(/^[\s#>*-]+/, '')
    .replaceAll(/[*_`]/g, '')
    .trim()
}

/**
 * An agent reported: done, its subject the head of the report; or failed (a stop counts as a failure), its subject
 * the reason. Its time freezes. A later report of a finished agent (a parent woken for its child's) brings its
 * newer head and end, never `running` again.
 */
export function endAgent(roster: readonly RosterAgent[], end: AgentEnd): RosterAgent[] {
  return roster.map(a => {
    if (a.id !== end.id) return a

    const isDone = end.status === 'completed'
    const said = head(end.text)
    const subject = isDone ? said : end.status === 'stopped' ? 'stopped' : said.length > 0 ? said : 'failed'

    return { ...a, state: isDone ? 'done' : 'failed', kind: isDone ? 'done' : 'failed', subject, endedAt: end.at, pending: null }
  })
}

/**
 * A main-loop turn ended. Interrupted, a foreground agent still running was stopped with it. Background agents
 * keep running past the turn (E.40 *After the turn*).
 */
export function endTurnAgents(roster: readonly RosterAgent[], isAborted: boolean, at: number): RosterAgent[] {
  if (!isAborted) return [...roster]

  return roster.map(a => (a.state === 'running' && !a.isBackground ? { ...a, state: 'failed', kind: 'failed', subject: 'interrupted', endedAt: at } : a))
}

/** A new main-loop turn starts: the last turn's roster goes, except background agents still running. */
export function startTurnAgents(roster: readonly RosterAgent[]): RosterAgent[] {
  return roster.filter(a => a.state === 'running' && a.isBackground)
}

/**
 * What the engine's own list (`$.agent.list()`) says of the agents still running here, for a run whose report
 * never came (a background agent stopped from its row, say): gone from the list, or settled there, it settles here.
 */
export function reconcile(roster: readonly RosterAgent[], listed: readonly { id: string; taskStatus: string }[], at: number): RosterAgent[] {
  return roster.map(a => {
    if (a.state !== 'running') return a

    const status = listed.find(l => l.id === a.id)?.taskStatus

    if (status === 'running' || status === 'pending' || status === 'paused') return a

    // Not listed: the engine dropped a task that never reported, which only a stop does.
    return status === 'completed'
      ? { ...a, state: 'done', kind: 'done', subject: '', endedAt: at }
      : { ...a, state: 'failed', kind: 'failed', subject: status === 'failed' ? 'failed' : 'stopped', endedAt: at }
  })
}

/** Whether any agent still runs. */
export const anyRunning = (roster: readonly RosterAgent[]): boolean => roster.some(a => a.state === 'running')

/** How many of the main loop's own background agents still run: what the main loop waits on (nested agents report to their parent). */
export const waitingOn = (roster: readonly RosterAgent[]): number => roster.filter(a => a.state === 'running' && a.isBackground && a.parent === null).length
