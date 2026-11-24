// Each main-loop step's detail (spec E.44: Enter on a step), kept in $.state apart from the step log so the log stays
// small: the full command or subject, its timing, an excerpt of its output, and an edit's patch.
import { exitOf as exitCodeIn } from '../../shared/look/words'
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { StepDetail } from '../../../types'
import { num, obj, s } from '../../shared/calls/fields'
import { shellText } from '../../shared/calls/ships'
import { clean } from '../../shared/calls/tests'
import type { Outcome } from '../steps/log'

// The newest steps' details. Change the tag when its fields change.
const details = atom({ plugin: 'ghostframe', key: 'details' } as const, [] as StepDetail[], { shape: 'details-1' })

const DETAILS_MAX = 300 // steps kept: an older step's detail view says it is gone
const EXCERPT = 10 // output rows a detail shows
const ROW_MAX = 300 // characters kept of an output row
const PATCH_MAX = 400 // patch rows kept of an edit

/**
 * The full command or subject of a call: a shell's command, a file's path, a page's URL, a search's query, else its
 * input as JSON.
 * @param tool the call's tool
 * @param input the call's input
 * @returns one string, never cut
 */
export function commandOf(tool: string, input: unknown): string {
  const i = obj(input) ?? {}
  const named = s(i['command']) ?? s(i['file_path']) ?? s(i['notebook_path']) ?? s(i['url']) ?? s(i['query']) ?? s(i['pattern'])

  if (named !== undefined) return tool === 'Grep' && s(i['path']) !== undefined ? `${named} in ${s(i['path'])}` : named

  // An agent's launch: what it was asked to do, its description and its brief's first line (8.4), not its record.
  if (tool === 'Agent' || tool === 'Task') {
    const brief =
      (s(i['prompt']) ?? '')
        .split('\n')
        .find(l => l.trim().length > 0)
        ?.trim() ?? ''

    return [s(i['description']) ?? '', brief].filter(x => x.length > 0).join(' · ')
  }

  const rest = Object.fromEntries(Object.entries(i).filter(([k]) => k !== 'tool' && k !== 'tool_use_id' && k !== 'agentId'))

  return JSON.stringify(rest).slice(0, 2_000)
}

/** A call's output as text: a shell's streams, else the tool's text or its record. */
function outputOf(tool: string, outcome: Outcome): string {
  const text = tool === 'Bash' || tool === 'PowerShell' ? shellText(outcome.result) : ''

  if (text.trim().length > 0) return clean(text)
  if (outcome.deny !== undefined) return outcome.deny

  return clean(outcome.text ?? (typeof outcome.result === 'string' ? outcome.result : ''))
}

/** An edit's or a write's patch as unified rows: each hunk's `@@ -a,b +c,d @@` header, then its lines. */
export function patchOf(tool: string, input: unknown, result: unknown): string[] {
  const o = obj(result)
  const hunks = Array.isArray(o?.['structuredPatch']) ? o['structuredPatch'] : []
  const rows = hunks.flatMap(h => {
    const hunk = obj(h) ?? {}
    const lines = Array.isArray(hunk['lines']) ? hunk['lines'].filter((l): l is string => typeof l === 'string') : []

    return [`@@ -${num(hunk['oldStart']) ?? 0},${num(hunk['oldLines']) ?? 0} +${num(hunk['newStart']) ?? 0},${num(hunk['newLines']) ?? 0} @@`, ...lines]
  })

  if (rows.length > 0) return rows.slice(0, PATCH_MAX)

  // A write that created its file carries no hunks: its content is the patch.
  const content = tool === 'Write' ? (s(o?.['content']) ?? s(obj(input)?.['content'])) : undefined

  return content === undefined
    ? []
    : [
        `@@ -0,0 +1,${content.split('\n').length} @@`,
        ...content
          .replace(/\n$/, '')
          .split('\n')
          .map(l => `+${l}`)
      ].slice(0, PATCH_MAX)
}

/**
 * A main-loop call started: its detail begins, with its command and start.
 * @param $ the engine interface
 * @param id the call's id
 * @param tool the call's tool
 * @param input the call's input
 * @param at the wall clock in ms
 * @param agent the agent whose own call it is; absent for the main loop's
 */
export async function noteStart($: EngineInterface, id: string, tool: string, input: unknown, at: number, agent?: string): Promise<void> {
  const entry: StepDetail = {
    id,
    tool,
    command: commandOf(tool, input),
    startAt: at,
    ms: null,
    isFailed: false,
    lines: 0,
    excerpt: [],
    patch: [],
    ...(agent === undefined ? {} : { agent })
  }

  await update($, details, list => capped([...list.filter(d => d.id !== id), entry]))
}

/** Whether a detail is an agent's own call's. */
const isAgent = (d: StepDetail) => d.agent !== undefined

/** The newest 300 of the main loop's details and the newest 300 of agents', so agents never push the main loop's out. */
export function capped(list: readonly StepDetail[]): StepDetail[] {
  const keepMain = new Set(list.filter(d => !isAgent(d)).slice(-DETAILS_MAX))
  const keepAgents = new Set(list.filter(isAgent).slice(-DETAILS_MAX))

  return list.filter(d => keepMain.has(d) || keepAgents.has(d))
}

/**
 * A main-loop call ended: its detail gets its time, its output (the first rows of a success, the last of a
 * failure) and an edit's patch.
 * @param $ the engine interface
 * @param id the call's id
 * @param input the call's input
 * @param outcome what it came back with
 * @param at the wall clock in ms
 */
export async function noteEnd($: EngineInterface, id: string, input: unknown, outcome: Outcome, at: number): Promise<void> {
  await update($, details, list =>
    list.map(d => {
      if (d.id !== id) return d

      const isFailed = outcome.isError === true || outcome.deny !== undefined
      const rows = outputOf(d.tool, outcome)
        .replace(/\n+$/, '')
        .split('\n')
        .filter((r, _, all) => all.length > 1 || r.length > 0)
      const excerpt = (isFailed ? rows.slice(-EXCERPT) : rows.slice(0, EXCERPT)).map(r => r.slice(0, ROW_MAX))

      const exit = isFailed ? exitOf(outcome) : undefined

      return {
        ...d,
        ms: Math.max(0, at - d.startAt),
        isFailed,
        lines: rows.length,
        excerpt,
        patch: isFailed ? [] : patchOf(d.tool, input, outcome.result),
        ...(exit === undefined ? {} : { exit })
      }
    })
  )
}

/**
 * A failed command's exit code: the engine's `Exit code n` line on its error text, or the result's `exitCode`.
 * @param outcome what the call came back with
 * @returns the code, or undefined when the outcome gives none
 */
export function exitOf(outcome: Outcome): number | undefined {
  const code = obj(outcome.result)?.['exitCode']

  return exitCodeIn(outcome.text ?? '') ?? (typeof code === 'number' ? code : undefined)
}

/**
 * A resumed session: the last kept turn's details come back, where the session holds none.
 * @param $ the engine interface
 * @param kept the details
 */
export async function restoreDetails($: EngineInterface, kept: readonly StepDetail[]): Promise<void> {
  await update($, details, list => (list.length > 0 ? list : [...kept]))
}

/**
 * The steps' details; read while drawing a detail or a diff.
 * @param $ the engine interface
 * @returns the details, oldest first
 */
export async function readDetails($: EngineInterface): Promise<StepDetail[]> {
  return read($, details)
}
