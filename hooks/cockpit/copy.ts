// What Cockpit prints and copies of a turn (spec E.4, E.24, G.34, G.78): `/steps n all` prints the ctrl+o rows of one
// turn into the transcript, and `/copy` gains `code n`, `link n`, `steps n`, `turn n` and `diff <path>` beside the
// engine's own `/copy` (the last answer), each through `$.ui.copy`, each answered with one notice. Nothing on screen
// changes. Wrong n or path: one notice saying what exists.
import type { EngineInterface } from 'claude-code'

import type { FileDiff } from '../../types'
import { readFlow, isNarrationAt } from '../shared/flow'
import { layout, ruleWidth } from '../shared/layout'
import type { Part } from '../shared/parts'
import { readHistory } from './history/store'
import { turnView } from './fallback/facts'
import { readLog, readReceipts } from './log'
import { diffFrame, outputFrame, rowText, sentenceRows, stepRow } from './unfolded'

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
 * or output in a frame. An output here is the excerpt history kept, with what it left out said under it.
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

  return flow.flatMap((f, i): Part[][] => {
    if (f.turn === null || !mine.has(f.turn)) return []

    if (f.kind === 'text') {
      if (!isNarrationAt(flow, i)) return []

      const text = said.findLast(m => m.role === 'assistant' && firstKey(m.text).includes(f.key.slice(0, 60)))?.text ?? f.key
      const next = flow.slice(i + 1).find(g => g.turn === f.turn && g.kind === 'tool')

      return sentenceRows(text.trim(), next === undefined ? undefined : view.startOf(next.key), width)
    }

    const step = view.steps.find(s => s.id === f.key || s.calls?.includes(f.key) === true)

    if (step === undefined || seen.has(step.id)) return []

    seen.add(step.id)
    const detail = view.details.find(d => d.id === step.id)
    const left = detail === undefined ? 0 : detail.lines - detail.excerpt.length
    const below =
      detail === undefined
        ? []
        : detail.patch.length > 0
          ? diffFrame(step.subject, detail.patch, width)
          : step.kind === 'shell' || step.kind === 'test'
            ? outputFrame(detail.excerpt.join('\n'), width, left > 0 ? `… ${left} more ${left === 1 ? 'line' : 'lines'} not kept` : undefined)
            : []

    return [stepRow(step, detail?.ms, width), ...below]
  })
}

/** The frame a command's output is printed in: the transcript's rule width for the terminal it ran in. */
export const frameWidth = (columns: number): number => ruleWidth(layout(columns)) ?? layout(columns)?.width ?? Math.max(40, columns - 2)

/**
 * `/steps n all` (E.4): the turn's ctrl+o rows, as the command's output.
 * @param $ the engine interface
 * @param turnNo the typed turn
 * @param columns the terminal's columns
 * @returns the output text
 */
export async function stepsAllText($: EngineInterface, turnNo: number, columns: number): Promise<string> {
  const rows = await turnRows($, turnNo, frameWidth(columns))

  return rows.length > 0 ? rows.map(rowText).join('\n') : `no step log for turn ${turnNo} · kept: ${span(await knownTurns($))}`
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

    return done.isCopied ? `copied · ${said}` : `not copied · ${done.reason}`
  }

  if (form === 'code' || form === 'link') {
    const answer = await lastAnswer($)
    const all = answer === undefined ? [] : form === 'code' ? codeBlocks(answer) : linksOf(answer)
    const what = form === 'code' ? 'code block' : 'link'
    const has = all.length === 0 ? `the last answer has no ${what}s` : `the last answer has ${plural(all.length, what)}, 1 to ${all.length}`
    const hit = isN ? all[n - 1] : undefined

    if (hit === undefined) return `no ${what} ${arg.length > 0 ? arg : 'given'} · ${has}`

    return copy(hit, form === 'code' ? `code block ${n} · ${plural(hit.split('\n').length, 'line')}` : `link ${n} · ${hit}`)
  }

  if (form === 'steps' || form === 'turn') {
    const known = await knownTurns($)

    if (!isN || !known.includes(n)) return `no ${form === 'steps' ? 'step log' : 'turn'} ${arg.length > 0 ? arg : 'given'} · kept: ${span(known)}`

    if (form === 'steps') {
      const rows = await turnRows($, n, frameWidth(columns))

      return rows.length > 0
        ? copy(rows.map(rowText).join('\n'), `the steps of turn ${n} · ${plural(rows.length, 'row')}`)
        : `no step log for turn ${n} · kept: ${span(known)}`
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
