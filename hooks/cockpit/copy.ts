// What Cockpit prints and copies of a turn (spec E.4, E.24, G.34, G.78): `/steps n all` prints the ctrl+o rows of one
// turn into the transcript, and `/copy` gains `code n`, `link n`, `steps n`, `turn n` and `diff <path>` beside the
// engine's own `/copy` (the last answer), each through `$.ui.copy`, each answered with one notice. Nothing on screen
// changes. Wrong n or path: one notice saying what exists.
import { isFailedMark, isShipMark } from './steps/log'
import type { EngineInterface } from 'claude-code'

import type { FileDiff, LogStep } from '../../types'
import { readFlow, isNarrationAt } from '../shared/flow'
import { diffCard } from '../shared/look/code'
import { clockTime } from '../shared/look/format'
import { rowText, textCells } from '../shared/look/spine'
import type { Part } from '../shared/parts'
import { readHistory } from './history/store'
import { turnView } from './fallback/facts'
import { readLog, readReceipts } from './log'
import { sentenceRows } from './v8/events'
import { stepLineRow } from './v8/left'
import type { StepLine } from './v8/left'

/** A message of the session, as `$.session.messages` gives it with `last`: its role, text and id. */
type Message = { role: 'user' | 'assistant'; text: string; uuid?: string | undefined; toolResults?: readonly unknown[] | undefined }

/** The session's newest messages, or none where the engine refuses the read. */
async function messages($: EngineInterface): Promise<Message[]> {
  const got = await $.session.messages({ last: 4096 })

  return 'deny' in got ? [] : [...got]
}

const firstKey = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 100)

/** The engine turns of a typed turn, live or kept. */
async function turnsOf($: EngineInterface, turnNo: number): Promise<string[]> {
  const log = await readLog($)
  const kept = (await readHistory($)).find(r => r.turnNo === turnNo)?.turns ?? []
  const own = (await readReceipts($)).filter(r => r.turnNo === turnNo).flatMap(r => (r.turn === null ? [] : [r.turn]))
  const live = log.turnNo === turnNo && log.turn !== null ? [log.turn] : []

  return [...new Set([...kept, ...own, ...live])]
}

/** The turns Cockpit can say anything of: the live one and every one history keeps, in order. */
async function knownTurns($: EngineInterface): Promise<number[]> {
  const live = (await readLog($)).turnNo

  return [...new Set([...(await readHistory($)).map(r => r.turnNo), ...(live > 0 ? [live] : [])])].toSorted((a, b) => a - b)
}

const span = (ns: readonly number[]) => (ns.length === 0 ? 'none' : ns.length === 1 ? `turn ${ns[0]}` : `turns ${ns[0]} to ${ns.at(-1)}`)

/**
 * The ctrl+o rows of one typed turn (E.4): each sentence Claude said while working, each step under it with its diff
 * or output in a frame. An output here is the excerpt history kept, with what it left out said under it. A turn from
 * before a resume has no flow left to place them by: its kept steps, in order, without the sentences.
 * @param $ the engine interface
 * @param turnNo the typed turn
 * @param width the frame
 * @returns the rows, none when Cockpit kept nothing of the turn
 */
export async function turnRows($: EngineInterface, turnNo: number, width: number): Promise<Part[][]> {
  const turns = await turnsOf($, turnNo)
  const first = turns[0]
  const view = first === undefined ? undefined : await turnView($, first)

  if (view === undefined) return []

  const flow = await readFlow($)
  const said = await messages($)
  const mine = new Set(turns)
  const seen = new Set<string>()
  const stepRows = (step: (typeof view.steps)[number]): Part[][] => {
    const detail = view.details.find(d => d.id === step.id)

    return [
      stepLineRow(stepLineOf(step, detail?.ms ?? undefined), width),
      ...(detail !== undefined && detail.patch.length > 0 ? diffCard(detail.patch, step.subject, width) : [])
    ]
  }
  if (!flow.some(f => f.turn !== null && mine.has(f.turn))) return view.steps.flatMap(stepRows)

  return flow.flatMap((f, i): Part[][] => {
    if (f.turn === null || !mine.has(f.turn)) return []

    if (f.kind === 'text') {
      if (!isNarrationAt(flow, i)) return []

      const text = said.findLast(m => m.role === 'assistant' && firstKey(m.text).includes(f.key.slice(0, 60)))?.text ?? f.key
      const next = flow.slice(i + 1).find(g => g.turn === f.turn && g.kind === 'tool')

      const at = next === undefined ? undefined : view.startOf(next.key)

      return sentenceRows(at === undefined || view.startedAt === null ? '' : clockTime(view.startedAt + at), text.trim(), width)
    }

    const step = view.steps.find(s => s.id === f.key || s.calls?.includes(f.key) === true)

    if (step === undefined || seen.has(step.id)) return []

    seen.add(step.id)

    return stepRows(step)
  })
}

