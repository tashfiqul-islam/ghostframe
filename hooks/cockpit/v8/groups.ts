// The timeline's groups (spec 8.3): each of Claude's working sentences with the steps under it, collapsed into one bar
// and one result; and the fold from the top when they do not fit. Pure.
import type { LogStep } from '../../../types'
import { count } from '../../shared/look/format'
import { TOKEN } from '../../shared/look/palette'
import { isOpen, isShipMark } from '../steps/log'
import type { Group, GroupGlyph } from './pane'
import type { Tone } from '../../shared/look/bits'

/** A step with its time on the turn's clock: when it started and ended (undefined while it runs). */
export type TimedStep = { step: LogStep; start: number; end: number | undefined }

/** A working sentence and the index of the first step after it. */
export type Sentence = { text: string; at: number }

/** A sentence as a group's title (8.3): its first sentence, without its closing stop. */
export function titleOf(text: string): string {
  const line =
    text
      .split('\n')
      .find(l => l.trim().length > 0)
      ?.trim() ?? ''
  const first = /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line

  return first.replace(/[.!?…:]+$/, '')
}

/** A result for the pane (5.7): the left's long forms shortened (`2 of 14 fail` reads `2 of 14`). */
export const paneResult = (result: string): string => result.replace(/^(\d+ of \d+) fail$/, '$1')

/**
 * The groups of a turn (8.3): a group per working sentence, its steps the ones after it up to the next sentence; steps
 * before any sentence form a group titled by its first step. A group's glyph is its outcome, its bar runs from its
 * first step's start to its last step's end, its result is the decisive step's.
 * @param steps the turn's steps, in order, on its clock
 * @param sentences the working sentences, in order
 * @param now the turn's clock now, for running steps
 * @param details the decisive line of each failed or blocked step, by its id
 * @returns the groups, in start order
 */
export function groupsOf(steps: readonly TimedStep[], sentences: readonly Sentence[], now: number, details: ReadonlyMap<string, string> = new Map()): Group[] {
  const all = steps.map(s => s.step)
  const cuts = [...new Set([0, ...sentences.map(s => s.at).filter(at => at > 0 && at < steps.length)])].toSorted((a, b) => a - b)

  return cuts.flatMap((from, k): Group[] => {
    const to = cuts[k + 1] ?? steps.length
    const own = steps.slice(from, to)
    const first = own[0]

    if (first === undefined) return []

    const said = sentences.findLast(s => s.at <= from)
    const title = said !== undefined && (said.at === from || k > 0) ? titleOf(said.text) : `${first.step.kind} ${first.step.subject}`
    const open = own.find(s => isOpen(all, all.indexOf(s.step)))
    const blocked = own.find(s => s.step.state === 'blocked')
    const running = own.some(s => s.step.isRunning)
    const launch = own.find(s => s.step.kind === 'agent')
    const shipped = own.findLast(s => isShipMark(s.step))
    const glyph: GroupGlyph = running
      ? 'live'
      : open !== undefined
        ? 'failed'
        : blocked !== undefined
          ? 'blocked'
          : launch !== undefined
            ? 'agent'
            : shipped !== undefined
              ? 'shipped'
              : 'ok'
    const decisive = open ?? blocked ?? shipped ?? own.at(-1) ?? first
    const tone: Tone = running ? 'accent' : open !== undefined ? 'err' : blocked !== undefined ? 'warn' : 'dim'
    const result = running
      ? 'running'
      : launch !== undefined && open === undefined
        ? count(launch.step.calls?.length ?? 1, 'agent')
        : paneResult(decisive.step.result)
    const end = Math.max(...own.map(s => s.end ?? now))
    const color = running
      ? TOKEN.accent
      : open !== undefined
        ? TOKEN.err
        : blocked !== undefined
          ? TOKEN.warn
          : launch !== undefined
            ? TOKEN.agent
            : shipped !== undefined
              ? TOKEN.accent
              : TOKEN.barDone
    const detail = open !== undefined ? details.get(open.step.id) : blocked !== undefined ? (blocked.step.why ?? details.get(blocked.step.id)) : undefined

    return [{ id: first.step.id, glyph, title, bar: { from: first.start, to: end, color }, result, tone, ...(detail === undefined ? {} : { detail }) }]
  })
}

/** The rows a group takes on the timeline: itself, its detail line, and two per agent under it. */
const rowsOf = (g: Group) => 1 + (g.detail === undefined ? 0 : 1) + (g.agents ?? []).reduce((n, a) => n + 1 + (a.sub === undefined ? 0 : 1), 0)

/** The rows these groups take. */
const need = (gs: readonly Group[]) => gs.reduce((n, g) => n + rowsOf(g), 0)

/** Whether a group may fold (8.3): never the live group, a waiting one, or an open failure. */
const canFold = (g: Group) => g.glyph !== 'live' && g.glyph !== 'waiting' && g.glyph !== 'failed'

/**
 * Folds the oldest groups into one row from the top when they do not fit (8.3): `┊ Earlier work · n steps`, its bar
 * over theirs. A failure that was fixed folds like any other group only once a later group stands for it.
 * @param groups the groups, in start order
 * @param rows the rows the timeline may take
 * @param stepsIn how many steps each group holds, by its id
 * @returns the groups that fit, the fold first when there is one
 */
export function foldGroups(groups: readonly Group[], rows: number, stepsIn: ReadonlyMap<string, number>): Group[] {
  if (need(groups) <= rows) return [...groups]

  const kept = [...groups]
  const folded: Group[] = []

  while (kept.length > 0 && need(kept) + 1 > rows) {
    const at = kept.findIndex(canFold)

    if (at < 0) break

    folded.push(...kept.splice(at, 1))
  }

  if (folded.length === 0) return kept

  const steps = folded.reduce((n, g) => n + (stepsIn.get(g.id ?? '') ?? 0), 0)
  const from = Math.min(...folded.map(g => g.bar?.from ?? 0))
  const to = Math.max(...folded.map(g => g.bar?.to ?? 0))

  return [{ glyph: 'folded', title: 'Earlier work', bar: { from, to, color: TOKEN.barDone }, result: count(steps, 'step'), tone: 'dim' }, ...kept]
}
