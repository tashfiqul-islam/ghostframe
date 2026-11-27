// Cockpit's log of the main loop (spec E.24, E.38, E.40, H.1): the step log, the roster of agents, the receipts and
// the timers, kept in $.state, and the events that write them.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer, ToolCallInput } from 'claude-code'

import { addAgent, agentLaunchEnd, agentStep, agentStepEnd, anyRunning, endAgent, endTurnAgents, reconcile, startTurnAgents, waitingOn } from './agents/roster'
import type { AgentEnd, AgentStart } from './agents/roster'
import {
  askStep,
  unaskStep,
  clearAgentWork,
  continueTurn,
  endLaunched,
  endTurn,
  newLog,
  newTurn,
  noteAgentWork,
  noteMode,
  noteSaid,
  receiptOf,
  settleStep,
  startStep
} from './steps/log'
import type { Outcome } from './steps/log'
import type { LaunchedAgent, Receipt, RosterAgent, StepLog } from '../../types'
import { fileDiff, resetSnapshots, snapshotBefore } from './history/snapshots'
import { restoredLog } from './history/record'
import { compacted, dropTurns, loadHistory, markCompacted, saveTurn, setPin } from './history/store'
import { clearSwitch } from './tui'
import { isNarrationAt, readFlow } from '../shared/flow'
import { noteEnd, noteStart, readDetails, restoreDetails } from './keys/details'
import { noteShown } from './mode'
import { commitIn, hookWords, ruledStatement } from './steps/failures'
import { showPath } from '../shared/look/paths'
import { parseShip, shellText } from '../shared/calls/ships'
import { isOn, noticeSink } from './switch'
import { noteCited, noteFetchStart, noteWork, readWork, restoreWork, startWork, workSettled } from './work'

// The current (or last) main-loop turn's log. Change the tag when its fields change.
const stepLog = atom({ plugin: 'ghostframe', key: 'stepLog' } as const, newLog(null, null), { shape: 'stepLog-4' })
// The main-loop turn running now (null when none runs), written beside the step log whenever that changes: a
// transcript row asks only this, never the step log, whose every step it would otherwise read on each draw.
const running = atom({ plugin: 'ghostframe', key: 'running' } as const, null as string | null, { shape: 'running-1' })
/** The running turn as this copy of the module last wrote it; undefined until it writes (a reload writes once). */
let mirrored: string | null | undefined
// The agents of the current (or last) turn, and background agents still running from earlier ones (E.40).
const roster = atom({ plugin: 'ghostframe', key: 'roster' } as const, [] as RosterAgent[], { shape: 'roster-2' })
// Every agent this session launched, for the whole session: the roster drops finished agents at each typed turn and
// history drops old turns under the store's budget, but an agent can notify again long after (8.9).
const launched = atom({ plugin: 'ghostframe', key: 'launched' } as const, [] as LaunchedAgent[], { shape: 'launched-1' })
const LAUNCHED_MAX = 1_000
// Counters the timers bump while a turn runs: each second (the pane's running clock) and each spinner frame.
const second = atom({ plugin: 'ghostframe', key: 'second' } as const, 0, { shape: 'second-1' })
const frame = atom({ plugin: 'ghostframe', key: 'frame' } as const, 0, { shape: 'frame-1' })
// Each finished turn's receipt, by turn id, so a receipt drawn again later (a resize, a scroll) shows its own turn.
const receipts = atom({ plugin: 'ghostframe', key: 'receipts' } as const, [] as Receipt[], { shape: 'receipts-7' })
const RECEIPTS_MAX = 500

const SECOND_MS = 1_000
const FRAME_MS = 100 // H.1 asks 80 ms; the engine redraws a site at most ten times a second

// shortcut: the timers live in the module; a reload stops them (the engine's rule) and a turn running across a
// reload then shows its last second until the next turn starts. Fine while Cockpit is a test-only feature.
let timers: Timer[] = []
/** The session's folder, as the last call gave it: where the turn's files are read for their diffs. */
let lastCwd: string | undefined

