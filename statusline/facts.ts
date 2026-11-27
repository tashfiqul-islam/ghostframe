// Claude Code's status line JSON, read defensively: every field may be missing, and new fields arrive over time.
// Pure: git's answer and the rate-limit cache come in as arguments, and `now` is passed, never read.
// The fields are documented at https://code.claude.com/docs/en/statusline (checked against 2.1.332).
import { isRecord } from '../hooks/shared/calls/fields.ts'
import { cutTitle, headOf } from '../hooks/shared/look/paths.ts'
import type { Facts, Pr, Reading } from './render.ts'

/** Branch and uncommitted state, from git or its cache. */
export type Git = { branch: string; dirty: boolean }

/** One rate-limit window as Claude Code sends it. */
export type Window = { used_percentage?: unknown; resets_at?: unknown }

/** The two subscription windows. */
export type Limits = { five_hour?: Window | null; seven_day?: Window | null }

const FIVE_HOURS = 5 * 3600e3
const SEVEN_DAYS = 7 * 24 * 3600e3
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const obj = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {})
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/**
 * A percentage, rounded and held to 0–100; null when it is not a number (unknown, never a fake 0%).
 * @param v the raw value
 * @returns the whole percentage, or null
 */
export const pct = (v: unknown): number | null => {
  const n = num(v)

  return n === null ? null : Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * A time as epoch milliseconds: Claude Code sends epoch seconds; an ISO string is read too.
 * @param v the raw value
 * @returns milliseconds since the epoch, or null
 */
export const toMs = (v: unknown): number | null => {
  const n = num(v)

  if (n !== null) return n < 1e12 ? n * 1000 : n

  const s = str(v)

  if (s === null) return null

  const t = Date.parse(s)

  return Number.isNaN(t) ? null : t
}

/**
 * A duration as the status line writes it: `38m`, `2h 14m`, `3d 4h`.
 * @param ms the duration in milliseconds
 * @returns its short form
 */
export const dur = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / 60000))

  if (m < 60) return `${m}m`

  const h = Math.floor(m / 60)

  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`
}

/**
 * One rate-limit tile: the percentage, the reset (a duration within a day, else the weekday), and the pace, the share
 * of the window that has elapsed. Pace and reset need a known reset time.
 * @param l the window
 * @param windowMs the window's length
 * @param now the time now, epoch ms
 * @returns the tile's reading
 */
export function limit(l: Window | null | undefined, windowMs: number, now: number): Reading {
  const used = pct(l?.used_percentage)
  const at = toMs(l?.resets_at)

  if (used === null || at === null) return { pct: used, reset: null, pace: null }

  const left = at - now
  const reset = left > 24 * 3600e3 ? (DAYS[new Date(at).getDay()] ?? null) : dur(left)
  const pace = Math.max(0, Math.min(100, ((windowMs - left) / windowMs) * 100))

  return { pct: used, reset, pace }
}

/**
 * The prompt cache: the time left until it goes cold (from `expires_at`), `cold` when `warm` is false or the time has
 * passed, and null when Claude Code sent no `prompt_cache` (before the first reply).
 * @param pc the `prompt_cache` object
 * @param now the time now, epoch ms
 * @returns the slot's text, or null
 */
export function cacheLeft(pc: unknown, now: number): string | null {
  if (!isRecord(pc)) return null
  if (pc['warm'] === false) return 'cold'

  const at = toMs(pc['expires_at'])

  if (at === null) return null

  return at > now ? dur(at - now) : 'cold'
}

/**
 * The PR that needs the person: changes requested (red) or pending review (amber). Draft, approved and unknown
 * states leave the changes column alone.
 * @param pr the `pr` object
 * @returns the PR, or null
 */
export function prOf(pr: unknown): Pr | null {
  const p = obj(pr)
  const n = num(p['number'])
  const state = str(p['review_state'])

  if (n === null) return null
  if (state === 'changes_requested') return { n, state: 'changes requested' }
  if (state === 'pending') return { n, state: 'pending' }

  return null
}

/**
 * The live rate limits when Claude Code sent any, else the cached ones whose reset time has not passed. The cache is
 * written by the caller from `live` (see limits.ts).
 * @param live `rate_limits` from the JSON
 * @param cached what the cache file held, or null
 * @param now the time now, epoch ms
 * @returns the windows to show
 */
export function limitsOf(live: unknown, cached: Limits | null, now: number): Limits {
  const l = obj(live)

  if (isRecord(l['five_hour']) || isRecord(l['seven_day'])) return { five_hour: windowOf(l['five_hour']), seven_day: windowOf(l['seven_day']) }
  if (cached === null) return {}

  const fresh = (w: Window | null | undefined): Window | null => (w !== null && w !== undefined && (toMs(w.resets_at) ?? 0) > now ? w : null)

  return { five_hour: fresh(cached.five_hour), seven_day: fresh(cached.seven_day) }
}

const windowOf = (v: unknown): Window | null => (isRecord(v) ? { used_percentage: v['used_percentage'], resets_at: v['resets_at'] } : null)

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])
// Plain ASCII within the limit needs no cut; anything else is measured in cells (a cold measure costs milliseconds).
const short = (s: string, n: number): boolean => s.length <= n && /^[\x20-\x7e]*$/.test(s)
const baseName = (p: string): string => p.split(/[\\/]/).findLast(Boolean) ?? ''

/**
 * The facts one render shows.
 * @param json Claude Code's status line JSON (any shape)
 * @param git branch and dirty state, or null when the folder is not a repository or git failed
 * @param limits the rate limits to show (from `limitsOf`)
 * @param now the time now, epoch ms
 * @returns the facts
 */
export function factsOf(json: unknown, git: Git | null, limits: Limits, now: number): Facts {
  const j = obj(json)
  const ws = obj(j['workspace'])
  const dir = str(ws['current_dir']) ?? str(j['cwd']) ?? ''
  const repo = str(obj(ws['repo'])['name']) ?? baseName(str(ws['project_dir']) ?? dir)
  const model = obj(j['model'])
  const name = (str(model['display_name']) ?? str(model['id']) ?? 'Claude').replace(/^Claude\s+/i, '')
  const level = str(obj(j['effort'])['level']) ?? ''
  const cost = obj(j['cost'])
  const duration = num(cost['total_duration_ms']) ?? 0
  const branch = str(obj(j['worktree'])['branch']) ?? git?.branch ?? ''

  return {
    model: short(name, 24) ? name : headOf(name, 24),
    effort: EFFORTS.has(level) ? level : '',
    repo: short(repo, 24) ? repo : headOf(repo, 24),
    branch: short(branch, 20) ? branch : cutTitle(branch, 20),
    dirty: git?.dirty ?? false,
    added: Math.max(0, num(cost['total_lines_added']) ?? 0),
    removed: Math.max(0, num(cost['total_lines_removed']) ?? 0),
    pr: prOf(j['pr']),
    cache: cacheLeft(j['prompt_cache'], now),
    elapsed: duration >= 60000 ? dur(duration) : null,
    ctx: { pct: pct(obj(j['context_window'])['used_percentage']), reset: null, pace: null },
    five: limit(limits.five_hour, FIVE_HOURS, now),
    week: limit(limits.seven_day, SEVEN_DAYS, now)
  }
}

/**
 * One JSON value laid over another: objects merge key by key, anything else replaces.
 * @param base the value underneath
 * @param top the value laid over it
 * @returns the merged value
 */
export function overlay(base: unknown, top: unknown): unknown {
  if (!isRecord(base) || !isRecord(top)) return top

  const out: Record<string, unknown> = { ...base }

  for (const [k, v] of Object.entries(top)) out[k] = overlay(base[k], v)

  return out
}
