// What the focused pane shows and what its keys do (spec E.44): the fitted layout, the full step view (`s`), a step's
// detail or a diff (Enter on a row), the sections shown whole (`a` `t` `f` `u`), copying a row (`c`) and going back
// (`b`). Keys are hotkey Buttons the pane draws only while it holds the keyboard, so none can take a key from the
// prompt; the engine keeps Tab, the arrows, Enter and Escape (phase 7 probe). Escape gives the keyboard back, and an
// unfocused pane is always the fitted layout.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { LogStep, StepDetail, TurnRecord } from '../../../types'
import type { Section } from '../fit'
import { readLog, readRoster } from '../log'
import { fileDiff } from '../history/snapshots'
import { readHistory, readPin, setPin } from '../history/store'
import { cwdNow, readWork } from '../work'
import { readDetails } from './details'

/**
 * What the pane shows: the fitted layout, every step, one step's detail, a diff, or the fitted layout listing an
 * agent's own steps where the engine would not put its conversation in view (`note` says why).
 */
export type View =
  | { kind: 'fit' }
  | { kind: 'all' }
  | { kind: 'step'; id: string }
  | { kind: 'diff'; path: string; patch: string[]; note?: string }
  | { kind: 'agent'; id: string; note: string }

/** The note under `[ STEPS · AGENT name ]` while the engine shows the agent's conversation (probe 1: Esc at the prompt goes back). */
export const AGENT_NOTE = 'agent in view · enter on its row, or esc at the prompt, for main'

const FIT: View = { kind: 'fit' }
const EDIT_KINDS = new Set(['edit', 'write', 'notebook'])
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const COPIED_MS = 2_000 // how long `copied` shows

// Bumped when the view changes, so the pane, which reads it, draws again.
const tick = atom({ plugin: 'ghostframe', key: 'viewTick' } as const, 0, { shape: 'viewTick-1' })

// shortcut: the view lives in the module; a reload forgets it and the pane draws the fitted layout, as after Escape.
let view: View = FIT
const whole = new Set<Section>()
/** The element under the focus ring (`ui.focus`): what `c` copies in the fitted and full views. */
let ring: string | undefined
/** What the last `c` said, and when. */
let copied: { note: string; at: number } | undefined
/** The agent whose conversation the engine shows now (the Pane's `view` prop at its last draw), undefined for main. */
let viewed: string | undefined

/**
 * The Pane drew: which agent's conversation the engine has in view, so Enter on that agent's row goes back.
 * @param agentId the `view` prop's agent, undefined for the main conversation
 */
export function noteViewed(agentId: string | undefined): void {
  viewed = agentId
}

/**
 * The view to draw. The pane that lost the keyboard (Escape, a click on the prompt) goes back to the fitted layout,
 * every section fitted again.
 * @param isFocused whether the pane holds the keyboard now
 * @returns the view
 */
export function viewNow(isFocused: boolean): View {
  if (!isFocused) {
    view = FIT
    whole.clear()
    ring = undefined
  }

  return view
}

/** The sections shown whole. */
export const wholeNow = (): ReadonlySet<Section> => whole

/**
 * What the last `c` said, while it still shows.
 * @param now the wall clock in ms
 * @returns `copied` or `nothing to copy`, or undefined
 */
export const copiedNote = (now: number): string | undefined => (copied !== undefined && now - copied.at < COPIED_MS ? copied.note : undefined)

/** Whether a `c` was pressed and its note may still show: the pane then needs the clock to know. */
export const hasCopied = (): boolean => copied !== undefined

/**
 * The focus ring moved (`ui.focus`): `c` copies what it is on.
 * @param element the element's key, absent for one of the engine's own stops
 */
export function noteRing(element: string | undefined): void {
  ring = element
}

/**
 * The view's counter; read while drawing, so the pane draws again when the view changes.
 * @param $ the engine interface
 * @returns the counter
 */
export async function readViewTick($: EngineInterface): Promise<number> {
  return read($, tick)
}

/**
 * Draws the pane again.
 * @param $ the engine interface
 */
async function redraw($: EngineInterface): Promise<void> {
  await update($, tick, n => n + 1)
}

/** The turn pinned in place of the live one, as history keeps it. */
async function pinnedRecord($: EngineInterface): Promise<TurnRecord | undefined> {
  const pin = await readPin($)

  return pin === null ? undefined : (await readHistory($)).find(r => r.turnNo === pin)
}

/** The Edit and Write patches the turn kept for a file, in order. */
async function editPatches($: EngineInterface, path: string): Promise<string[]> {
  const kept = (await readDetails($)).filter(
    d => EDIT_TOOLS.has(d.tool) && (d.command.replaceAll('\\', '/') === path || d.command.replaceAll('\\', '/').endsWith(`/${path}`))
  )

  return kept.flatMap(d => d.patch)
}