/**
 * Changes the step log, and the running turn beside it when that changed.
 * @param $ the engine interface
 * @param change the log's change
 * @returns the log as written
 */
async function updateLog($: EngineInterface, change: (log: StepLog) => StepLog): Promise<StepLog> {
  const log = await update($, stepLog, change)
  const now = log.isTurnRunning ? log.turn : null

  if (now !== mirrored) {
    mirrored = now
    await update($, running, () => now)
  }

  return log
}

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
 * Starts the timers: both while a turn runs; the second alone while only background agents do, so their rows'
 * clocks go on in an idle pane.
 * @param $ the engine interface
 * @param isTurn whether a turn runs
 */
function startTimers($: EngineInterface, isTurn: boolean): void {
  stopTimers()
  timers = [$.clock.every(SECOND_MS, () => void tickSecond($)), ...(isTurn ? [$.clock.every(FRAME_MS, () => void tickFrame($))] : [])]
}

/**
 * A main-loop turn starts, and the timers with it. A turn the person typed for starts a new log on its own clock
 * (its number the next typed prompt's) and a new roster; a turn no prompt was typed for (its agents' reports)
 * carries on the typed turn before it, with its number, steps and roster.
 * @param $ the engine interface
 * @param turn the turn's id
 * @param at when its prompt was typed (wall clock, ms); undefined when none was
 * @param cwd the session's folder, where the turn's file changes are read
 */
export async function logTurnStart($: EngineInterface, turn: string, at: number | undefined, cwd?: string): Promise<void> {
  if (!isOn()) return

  const now = await $.clock.now()
  await noteShown($)

  if (at === undefined) {
    await updateLog($, log => continueTurn(log, turn, now))
  } else {
    // A rewind took the last turns out: they leave first, and the new turn follows the last that remains (7.1).
    await noteRewind($, true)
    await applyRewind($)
    await updateLog($, log => newTurn({ ...log, turnNo: lastRemaining(log) }, turn, at))
    rewound.clear()
    // A typed prompt means the person has moved on: the pin goes (E.45), and the new turn's files are read afresh.
    await setPin($, null, 0)
    resetSnapshots()
    await startWork($, cwd)
    await settleUnreported($, now)
    await update($, roster, startTurnAgents)
    // A `/tui` switch is old news too; a note that cannot be cleared costs a repeat of it after a reload, nothing more.
    await clearSwitch($).catch((error: unknown) => $.ui.log(`cockpit: /tui note not cleared: ${String(error)}`, noticeSink()))
  }

  lastMode = undefined
  startTimers($, true)
}

/**
 * Agents still running here that the engine's own list says ended (correction M: the list is the roster's second
 * source), for a run whose report never came. A list the engine cannot give leaves them as they are.
 * @param $ the engine interface
 * @param now the wall clock in ms
 */
async function settleUnreported($: EngineInterface, now: number): Promise<void> {
  if (!anyRunning(await read($, roster))) return

  try {
    const listed = await $.agent.list()
    await update($, roster, list => reconcile(list, listed, now))
  } catch (error: unknown) {
    $.ui.log(`cockpit: agent list unavailable: ${String(error)}`, noticeSink())
  }
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
  await updateLog($, log => (log.isTurnRunning ? noteMode(log, mode, at) : log))
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

  lastCwd = cwd ?? lastCwd
  await snapshotBefore($, e.tool, e, cwd)
  noteFetchStart(e.tool, e)

  await updateLog($, log => startStep(log, { id: e.tool_use_id, tool: e.tool, input: e, at }, cwd))
  await noteStart($, e.tool_use_id, e.tool, e, at)
}

/**
 * A main-loop call ends: its row settles, and what it did joins the turn's to-dos, files and pages.
 * @param $ the engine interface
 * @param e the call
 * @param outcome what `next(e)` resolved to; undefined when it threw
 * @param at the wall clock in ms
 * @param cwd the session's folder, for paths from the project root
 */