/** The text column a command's output is printed in (6.1), for the terminal it ran in. */
export const frameWidth = (columns: number): number => textCells(columns, false)

/**
 * `/steps n all` (7.15): the turn's step rows (kind, subject, result, own time) as the command's output, at most 20,
 * then how many more. Step rows only: a diff is the pane's, not the list's.
 * @param $ the engine interface
 * @param turnNo the typed turn
 * @param columns the terminal's columns
 * @returns the output text
 */
export async function stepsAllText($: EngineInterface, turnNo: number, columns: number): Promise<string> {
  const lines = await stepsAllLines($, turnNo)
  const known = await knownTurns($)
  const width = frameWidth(columns)

  if (lines !== undefined && lines.total > 0) {
    const more = lines.total - lines.shown.length

    return [...lines.shown.map(l => rowText(stepLineRow(l, width)).trimEnd()), ...(more > 0 ? [`… ${more} more`] : [])].join('\n')
  }

  // A kept turn with nothing to print had no steps; only a turn Cockpit does not keep has no step log.
  return known.includes(turnNo) ? `turn ${turnNo} had no steps` : `no step log for turn ${turnNo} · kept: ${span(known)}`
}

/** The fenced code blocks of a Markdown text, each without the indent it was nested at. */
export function codeBlocks(text: string): string[] {
  const out: string[] = []
  const fence = /^([ \t]*)(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*$/gm

  for (const m of text.matchAll(fence)) {
    const lines = (m[3] ?? '').split('\n')
    const indent = Math.min(...lines.filter(l => l.trim().length > 0).map(l => /^[ \t]*/.exec(l)?.[0].length ?? 0))

    out.push(lines.map(l => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n'))
  }

  return out
}

/** Each fenced code block's language word, in order, '' for a fence that names none (7.15: · yaml). */
function fenceWords(text: string): string[] {
  return Array.from(text.matchAll(/^[ \t]*(?:`{3,}|~{3,})([^\s`]*)[^\n]*\n[\s\S]*?\n[ \t]*(?:`{3,}|~{3,})[ \t]*$/gm), m => (m[1] ?? '').toLowerCase())
}

/** The links of a Markdown text, whole, in the order they first appear: `[text](url)` and bare URLs. */
export function linksOf(text: string): string[] {
  const out: string[] = []
  const link = /\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|<?(https?:\/\/[^\s<>)\]]+)/g

  for (const m of text.matchAll(link)) {
    const url = (m[1] ?? m[2] ?? '').replace(/[.,;:!?'"]+$/, '')

    if (url.length > 0 && !out.includes(url)) out.push(url)
  }

  return out
}

/** The answer of the last turn that wrote one: the row its receipt names, else the newest text Claude wrote. */
async function lastAnswer($: EngineInterface): Promise<string | undefined> {
  const said = await messages($)
  const row = (await readReceipts($)).findLast(r => r.answer !== '')?.answer
  const named = row === undefined ? undefined : said.find(m => m.uuid === row)

  return (named ?? said.findLast(m => m.role === 'assistant' && m.text.trim().length > 0))?.text
}

/** Whether a user message is one the person typed: text of its own, no tool results, no notice wrapped in a tag. */
const isTyped = (m: Message) => m.role === 'user' && m.text.trim().length > 0 && (m.toolResults?.length ?? 0) === 0 && !m.text.trimStart().startsWith('<')

/**
 * A typed turn's prompt and answer: the answer row its last receipt names, and the nearest message the person typed
 * above it.
 * shortcut: a turn whose receipts name no answer row has none to find its prompt by; it says so.
 */
async function turnText($: EngineInterface, turnNo: number): Promise<string | undefined> {
  const said = await messages($)
  const row = (await readReceipts($)).findLast(r => r.turnNo === turnNo && r.answer !== '')?.answer
  const at = row === undefined ? -1 : said.findIndex(m => m.uuid === row)

  if (at < 0) return undefined

  const prompt = said.slice(0, at).findLast(isTyped)?.text
  const answer = said[at]?.text ?? ''

  return [...(prompt === undefined ? [] : [`> ${prompt.trim().replace(/\n/g, '\n> ')}`]), answer.trim()].join('\n\n')
}

/** A file's diff over the newest kept turn that changed it, matched by its path or the end of it. */
async function diffOf($: EngineInterface, path: string): Promise<{ diff: FileDiff | undefined; known: string[] }> {
  const records = (await readHistory($)).toReversed()
  const matches = (d: FileDiff) => d.path === path || d.path.endsWith(`/${path}`) || path.endsWith(`/${d.path}`)
  const diff = records.flatMap(r => r.diffs).find(matches)

  return { diff, known: [...new Set(records.flatMap(r => r.diffs.filter(d => d.patch.length > 0).map(d => d.path)))] }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * One `/copy` form Cockpit adds; undefined for anything else, which the engine's `/copy` answers.
 * @param $ the engine interface
 * @param args what followed `/copy`
 * @param columns the terminal's columns
 * @returns the notice, or undefined
 */
export async function copyFromCommand($: EngineInterface, args: string, columns: number): Promise<string | undefined> {
  const [form = '', ...rest] = args.trim().split(/\s+/)
  const arg = rest.join(' ')
  const n = Number(arg)
  const isN = Number.isInteger(n) && n >= 1
  const copy = async (text: string, said: string) => {
    const done = await $.ui.copy({ text })

    return done.isCopied ? `Copied ${said}` : `Not copied · ${done.reason}`
  }

  if (form === 'code' || form === 'link') {
    const answer = await lastAnswer($)
    const all = answer === undefined ? [] : form === 'code' ? codeBlocks(answer) : linksOf(answer)
    const what = form === 'code' ? 'code block' : 'link'
    // A wrong number always says what exists (7.15).
    const has = all.length === 0 ? `the last answer has no ${what}s` : `the last answer has ${all.length}`
    const hit = isN ? all[n - 1] : undefined

    if (hit === undefined) return `There is no ${what} ${arg.length > 0 ? arg : 'given'} · ${has}`

    const lang = form === 'code' ? (fenceWords(answer ?? '')[n - 1] ?? '') : ''

    return copy(
      hit,
      form === 'code' ? [`code block ${n}`, plural(hit.split('\n').length, 'line'), ...(lang.length > 0 ? [lang] : [])].join(' · ') : `link ${n} · ${hit}`
    )
  }

  if (form === 'steps' || form === 'turn') {
    const known = await knownTurns($)

    if (!isN || !known.includes(n)) return `no ${form === 'steps' ? 'step log' : 'turn'} ${arg.length > 0 ? arg : 'given'} · kept: ${span(known)}`

    if (form === 'steps') {
      const rows = await turnRows($, n, frameWidth(columns))

      return rows.length > 0
        ? copy(rows.map(r => rowText(r).trimEnd()).join('\n'), `the steps of turn ${n} · ${plural(rows.length, 'row')}`)
        : `turn ${n} had no steps`
    }

    const text = await turnText($, n)

    return text === undefined ? `turn ${n} kept no answer to copy` : copy(text, `turn ${n} · prompt and answer`)
  }

  if (form === 'diff') {
    const { diff, known } = await diffOf($, arg)

    if (diff === undefined || diff.patch.length === 0) {
      const list =
        known.length === 0 ? 'no file diffs kept' : `diffs kept for ${known.slice(0, 5).join(', ')}${known.length > 5 ? ` +${known.length - 5}` : ''}`

      return `no diff for ${arg.length > 0 ? arg : 'a path'}${diff?.note === undefined ? '' : ` · ${diff.note}`} · ${list}`
    }

    const adds = diff.patch.filter(l => l.startsWith('+')).length
    const dels = diff.patch.filter(l => l.startsWith('-')).length

    return copy(diff.patch.join('\n'), `the diff of ${diff.path} · +${adds} −${dels}`)
  }

  return undefined
}

/**
 * A step as the left prints it (screens 22, 30, ctrl+o): its kind, subject, result and its own time; the result err
 * for a failure, bright for what shipped (a hash), ok for a pass (5.7).
 * @param step the step
 * @param ms its own time, when its detail kept it
 * @returns the line
 */
export function stepLineOf(step: LogStep, ms: number | undefined): StepLine {
  const tone: StepLine['tone'] = isFailedMark(step) ? 'err' : isShipMark(step) ? 'bright' : /\bpass\b/.test(step.result) ? 'ok' : 'dim'

  return { kind: step.kind, subject: step.subject, result: step.result, tone, ms }
}

/** The most step rows `/steps n all` prints before it says how many more there are (7.15). */
const STEPS_SHOWN = 20

/**
 * `/steps n all` (7.15, screen 22): its turn's step rows, at most 20, and how many it had.
 * @param $ the engine interface
 * @param turnNo the typed turn
 * @returns the rows and the total, or undefined when Cockpit keeps nothing of the turn
 */
export async function stepsAllLines($: EngineInterface, turnNo: number): Promise<{ shown: StepLine[]; total: number } | undefined> {
  const first = (await turnsOf($, turnNo))[0]
  const view = first === undefined ? undefined : await turnView($, first)

  if (view === undefined) return undefined

  const lines = view.steps.map(s => stepLineOf(s, view.details.find(d => d.id === s.id)?.ms ?? undefined))

  return { shown: lines.slice(0, STEPS_SHOWN), total: lines.length }
}
