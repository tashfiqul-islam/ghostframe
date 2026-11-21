// Cockpit's roster of agents (spec E.40, correction M): one entry per agent from its launch to the end of the
// turn, changed in place and never reordered. Pure: hooks/cockpit/log.ts keeps it in $.state.
import type { RosterAgent } from '../../../types'
import { kindOf, subjectOf } from '../steps/kinds'

/** An agent as it starts: `agent.spawn`'s answer and input, and the wall clock in ms. */
export type AgentStart = { id: string; call: string; parent: string | null; name: string; isBackground: boolean; at: number }

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
    isBackground: start.isBackground,
    state: 'running',
    kind: 'start',
    subject: 'reading its brief',
    steps: 0,
    startedAt: start.at,
    endedAt: null
  }
  const at = roster.findIndex(a => a.id === start.id)

  const known = roster[at]

  // A resumed agent (a parent the engine wakes for its child's report: the same id, no launching call) runs again
  // in its own row, keeping its launch, its start and its steps: rows never move.
  if (known !== undefined) return roster.with(at, { ...known, state: 'running', endedAt: null })

  const list = [...roster, agent]
  const over = list.length - ROSTER_MAX

  return over > 0 ? list.filter((a, i) => a.state === 'running' || i >= over) : list
}

/** An agent's own call started: its row says what it does now, and counts the step. */
export function agentStep(roster: readonly RosterAgent[], id: string, tool: string, input: unknown, cwd?: string): RosterAgent[] {
  return roster.map(a =>
    a.id === id && a.state === 'running' ? { ...a, kind: kindOf(tool, input), subject: subjectOf(tool, input, cwd), steps: a.steps + 1 } : a
  )
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
 * the reason. Its time freezes. A second report changes nothing.
 */
export function endAgent(roster: readonly RosterAgent[], end: AgentEnd): RosterAgent[] {
  return roster.map(a => {
    if (a.id !== end.id || a.state !== 'running') return a

    const isDone = end.status === 'completed'
    const said = head(end.text)
    const subject = isDone ? said : end.status === 'stopped' ? 'stopped' : said.length > 0 ? said : 'failed'

    return { ...a, state: isDone ? 'done' : 'failed', kind: isDone ? 'done' : 'failed', subject, endedAt: end.at }
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