export async function logStepEnd($: EngineInterface, e: ToolCallInput, outcome: Outcome | undefined, at: number, cwd?: string): Promise<void> {
  if (!isOn()) return

  const got = outcome ?? { isError: true as const, text: 'failed' }
  const ran = await withCommit($, e, got, cwd)
  const block = blocks.get(e.tool_use_id)
  blocks.delete(e.tool_use_id)
  const blockedBy = block?.why
  const blockedSubject = block?.rule === undefined ? undefined : ruledSubject(e, block.rule, cwd)
  // The detail first: a fallback failure row is decided the moment its step settles, and reads its output then.
  await noteEnd($, e.tool_use_id, e, ran, at)
  await updateLog($, log => settleStep(log, { id: e.tool_use_id, tool: e.tool, input: e, at, outcome: ran, blockedBy, blockedSubject }))
  afterCall($, e.tool, noteWork($, e.tool, e, ran, cwd))
  lastMode = 'requesting'
}

/**
 * What a call adds to the turn's files and pages (the work tree's diff, the new files' counts) is worked out after the
 * call has returned, in the order calls ended, never inside its hook: a call is never held up by it.
 * @param $ the engine interface
 * @param tool the call's tool
 * @param noted the work under way
 */
function afterCall($: EngineInterface, tool: string, noted: Promise<void>): void {
  noted.catch((error: unknown) => $.ui.log(`cockpit: a ${tool} call's files not noted: ${String(error)}`, { to: 'debug' }))
}

/**
 * A `git commit` that succeeded but printed no `[branch sha] subject` line (`-q`, or its output piped away): the
 * commit it made is HEAD now, read from Git, so the step, its `↗ committed` row and the receipt name it (7.10).
 * @param $ the engine interface
 * @param e the call
 * @param ran what it returned
 * @param cwd the session's folder, where Git is asked
 * @returns the outcome, with the commit when it was read
 */
async function withCommit($: EngineInterface, e: ToolCallInput, ran: Outcome, cwd: string | undefined): Promise<Outcome> {
  const command: unknown = Reflect.get(e, 'command')
  const isShell = e.tool === 'Bash' || e.tool === 'PowerShell'

  const commits = !isShell || ran.isError === true || ran.deny !== undefined || typeof command !== 'string' ? undefined : commitIn(command)

  if (commits === undefined || typeof command !== 'string') return ran
  if (parseShip(e.tool_use_id, command, shellText(ran.result) || (ran.text ?? ''))?.commit !== undefined) return ran

  // Git is asked where the commit ran: the folder its `cd` or `git -C` named, from the session's folder.
  const at = commits.dir === undefined ? cwd : /^(?:[A-Za-z]:|[/\\~])/.test(commits.dir) || cwd === undefined ? commits.dir : `${cwd}/${commits.dir}`

  try {
    const head = await $.process.run(['git', 'log', '-1', '--format=%h%x09%s'], at === undefined ? {} : { cwd: at })
    const [sha = '', subject = ''] = head.stdout.trim().split('\t')

    return head.exitCode === 0 && /^[0-9a-f]{7,40}$/.test(sha) ? { ...ran, commit: { sha: sha.slice(0, 7), subject } } : ran
  } catch (error: unknown) {
    // Git could not be asked (no repository, no Git): the step settles as its output says, with no hash.
    $.ui.log(`cockpit: commit not read from Git: ${String(error)}`, noticeSink())

    return ran
  }
}

/**
 * The answer cites pages: their marks in `[ SOURCES ]`, in the order the transcript numbers them. An answer that
 * cites nothing leaves the marks the turn already has.
 * @param $ the engine interface
 * @param cited the pages, first-cited order
 */
export async function logCited($: EngineInterface, cited: readonly { url: string; title: string }[]): Promise<void> {
  if (!isOn() || cited.length === 0) return

  await noteCited($, cited)
}

