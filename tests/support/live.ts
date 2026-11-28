// A recorded session replayed through the engine: each turn's prompt, Claude's blocks and calls in order, every call
// answering as it did, the slash commands typed after it, its agents' reports and the report turns they started.
// Times are the session's own, from T0. The live checks' session (tests/fixtures/live.ts) unless a test names
// another (`MANUAL`, the person's own run, tests/fixtures/manual.ts).
import * as live from '../fixtures/live'
import type { LiveAgent, LiveEvent, LiveTurn } from '../fixtures/live'
import * as manual from '../fixtures/manual'
import { T0 } from './cockpit'
import { text, use } from './docked'
import type { Engine, On } from './engine'
import { respond } from './respond'
import { holdTimers } from './clock'

export type Clock = { now: number }
type Call = { id: string; tool: string; input: Record<string, unknown>; at: number; ms?: number; text?: string; isError?: true; result?: unknown }

/** A fixture's value as text: its string, else the fallback the call names. */
const str = (v: unknown, otherwise: string): string => (typeof v === 'string' ? v : otherwise)

/** HEAD after turn 1's `git commit -q`, as `git log -1 --format=%h%x09%s` prints it. */
export const HEAD = '3c32406	fix: count width by grapheme cluster, not UTF-16 code unit'

/** A recorded session: its typed turns, by the person's numbering, and the agents they launched. */
export type Recorded = { turns: Record<number, LiveTurn>; agents: readonly LiveAgent[] }

export const LIVE: Recorded = { turns: live.TURNS, agents: live.AGENTS }
export const MANUAL: Recorded = { turns: manual.TURNS, agents: manual.AGENTS }

const callsOf = (rec: Recorded) => Object.values(rec.turns).flatMap(t => t.events.filter((e): e is LiveEvent & Call => e.k === 'call'))
const agentIn = (rec: Recorded, description: string) => rec.agents.find(a => a.meta['description'] === description)
// A hook's refusal reaches the call as its error text: `PreToolUse:PowerShell hook error: [<command>]: <message>`.
const HOOK = /^(PreToolUse:\S+) hook error: \[([^\]]+)\]: ([\s\S]*)$/

/** What the engine answers a call with: the session's own outcome. */
function outcome(rec: Recorded, c: Call): Record<string, unknown> {
  if (c.tool === 'Agent')
    return {
      result: { status: 'async_launched', agentId: agentIn(rec, String(c.input['description']))?.agentId ?? c.id, description: c.input['description'] },
      text: c.text ?? ''
    }

  return c.isError === true
    ? { isError: true, text: c.text ?? '', result: c.text ?? '' }
    : { result: c.result ?? { stdout: c.text ?? '', stderr: '' }, text: c.text ?? '' }
}

/**
 * The engine's side of the session: its clock, every call's outcome (by its id), a hook's refusal as `tool.check`
 * gives it, the agents it spawns, the pane's open and close, and an engine drawing under every site.
 * @param on the test's `on`
 * @param clock the clock
 * @param placed whether the pane docks when opened
 * @param rec the recorded session, the live checks' by default
 * @param gone rows a rewind has taken out of the conversation: `$.session.messages({ after })` finds none of them
 */