/**
 * What a FILES row counts that a patch does not hold, said under it with why there is no fuller diff.
 * @param patch the patch shown
 * @param row the row's counts
 * @param why why there is no snapshot
 * @returns the note
 */
function missing(patch: readonly string[], row: { adds: number; dels: number } | undefined, why: string): string {
  const plus = (row?.adds ?? 0) - patch.filter(l => l.startsWith('+')).length
  const minus = (row?.dels ?? 0) - patch.filter(l => l.startsWith('-')).length
  const parts = [...(plus > 0 ? [`+${plus}`] : []), ...(minus > 0 ? [`−${minus}`] : [])]

  return parts.length === 0 ? why : `… ${parts.join(' ')} more from shell commands · ${why}`
}

/**
 * A file's diff over its turn (E.42, phase 8): for a pinned turn, the one its history kept; live, its content at the
 * turn's start against now (a shell's changes included); with no snapshot, the Edit and Write patches the turn kept,
 * and why there is no more.
 * @param $ the engine interface
 * @param path the file, as the pane names it
 * @returns its rows, and what they leave out
 */
async function fileView($: EngineInterface, path: string): Promise<{ patch: string[]; note?: string }> {
  const pinned = await pinnedRecord($)

  if (pinned !== undefined) {
    const kept = pinned.diffs.find(d => d.path === path)

    if (kept !== undefined) return kept.note === undefined ? { patch: kept.patch } : { patch: kept.patch, note: kept.note }

    return { patch: [], note: pinned.isTrimmed ? 'diff no longer kept · trimmed to keep history under the store budget' : 'no diff kept for this file' }
  }

  const diff = await fileDiff($, path, cwdNow())

  if (diff.patch.length > 0 || diff.note === undefined) return { patch: diff.patch }

  const patch = await editPatches($, path)
  const row = (await readWork($)).files.find(f => f.path === path)

  return { patch, note: missing(patch, row, diff.note) }
}

/** A step of the current log, of the earlier turn it shows, of the pinned turn, or of an agent's own log. */
async function stepOf($: EngineInterface, id: string): Promise<LogStep | undefined> {
  const log = await readLog($)
  const pinned = await pinnedRecord($)
  const agents = (await readRoster($)).flatMap(a => a.log ?? [])

  return [...log.steps, ...(log.prev?.steps ?? []), ...(pinned?.steps ?? []), ...agents].find(s => s.id === id)
}

/** A step's detail, from the session's or, for a pinned turn, from its history. */
async function detailOf($: EngineInterface, id: string): Promise<StepDetail | undefined> {
  return (await readDetails($)).find(d => d.id === id) ?? (await pinnedRecord($))?.details.find(d => d.id === id)
}

/**
 * Enter on an agent's row (A1): the engine puts its conversation in view (`$.ui.view`, only as the answer to the
 * person's own press), and the pane lists its steps; on the agent in view, back to the main conversation. Where the
 * engine refuses (an agent it no longer holds: finished a while ago, or before a resume), the pane still lists the
 * agent's kept steps and says why; Enter again or `b` goes back.
 * @param $ the engine interface
 * @param agentId the agent's id
 */
async function openAgent($: EngineInterface, agentId: string): Promise<void> {
  if (view.kind === 'agent' && view.id === agentId) {
    view = FIT

    return
  }

  const isBack = viewed === agentId
  const { deny } = await $.ui.view(isBack ? {} : { agentId })

  if (deny === undefined) view = FIT
  else if (isBack) await say($, deny)
  else view = { kind: 'agent', id: agentId, note: `conversation not held · ${deny} · b: back` }
}

/**
 * Enter on a row: a step opens its detail, an edit step or a FILES row its diff, an agent its conversation.
 * @param $ the engine interface
 * @param id the row's id (`step:<call id>`, `file:<path>`, `agent:<id>`)
 */
export async function openRow($: EngineInterface, id: string): Promise<void> {
  if (id.startsWith('agent:')) {
    await openAgent($, id.slice('agent:'.length))
  } else if (id.startsWith('file:')) {
    const path = id.slice('file:'.length)
    view = { kind: 'diff', path, ...(await fileView($, path)) }
  } else if (id.startsWith('step:')) {
    const stepId = id.slice('step:'.length)
    const step = await stepOf($, stepId)
    const detail = await detailOf($, stepId)

    view =
      step !== undefined && EDIT_KINDS.has(step.kind) && (detail?.patch.length ?? 0) > 0
        ? { kind: 'diff', path: step.subject, patch: detail?.patch ?? [] }
        : { kind: 'step', id: stepId }
  }

  await redraw($)
}