// The main-loop calls a check refused, by id, with who refused them (13.7), until their step settles.
// shortcut: kept in the module, so a reload between a check and its call's end loses the block; the step then reads as
// the engine's refusal text says (a policy). Fine: a check and its call's end are milliseconds apart.
const blocks = new Map<string, { why: string; rule?: string | undefined }>()

/**
 * What a rule refused in a joined command (13.7): the statement it matched, its paths from the project root, so the
 * row names `rm -rf src` rather than the command's first statement.
 */
function ruledSubject(e: ToolCallInput, rule: string, cwd: string | undefined): string | undefined {
  const command: unknown = Reflect.get(e, 'command')
  const statement = typeof command === 'string' ? ruledStatement(command, rule) : undefined

  return statement
    ?.split(' ')
    .map(w => (/[/\\]/.test(w) ? showPath(w, { project: cwd }) : w))
    .join(' ')
}
const BLOCKS_MAX = 100

/**
 * A check refused a main-loop call before it ran (13.7): a hook (`PreToolUse`), a settings rule or the organization's
 * ceiling. Its step settles `blocked`, with this as its detail line. The person's refusal is not a check's: a denial.
 * @param id the call's id
 * @param verdict the check's verdict: the hook event, the rule, and the reason it gave
 */
export function logBlocked(id: string, verdict: { hook?: string | undefined; rule?: string | undefined; reason?: string | undefined }): void {
  if (!isOn()) return

  // A hook names its script and its own message (`by a hook · guard-main.ps1 · pushing is blocked`), not the engine's
  // wrapper around them; a rule's reason is only the engine's `Permission to use …` sentence, so the rule alone says it.
  const words = verdict.hook === undefined ? undefined : hookWords(verdict.reason ?? '')
  const who =
    verdict.hook !== undefined ? `by a hook · ${words?.script ?? verdict.hook}` : verdict.rule !== undefined ? `by a rule · ${verdict.rule}` : 'by a policy'
  const said =
    words?.message ??
    verdict.reason
      ?.split('\n')
      .find(l => l.trim().length > 0)
      ?.trim()
  const reason = verdict.rule !== undefined || /^Permission to use /i.test(said ?? '') ? undefined : said

  blocks.set(id, { why: reason === undefined || reason.length === 0 ? who : `${who} · ${reason}`, rule: verdict.rule })
  while (blocks.size > BLOCKS_MAX) blocks.delete(blocks.keys().next().value ?? id)
}

/**
 * A main-loop call waits on the person's permission answer: `[ NOW ]` says `needs you`.
 * @param $ the engine interface
 * @param id the call's id
 */
export async function logAsk($: EngineInterface, id: string): Promise<void> {
  if (!isOn()) return

  await updateLog($, log => askStep(log, id))
}

/**
 * A main-loop call no longer waits on the person (9.3): the mode's decider answers it (auto mode's classifier), or a
 * check refused it. Its row and the pane's pill stop saying it waits on you.
 * @param $ the engine interface
 * @param id the call's id
 */
export async function logUnask($: EngineInterface, id: string): Promise<void> {
  if (!isOn()) return

  await update($, stepLog, log => unaskStep(log, id))
}

/**
 * Claude said something in the main loop: the last text block's first sentence is `[ NOW ]`'s row 1.
 * @param $ the engine interface
 * @param content the response's content blocks
 */
export async function logSaid($: EngineInterface, content: readonly { type: string; [k: string]: unknown }[]): Promise<void> {
  if (!isOn()) return

  const text = content.findLast(b => b.type === 'text' && typeof b['text'] === 'string' && b['text'].trim().length > 0)?.['text']

  if (typeof text === 'string') await updateLog($, log => noteSaid(log, text))
}