export function liveEngine(on: On, clock: Clock, placed: boolean, rec: Recorded = LIVE, gone: ReadonlySet<string> = new Set()): void {
  const calls = callsOf(rec)
  let isPlaced = false
  on('clock.now', () => ({ value: clock.now }))
  holdTimers(on)
  on('ui.open', () => {
    isPlaced = placed

    return { value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'unasked below 144 columns' } }
  })
  on('ui.close', () => {
    isPlaced = false

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: isPlaced ? [{ id: 'cockpit', title: 'cockpit', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('ui.focus', { plugin: '*' }, () => ({}))
  on('agent.list', () => ({ value: [] as never }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('agent.spawn', (_, e) => ({ model: 'opus', agentId: agentIn(rec, e.description)?.agentId ?? `ag-${e.description}` }))
  on('agent.report', (_, e) => ({ text: e.text }))
  on('session.messages', (_, e) => ({ value: gone.has(String((e as { after?: unknown }).after)) ? (undefined as never) : [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({ text: 'the engine`s command' }))
  // Git, as the session's repo answered: HEAD after turn 1's commit; no work tree otherwise.
  on('process.run', (_, e) => {
    const argv = (e as { argv?: readonly string[] }).argv ?? []

    return {
      value:
        argv[1] === 'log'
          ? {
              exitCode: 0,
              stdout: `${HEAD}
`,
              stderr: ''
            }
          : { exitCode: 128, stdout: '', stderr: 'not a git repository' }
    } as never
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('tool.check', (_, e) => {
    const c = calls.find(k => k.id === (e as { tool_use_id?: string }).tool_use_id)
    const hook = c?.isError === true ? HOOK.exec(c.text ?? '') : null

    return hook === null
      ? { decision: 'allow' }
      : ({ decision: 'deny', hook: hook[1], reason: `${hook[1] ?? ''} hook error: [${hook[2] ?? ''}]: ${(hook[3] ?? '').trim()}` } as never)
  })
  on('tool.call', (_, e) => {
    const c = calls.find(k => k.id === (e as { tool_use_id?: string }).tool_use_id)

    if (c === undefined) throw new Error('a call the fixture does not hold')
    clock.now = T0 + c.at + (c.ms ?? 0)

    return outcome(rec, c) as never
  })
}

/** One engine turn's events, Claude's blocks and calls, through the engine; it ends at the event `end`. */
async function blocks($: Engine, clock: Clock, events: readonly LiveEvent[], n: number, from: number, to: number): Promise<void> {
  for (let i = from; i < to; i++) {
    const e = events[i]

    if (e === undefined) continue
    clock.now = T0 + (e.at ?? 0)

    // A thinking summary is stored as the thinking block it summarises, not as text.
    if (e.k === 'text') await $.session.append(respond([text(String(e['text']))], `t${n}-b${i}`))
    if (e.k === 'summary') await $.session.append(respond([{ type: 'thinking', thinking: String(e['text']) }], `t${n}-b${i}`))
    if (e.k === 'call') {
      const c = e as LiveEvent & Call
      await $.session.append(respond([use(c.id, c.tool, c.input)], `t${n}-c${i}`))
      await $.tool.call({ tool: c.tool, ...c.input, tool_use_id: c.id } as never)
      if (c.tool === 'Agent') await spawn($, c)
    }
  }
}

const spawn = ($: Engine, c: Call) =>
  $.agent.spawn({
    tool_use_id: c.id,
    prompt: str(c.input['prompt'], ''),
    description: str(c.input['description'], ''),
    subagentType: str(c.input['subagent_type'], 'general-purpose'),
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: true,
    fork: false
  } as never)

/**
 * A typed turn of the session, as the engine raised it: the prompt and its stored row, then each engine turn (the
 * typed one, then one per agent report) with its blocks and calls, ended by its `end` (or cut by `interrupted`), then
 * the slash commands typed after it.
 * @param $ the engine
 * @param clock the clock
 * @param n the turn's number, as the person numbered it
 * @param columns the terminal's width, for the slash commands
 * @param rec the recorded session, the live checks' by default
 * @returns the turn's fixture
 */
export async function liveTurn($: Engine, clock: Clock, n: number, columns = 200, rec: Recorded = LIVE): Promise<LiveTurn> {
  const t = rec.turns[n]

  if (t === undefined) throw new Error(`no turn ${n} in the fixture`)
  clock.now = T0 + t.at
  await $.prompt.submit({ text: t.prompt, wait: false, origin: { kind: 'composer' } })
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: t.prompt }] },
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: t.row
  } as never)

  // The events split into engine turns at each report.
  let segment = 0
  let from = 0
  await $.turn.start({ text: t.prompt, turnId: `t${n}` })

  const reported = new Set<string>()
  const lastEnd = t.events.findLastIndex(x => x.k === 'end')
  const report = (agentId: string) =>
    $.agent.report({
      agentId,
      subagentType: 'caveman:cavecrew-reviewer',
      provider: { plugin: 'engine', tier: 'core' },
      status: 'completed',
      text: 'done'
    } as never)

  for (const [i, e] of t.events.entries()) {
    if (e.k === 'end' || e.k === 'interrupted') {
      await blocks($, clock, t.events, n, from, i)
      const answer = t.events.slice(from, i).findLast(x => x.k === 'text')
      clock.now = T0 + (e.at ?? 0)

      // The session's third agent reported with no notification of its own: all three had reported by the turn's
      // last answer, so any the fixture never notified reports before it ends.
      if (i === lastEnd && segment > 0) {
        for (const a of rec.agents) if (!reported.has(a.agentId)) await report(a.agentId)
      }
      await $.turn.complete({
        answer: str(answer?.['text'], ''),
        durationMs: Number(e['durationMs'] ?? 0),
        isAborted: e.k === 'interrupted',
        turnId: segment === 0 ? `t${n}` : `t${n}-r${segment}`,
        reason: e.k === 'interrupted' ? 'aborted' : 'answer'
      })
      from = i + 1
    }
    if (e.k === 'notification') {
      const id = /<task-id>([^<]+)<\/task-id>/.exec(String(e['text']))?.[1] ?? ''
      clock.now = T0 + (e.at ?? 0)
      reported.add(id)
      await report(id)
      await $.prompt.submit({ text: String(e['text']), wait: false, origin: { kind: 'task-notification' } })
      segment++
      await $.turn.start({ text: String(e['text']), turnId: `t${n}-r${segment}` })
      from = i + 1
    }
    if (e.k === 'command') {
      clock.now = T0 + (e.at ?? 0)
      await $.command.run({
        command: String(e['command']),
        args: str(e['args'], ''),
        origin: { kind: 'composer' },
        presentation: { isFullscreen: true, columns }
      })
      from = i + 1
    }
    if (e.k === 'output') from = i + 1
  }

  return t
}

/** The id the engine draws a turn's block under (`requestId`): its turn and its place among the turn's events. */
export function blockRow(n: number, text: string, rec: Recorded = LIVE): string {
  const at = rec.turns[n]?.events.findIndex(e => (e.k === 'text' || e.k === 'summary') && String(e['text']) === text) ?? -1

  if (at < 0) throw new Error(`turn ${n} has no block ${text.slice(0, 20)}`)

  return `t${n}-b${at}`
}

/** A turn's blocks of a kind, in order: its answers (`text`) or its thinking summaries (`summary`). */
export const blocksOf = (n: number, kind: 'text' | 'summary', rec: Recorded = LIVE): string[] =>
  (rec.turns[n]?.events ?? []).filter(e => e.k === kind).map(e => String(e['text']))
