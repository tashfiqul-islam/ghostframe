// What the focused pane shows and what its keys do (spec E.44): the fitted layout, the full step view (`s`), a step's
// detail or a diff (Enter on a row), the sections shown whole (`a` `t` `f` `u`), copying a row (`c`) and going back
// (`b`). Keys are hotkey Buttons the pane draws only while it holds the keyboard, so none can take a key from the
// prompt; the engine keeps Tab, the arrows, Enter and Escape (phase 7 probe). Escape gives the keyboard back, and an
// unfocused pane is always the fitted layout.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { LogStep } from '../../../types'
import type { Section } from '../fit'
import { readLog } from '../log'
import { readWork, workDiff } from '../work'
import { readDetails } from './details'

/** What the pane shows: the fitted layout, every step, one step's detail, or a diff. */
export type View = { kind: 'fit' } | { kind: 'all' } | { kind: 'step'; id: string } | { kind: 'diff'; path: string; patch: string[]; note?: string }

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

/**
 * The patch of a file the turn changed: its edits' and writes' patches, in order; else Git's diff of it.
 * @param $ the engine interface
 * @param path the file, from the session's folder
 * @returns its unified rows
 */
async function filePatch($: EngineInterface, path: string): Promise<string[]> {
  const kept = (await readDetails($)).filter(
    d => EDIT_TOOLS.has(d.tool) && (d.command.replaceAll('\\', '/') === path || d.command.replaceAll('\\', '/').endsWith(`/${path}`))
  )
  const patch = kept.flatMap(d => d.patch)

  return patch.length > 0 ? patch : workDiff($, path)
}

/**
 * What a FILES row counts that its patch does not hold: the lines a shell command changed, of which no patch is
 * kept (`printf >> f`). Said under the diff, so the view never shows less than the row without saying so.
 * @param patch the patch shown
 * @param adds the row's added lines
 * @param dels the row's removed lines
 * @returns the note, or nothing when the patch holds them all
 */
function missing(patch: readonly string[], adds: number, dels: number): { note?: string } {
  const plus = adds - patch.filter(l => l.startsWith('+')).length
  const minus = dels - patch.filter(l => l.startsWith('-')).length
  const parts = [...(plus > 0 ? [`+${plus}`] : []), ...(minus > 0 ? [`−${minus}`] : [])]

  return parts.length === 0 ? {} : { note: `… ${parts.join(' ')} more from shell commands, in no kept patch` }
}

/** A step of the current log, or of the earlier turn it shows. */
async function stepOf($: EngineInterface, id: string): Promise<LogStep | undefined> {
  const log = await readLog($)

  return [...log.steps, ...(log.prev?.steps ?? [])].find(s => s.id === id)
}

/**
 * Enter on a row: a step opens its detail, an edit step or a FILES row its diff.
 * @param $ the engine interface
 * @param id the row's id (`step:<call id>`, `file:<path>`)
 */
export async function openRow($: EngineInterface, id: string): Promise<void> {
  if (id.startsWith('file:')) {
    const path = id.slice('file:'.length)
    const patch = await filePatch($, path)
    const row = (await readWork($)).files.find(f => f.path === path)
    view = { kind: 'diff', path, patch, ...(row === undefined ? {} : missing(patch, row.adds, row.dels)) }
  } else if (id.startsWith('step:')) {
    const stepId = id.slice('step:'.length)
    const step = await stepOf($, stepId)
    const detail = (await readDetails($)).find(d => d.id === stepId)

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

  const details = await readDetails($)
  const at = view.kind === 'step' ? `step:${view.id}` : ring

  if (at?.startsWith('file:') === true) {
    const patch = await filePatch($, at.slice('file:'.length))

    return patch.length > 0 ? patch.join('\n') : undefined
  }

  if (at?.startsWith('step:') !== true) return undefined

  const detail = details.find(d => d.id === at.slice('step:'.length))

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
  copied = { note: isCopied ? 'copied' : 'nothing to copy', at: await $.clock.now() }
  $.clock.after(COPIED_MS, () => void redraw($))
}

const SECTION_KEYS: Readonly<Record<string, Section>> = { a: 'agents', t: 'todo', f: 'files', u: 'sources' }

/**
 * A key of the focused pane, pressed: `s` the full step view (again to fit), `a` `t` `f` `u` a section shown whole
 * (again to fit), `c` copy, `b` back to the fitted layout.
 * @param $ the engine interface
 * @param key the hotkey
 */
export async function pressKey($: EngineInterface, key: string): Promise<void> {
  const section = SECTION_KEYS[key]

  if (key === 's') view = view.kind === 'all' ? FIT : { kind: 'all' }
  else if (key === 'b') view = FIT
  else if (key === 'c') await copyNow($)
  else if (section !== undefined) {
    if (whole.has(section)) whole.delete(section)
    else whole.add(section)

    view = FIT
  }

  await redraw($)
}