/**
 * A main-loop turn ends: a step still running was cut, the head turns to `[ LAST ]`, the timers stop, and the turn's
 * receipt is kept. One clock: the turn's time is Cockpit's own, now less its start, for the head, the receipt and
 * the live row alike; the engine's `durationMs` stands only when the start is unknown.
 * @param $ the engine interface
 * @param durationMs how long the engine says the turn ran
 * @param isAborted whether it was interrupted (correction G: no receipt; `[ LAST ]` carries the state)
 * @param answer the id of the turn's last answer row, where its receipt is drawn ('' when it wrote none)
 */
export async function logTurnEnd($: EngineInterface, durationMs: number, isAborted: boolean, answer = ''): Promise<void> {
  if (!isOn()) return

  // The turn's calls' files are noted after each call returns: the receipt and history count them all.
  await workSettled()

  const now = await $.clock.now()
  await updateLog($, log => endTurn(log, durationMs, isAborted, now))
  await update($, roster, list => endTurnAgents(list, isAborted, now))
  const waiting = waitingOn(await read($, roster))
  const ended = await read($, stepLog)

  // One receipt per typed turn (7.12): an engine turn that ends with its agents still running writes none; the first
  // that ends with none running writes the whole turn's. A report turn after it (an agent that had finished before
  // its report reached Claude) that answers takes the receipt: the receipt goes under the turn's last answer.
  const isWritten = (await read($, receipts)).some(r => r.turnNo === ended.turnNo)

  if (waiting === 0 && (!isWritten || answer !== '')) {
    // A turn that wrote no answer row has its receipt drawn under its last call's row: that call is kept with it.
    const last = answer === '' ? ended.steps.slice(Math.max(0, ended.segmentFrom - ended.dropped)).at(-1) : undefined
    const receipt = { ...receiptOf(ended), answer, ...(last === undefined ? {} : { lastCall: last.calls?.at(-1) ?? last.id }) }
    const had = (await read($, receipts)).find(r => r.turnNo === receipt.turnNo)

    // A later report turn's answer: the turn's receipt moves under it, the same receipt, its engine turn kept.
    if (had !== undefined) await update($, receipts, list => list.map(r => (r === had || r.turnNo === receipt.turnNo ? { ...receipt, turn: had.turn } : r)))
    else await update($, receipts, list => [...list.filter(r => r.turn !== receipt.turn), receipt].slice(-RECEIPTS_MAX))
    // Only what this receipt counted: an agent call that ended meanwhile goes to the next one.
    await updateLog($, log => clearAgentWork(log, ended.agentWork))
  }

  if (anyRunning(await read($, roster))) startTimers($, false)
  else stopTimers()

  await keepTurn($)
}

const DIFFS_MAX = 50 // files whose diff a turn keeps

/**
 * Keeps the typed turn in history (E.45): its log, its work, its agents, its receipts, its steps' details and each
 * file's diff over the turn. A history that cannot be kept costs the pane its pins, never the turn.
 * @param $ the engine interface
 */
async function keepTurn($: EngineInterface): Promise<void> {
  try {
    const log = await read($, stepLog)
    const work = await readWork($)
    const diffs = await Promise.all(work.files.slice(0, DIFFS_MAX).map(async f => fileDiff($, f.path, lastCwd)))

    const mine = (await read($, receipts)).filter(r => r.turnNo === log.turnNo)
    // The turn's narration, by row id, so a resumed transcript (no flow) leaves it hidden as the live one did.
    const turns = new Set([...mine.flatMap(r => (r.turn === null ? [] : [r.turn])), ...(log.turn === null ? [] : [log.turn])])
    const flow = await readFlow($)
    const narration = flow.flatMap((f, i) =>
      f.kind === 'text' && f.row !== undefined && f.turn !== null && turns.has(f.turn) && isNarrationAt(flow, i) ? [f.row] : []
    )
    await saveTurn($, { log, work, roster: await read($, roster), receipts: mine, details: await readDetails($), diffs, narration })
  } catch (error: unknown) {
    $.ui.log(`cockpit: turn ${String((await read($, stepLog)).turnNo)} not kept in history: ${String(error)}`, noticeSink())
  }
}