/**
 * What `c` copies: in a diff its patch; in a step's detail its command; else the row under the ring (a step's
 * command, or an edit's patch; a file's patch).
 * @param $ the engine interface
 * @returns the text, or undefined when there is nothing to copy
 */
async function copyText($: EngineInterface): Promise<string | undefined> {
  if (view.kind === 'diff') return view.patch.length > 0 ? view.patch.join('\n') : undefined

  const at = view.kind === 'step' ? `step:${view.id}` : ring

  if (at?.startsWith('file:') === true) {
    const { patch } = await fileView($, at.slice('file:'.length))

    return patch.length > 0 ? patch.join('\n') : undefined
  }

  if (at?.startsWith('step:') !== true) return undefined

  const detail = await detailOf($, at.slice('step:'.length))

  if (detail === undefined) return undefined

  return view.kind !== 'step' && EDIT_TOOLS.has(detail.tool) && detail.patch.length > 0 ? detail.patch.join('\n') : detail.command
}

/**
 * Copies with `$.ui.copy` and shows `copied` (or `nothing to copy`) in the hint row for two seconds.
 * @param $ the engine interface
 */
async function copyNow($: EngineInterface): Promise<void> {
  const text = await copyText($)
  const isCopied = text !== undefined && (await $.ui.copy({ text })).isCopied
  await say($, isCopied ? 'copied' : 'nothing to copy')
}

/**
 * A brief dim note in the hint row (`copied`, `no earlier turn kept`), for two seconds.
 * @param $ the engine interface
 * @param note the note
 */
async function say($: EngineInterface, note: string): Promise<void> {
  copied = { note, at: await $.clock.now() }
  $.clock.after(COPIED_MS, () => void redraw($))
}

/**
 * `/steps <n>` (E.45): pins turn n, when history keeps it; `/steps` alone, or the live turn's own number, releases the
 * pin. A turn history does not keep is said, with where to look instead.
 * @param $ the engine interface
 * @param args what followed the command
 * @returns what the command answers
 */
export async function pinFromCommand($: EngineInterface, args: string): Promise<string> {
  const live = (await readLog($)).turnNo
  const word = args.trim()

  if (word.length === 0) {
    await setPin($, null, live)
    await redraw($)

    return 'live · the pane follows the current turn'
  }

  const n = Number(word)

  if (!Number.isInteger(n) || n < 1) return `/steps takes a turn number, 1 to ${live}`
  if (n === live) {
    await setPin($, null, live)
    await redraw($)

    return `turn ${n} is the live turn · the pane follows it`
  }

  if (!(await readHistory($)).some(r => r.turnNo === n)) return `no step log for turn ${n} · ctrl+o shows what the session still has`

  await setPin($, n, live)
  view = FIT
  await redraw($)

  return `pinned turn ${n} · l in the pane or /steps for live`
}

/**
 * `p` and `n` (E.45): pins the kept turn before, or after, the one shown; past the newest kept turn, back to live
 * (pinning the live turn is releasing). `p` with no earlier turn kept says so.
 * @param $ the engine interface
 * @param step -1 for `p`, 1 for `n`
 */
async function stepPin($: EngineInterface, step: -1 | 1): Promise<void> {
  const live = (await readLog($)).turnNo
  const pin = await readPin($)
  const at = pin ?? live
  const kept = (await readHistory($)).map(r => r.turnNo)
  const target = step < 0 ? kept.findLast(n => n < at) : kept.find(n => n > at)

  if (step < 0 && target === undefined) {
    await say($, 'no earlier turn kept')

    return
  }

  if (step > 0 && pin === null) return

  await setPin($, target ?? null, live)
  view = FIT
}

const SECTION_KEYS: Readonly<Record<string, Section>> = { a: 'agents', t: 'todo', f: 'files', u: 'sources' }

/**
 * A key of the focused pane, pressed: `s` the full step view (again to fit), `a` `t` `f` `u` a section shown whole
 * (again to fit), `c` copy, `b` back to the fitted layout, `p` `n` a kept turn before or after (E.45), `l` live.
 * @param $ the engine interface
 * @param key the hotkey
 */
export async function pressKey($: EngineInterface, key: string): Promise<void> {
  const section = SECTION_KEYS[key]

  if (key === 'p') await stepPin($, -1)
  else if (key === 'n') await stepPin($, 1)
  else if (key === 'l') {
    await setPin($, null, 0)
    view = FIT
  } else if (key === 's') view = view.kind === 'all' ? FIT : { kind: 'all' }
  else if (key === 'b') view = FIT
  else if (key === 'c') await copyNow($)
  else if (section !== undefined) {
    if (whole.has(section)) whole.delete(section)
    else whole.add(section)

    view = FIT
  }

  await redraw($)
}