/**
 * Session start (a resume, a restart, a reload): history comes back from the store, and a pane that has no turn yet
 * shows the last kept one as it ended (`[ LAST ]`, its sections, its receipts).
 * @param $ the engine interface
 */
export async function logSessionStart($: EngineInterface): Promise<void> {
  if (!isOn()) return

  const records = await loadHistory($)
  const last = records.at(-1)

  if (last === undefined || (await read($, stepLog)).turnNo > 0) return

  await updateLog($, log => restoredLog(log, last))
  await update($, receipts, list => (list.length > 0 ? list : records.flatMap(r => r.receipts).slice(-RECEIPTS_MAX)))
  await update($, roster, list => (list.length > 0 ? list : last.roster))
  await restoreWork($, last)
  await restoreDetails($, last.details)
}

/**
 * Session start, after history: the highest turn number this session's prompts' stamps hold. A log that restored a
 * lower one (its history trimmed or lost from the store) carries on from it, so no number is ever used twice.
 * @param $ the engine interface
 * @param turnNo the highest number a stamp holds
 */
export async function seedTurnNo($: EngineInterface, turnNo: number): Promise<void> {
  if (!isOn()) return

  await updateLog($, log => (log.turnNo < turnNo && !log.isTurnRunning ? { ...log, turnNo } : log))
}

/**
 * An agent started (`agent.spawn`): its row appears in `[ AGENTS ]`.
 * @param $ the engine interface
 * @param start the agent, its launching call, its parent and its name
 */
export async function logAgentStart($: EngineInterface, start: Omit<AgentStart, 'at'>): Promise<void> {
  if (!isOn()) return

  const at = await $.clock.now()
  await update($, roster, list => addAgent(list, { ...start, at }))
  const known: LaunchedAgent = { id: start.id, call: start.call, name: start.name, ...(start.called === undefined ? {} : { called: [...start.called] }) }
  await update($, launched, list => [...list.filter(a => a.id !== start.id), known].slice(-LAUNCHED_MAX))
}

/**
 * Every agent this session launched (8.9), whatever the roster and history have dropped since.
 * @param $ the engine interface
 * @returns the agents, oldest first
 */
export async function readLaunched($: EngineInterface): Promise<LaunchedAgent[]> {
  return read($, launched)
}

/**
 * Whether the roster lists an agent.
 * @param $ the engine interface
 * @param id the agent's id
 * @returns whether it does
 */
async function isListed($: EngineInterface, id: string): Promise<boolean> {
  return (await read($, roster)).some(a => a.id === id)
}

/**
 * An agent's own call started (`tool.call` with its `agentId`): its row says what it does now.
 * @param $ the engine interface
 * @param id the agent's id
 * @param e the call
 * @param cwd the session's folder, for relative paths
 */
export async function logAgentStep($: EngineInterface, id: string, e: ToolCallInput, cwd: string | undefined): Promise<void> {
  // Only an agent the roster lists: a workflow's agents and the engine's own forks (compaction, memory) carry ids no
  // list names, and their work is not the turn's.
  if (!isOn() || !(await isListed($, id))) return

  const at = await $.clock.now()
  lastCwd = cwd ?? lastCwd
  // A file's diff is the whole turn's change: an agent's call reads it first too (amendment 8).
  await snapshotBefore($, e.tool, e, cwd)
  noteFetchStart(e.tool, e)
  await update($, roster, list => agentStep(list, id, e.tool, e, cwd, at, e.tool_use_id))
  await noteStart($, e.tool_use_id, e.tool, e, at, id)
}

/**
 * An agent's own call ended: its row in the agent's own log settles, its detail is kept, and its files and pages join
 * the turn's, marked as the agent's. Nothing reaches the main loop's steps.
 * @param $ the engine interface
 * @param id the agent's id
 * @param e the call
 * @param outcome what `next(e)` resolved to; undefined when it threw
 * @param cwd the session's folder, for paths from the project root
 */
export async function logAgentStepEnd($: EngineInterface, id: string, e: ToolCallInput, outcome: Outcome | undefined, cwd?: string): Promise<void> {
  if (!isOn() || !(await isListed($, id))) return

  const at = await $.clock.now()
  const ran = outcome ?? { isError: true as const, text: 'failed' }
  await noteEnd($, e.tool_use_id, e, ran, at)
  await update($, roster, list => agentStepEnd(list, id, { id: e.tool_use_id, tool: e.tool, input: e, at, outcome: ran }))
  await updateLog($, log => noteAgentWork(log, e.tool, e, ran, cwd))
  afterCall($, e.tool, noteWork($, e.tool, e, ran, cwd, true))
}

/**
 * An agent reported (`agent.report`): its row settles, and so does its launch in `[ STEPS ]` once every agent of
 * it has. The last background agent to end stops the clock of an idle pane.
 * @param $ the engine interface
 * @param end the agent and how it ended
 */
export async function logAgentEnd($: EngineInterface, end: Omit<AgentEnd, 'at'>): Promise<void> {
  if (!isOn()) return

  const at = await $.clock.now()
  const agent = (await read($, roster)).find(a => a.id === end.id)

  if (agent === undefined) return

  await update($, roster, list => endAgent(list, { ...end, at }))

  // The launch counts each agent once (`endLaunched` keeps which); a later report of a finished one counts nothing.
  if (agent.parent === null && agent.call.length > 0) {
    await updateLog($, log => endLaunched(log, agent.call, end.status !== 'completed', at))
  } else if (agent.parent !== null && agent.call.length > 0) {
    // A nested agent's launch is a row of its parent's own log.
    const parent = agent.parent
    await update($, roster, list => agentLaunchEnd(list, parent, agent.call, end.status !== 'completed', at))
  }

  const log = await read($, stepLog)

  if (!log.isTurnRunning && !anyRunning(await read($, roster))) stopTimers()
}

/**
 * The roster; read while drawing, so the drawing follows it.
 * @param $ the engine interface
 * @returns the agents, in launch order
 */
export async function readRoster($: EngineInterface): Promise<RosterAgent[]> {
  return read($, roster)
}

/**
 * Whether a main-loop turn runs now, and which; read while drawing, so the drawing follows the turn's end.
 * @param $ the engine interface
 * @returns the running turn's id, or undefined
 */
export async function runningTurn($: EngineInterface): Promise<string | undefined> {
  return (await read($, running)) ?? undefined
}

/**
 * The turn's log; read while drawing, so the drawing follows it.
 * @param $ the engine interface
 * @returns the log
 */
export async function readLog($: EngineInterface): Promise<StepLog> {
  return read($, stepLog)
}

/**
 * The finished turns' receipts.
 * @param $ the engine interface
 * @returns the receipts, oldest first
 */
export async function readReceipts($: EngineInterface): Promise<Receipt[]> {
  return read($, receipts)
}

// The typed turns a rewind took out of the conversation, by number (7.1): their answer rows are gone. Found while
// the pane draws idle, at most every REWIND_CHECK_MS, since no event says a rewind happened.
// shortcut: kept in the module, so a reload forgets them; the receipts and history they left stay left.
const rewound = new Set<number>()
let rewindCheckedAt = Number.NEGATIVE_INFINITY
const REWIND_CHECK_MS = 1_500
const REWIND_DEPTH = 5

/**
 * Whether a row has left the main conversation: `$.session.messages` reads on from no row that was rewound.
 * @param $ the engine interface
 * @param row the row's id
 * @returns whether it has
 */
async function isGone($: EngineInterface, row: string): Promise<boolean> {
  return !Array.isArray(await $.session.messages({ after: row }))
}

/**
 * The typed turns a rewind took out, newest first until one still in the conversation: they leave the receipts and
 * history, and the pane shows the last turn that remains.
 * @param $ the engine interface
 * @returns the rewound turns' numbers
 */
export async function noteRewind($: EngineInterface, isForced: boolean = false): Promise<ReadonlySet<number>> {
  // The wall clock, not the engine's: a throttle, not a time anything is drawn with.
  const now = Date.now()

  if (!isForced && now - rewindCheckedAt < REWIND_CHECK_MS) return rewound
  rewindCheckedAt = now
  // A turn the conversation compacted away has no rows left to read after, and was not rewound.
  const list = (await read($, receipts)).filter(r => r.isCompacted !== true)
  // The newest few turns, read together; a rewind further back is found 5 turns at a time, at the checks after.
  const turnNos = [...new Set(list.map(r => r.turnNo))]
    .filter(n => !rewound.has(n))
    .toSorted((a, b) => b - a)
    .slice(0, REWIND_DEPTH)
  let gone: number[] = []

  try {
    // A turn's last answer row stands for it; a turn that wrote none cannot be told apart, and ends the run.
    const answers = turnNos.map(n => list.findLast(r => r.turnNo === n && r.answer !== '')?.answer)
    const isGoneEach = await Promise.all(answers.map(async a => (a === undefined ? false : isGone($, a))))
    const stays = isGoneEach.indexOf(false)

    gone = turnNos.slice(0, stays < 0 ? turnNos.length : stays)
  } catch (error: unknown) {
    // The engine would not read the conversation: no rewind is told this time, and the pane draws as it was.
    $.ui.log(`cockpit: rewind not checked: ${String(error)}`, { to: 'debug' })

    return rewound
  }
  if (gone.length === 0) return rewound

  for (const n of gone) rewound.add(n)
  $.ui.log(`cockpit: turns ${gone.join(', ')} rewound out of the conversation`, { to: 'debug' })
  // A draw reads state and never writes it: the rewound turns leave the receipts and history just after it.
  $.clock.after(0, () => void redrawRewound($).catch((error: unknown) => $.ui.log(`cockpit: rewound turns not dropped: ${String(error)}`, { to: 'debug' })))

  return rewound
}

/**
 * The main conversation compacted (7.1): the turns before it keep their place in Cockpit, though their rows have left
 * the conversation for the summary, so the rewind check never takes them for rewound.
 * @param $ the engine interface
 */
export async function logCompacted($: EngineInterface): Promise<void> {
  if (!isOn()) return

  await update($, receipts, list => list.map(compacted))
  await markCompacted($)
}

/**
 * Just after the draw that found a rewind: the rewound turns leave, and every site draws again without them.
 * @param $ the engine interface
 */
async function redrawRewound($: EngineInterface): Promise<void> {
  await applyRewind($)
  $.ui.invalidate('ui.render')
}

/**
 * The rewound turns leave the receipts and history; the next typed turn takes the number after the last that remains.
 * @param $ the engine interface
 */
export async function applyRewind($: EngineInterface): Promise<void> {
  if (rewound.size === 0) return

  await update($, receipts, l => l.filter(r => !rewound.has(r.turnNo)))
  await dropTurns($, [...rewound])
}

/** The last turn a rewind left: the number the next typed turn follows, or the log's own when no rewind took it. */
const lastRemaining = (log: StepLog): number => {
  if (!rewound.has(log.turnNo)) return log.turnNo

  let n = log.turnNo

  while (n > 0 && rewound.has(n)) n--

  return n
}

/**
 * The spinner frame's counter; read while drawing, so the live row draws again each frame.
 * @param $ the engine interface
 * @returns the counter
 */
export async function readFrame($: EngineInterface): Promise<number> {
  return read($, frame)
}

/**
 * The seconds' counter; read while drawing, so the pane draws again each second.
 * @param $ the engine interface
 * @returns the counter
 */
export async function readSecond($: EngineInterface): Promise<number> {
  return read($, second)
}
