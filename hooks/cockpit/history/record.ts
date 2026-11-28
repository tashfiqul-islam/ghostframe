// A typed turn as history keeps it (spec E.45), and the plan that keeps every session's history in $.store under its
// budget: the oldest turns' bulky parts (output excerpts, patches, files' diffs) go first, then the oldest other
// sessions, and a session's own summary rows only when nothing else is left. Pure: store.ts reads and writes.
import type { FileDiff, LogStep, Receipt, RosterAgent, StepDetail, StepLog, TurnRecord, TurnWork } from '../../../types'

const SUBJECT_MAX = 200 // a step's subject as history keeps it (E.45)

/** $.store's whole budget, in characters of JSON (probe 24 refused 4.2 MB), less room for the other keys' framing. */
export const STORE_MAX = 4_194_304
const STORE_MARGIN = 65_536

/** A step as history keeps it: its subject cut at 200 characters. */
const short = (s: LogStep): LogStep => (s.subject.length > SUBJECT_MAX ? { ...s, subject: `${s.subject.slice(0, SUBJECT_MAX - 1)}…` } : s)

/** What a turn's record is built from. */
export type RecordParts = {
  log: StepLog
  work: TurnWork
  roster: readonly RosterAgent[]
  receipts: readonly Receipt[]
  details: readonly StepDetail[]
  diffs: readonly FileDiff[]
  /** The row ids of the turn's narration. */
  narration?: readonly string[]
}

/**
 * The current typed turn's record: its log's steps (subjects cut at 200 characters), what it worked on, its agents,
 * the receipts of its engine turns, and the details of its own steps.
 * @param parts what it is built from
 * @returns the record
 */
export function recordOf(parts: RecordParts): TurnRecord {
  const { log, work } = parts
  const turns = [...new Set(parts.receipts.map(r => r.turn).filter((t): t is string => t !== null))]
  // The agents' own steps are kept with the turn's roster, their details with the turn's (they trim together).
  const roster = parts.roster.map(a => (a.log === undefined ? a : { ...a, log: a.log.map(short) }))
  const ids = new Set([...log.steps, ...roster.flatMap(a => a.log ?? [])].map(s => s.id))
  const steps: LogStep[] = log.steps.map(short)

  return {
    turnNo: log.turnNo,
    turns,
    startedAt: log.startedAt,
    durationMs: log.workedMs,
    last: log.last,
    steps,
    dropped: log.dropped,
    files: work.files,
    sources: work.sources,
    cited: work.cited,
    roster,
    receipts: [...parts.receipts],
    details: parts.details.filter(d => ids.has(d.id)),
    diffs: [...parts.diffs],
    isTrimmed: false,
    narration: [...(parts.narration ?? [])]
  }
}

/** Adds or replaces a turn's record, by its number, keeping the records in turn order. */
export function withRecord(records: readonly TurnRecord[], record: TurnRecord): TurnRecord[] {
  return [...records.filter(r => r.turnNo !== record.turnNo), record].toSorted((a, b) => a.turnNo - b.turnNo)
}

const AGENT_STEPS_KEPT = 20 // an agent's newest steps a trimmed turn keeps; a long-lived agent is saved with every turn

/** Whether a record still holds bulky parts. */
const isBulky = (r: TurnRecord): boolean =>
  r.diffs.length > 0 || r.details.some(d => d.excerpt.length > 0 || d.patch.length > 0) || r.roster.some(a => (a.log?.length ?? 0) > AGENT_STEPS_KEPT)

/**
 * A record without its bulky parts: the details keep their command and timing, the diffs go, and each agent keeps its
 * newest 20 steps, the rest counted in `logDropped`.
 */
export function trimmed(r: TurnRecord): TurnRecord {
  const roster = r.roster.map(a => {
    const over = Math.max(0, (a.log?.length ?? 0) - AGENT_STEPS_KEPT)

    return a.log === undefined || over === 0 ? a : { ...a, log: a.log.slice(over), logDropped: (a.logDropped ?? 0) + over }
  })

  return { ...r, roster, details: r.details.map(d => ({ ...d, excerpt: [], patch: [] })), diffs: [], isTrimmed: true }
}

/**
 * One session's history as $.store holds it, under `history:<session id>`; `extra`, the characters of the keys that
 * go with it (its prompts' stamps, `also`), weighed with it and deleted with it. A session with stamps and no history
 * (one Cockpit never kept) is one with no turns, under its stamps' key.
 */
export type Kept = { key: string; savedAt: number; turns: TurnRecord[]; extra?: number; also?: string[] }

// Each record's JSON length, by the record: records keep their identity from one turn's write to the next, so a turn
// measures only its new and trimmed records, not every session's every turn again.
const recordSizes = new WeakMap<TurnRecord, number>()
const recordSize = (r: TurnRecord): number => {
  const known = recordSizes.get(r)

  if (known !== undefined) return known
  const n = JSON.stringify(r).length

  recordSizes.set(r, n)

  return n
}

/** The characters `{ savedAt, turns }` takes as JSON under its key: the wrapper, each record, and the commas between. */
const sizeOf = (k: Kept): number =>
  k.key.length +
  JSON.stringify({ savedAt: k.savedAt, turns: [] }).length +
  k.turns.reduce((n, r) => n + recordSize(r), 0) +
  Math.max(0, k.turns.length - 1) +
  8 +
  (k.extra ?? 0)

/** What to write to and delete from the store so every session's history fits. */
export type Plan = { own: Kept; others: Kept[]; deleted: string[] }

/**
 * Fits this session's history, and the other sessions' already kept, under the store's budget: while over it, the
 * oldest turn (by start, any session) that holds bulky parts loses them; with none left, the oldest other session
 * goes; with no other session left, this session's oldest turns go, summaries and all.
 * @param own this session's history
 * @param others the other sessions' histories in the store
 * @param budget the characters of JSON the histories may take (the store's, less every other key's)
 * @returns what to keep
 */
export function planBudget(own: Kept, others: readonly Kept[], budget: number = STORE_MAX - STORE_MARGIN): Plan {
  let mine = own
  let rest = [...others]
  const deleted: string[] = []
  const total = () => sizeOf(mine) + rest.reduce((n, k) => n + sizeOf(k), 0)
  let size = total()

  while (size > budget) {
    const bulky = [mine, ...rest]
      .flatMap(k => k.turns.flatMap((r, i) => (isBulky(r) ? [{ k, i, at: r.startedAt ?? 0 }] : [])))
      .toSorted((a, b) => a.at - b.at)[0]

    if (bulky !== undefined) {
      const stripped = { ...bulky.k, turns: bulky.k.turns.map((r, i) => (i === bulky.i ? trimmed(r) : r)) }

      if (bulky.k === mine) mine = stripped
      else rest = rest.map(k => (k === bulky.k ? stripped : k))
    } else if (rest.length > 0) {
      const oldest = rest.toSorted((a, b) => a.savedAt - b.savedAt)[0]
      rest = rest.filter(k => k !== oldest)

      if (oldest !== undefined) deleted.push(oldest.key, ...(oldest.also ?? []))
    } else if (mine.turns.length > 1) {
      mine = { ...mine, turns: mine.turns.slice(1) }
    } else {
      break
    }

    size = total()
  }

  const changed = rest.filter(k => others.some(o => o.key === k.key && o !== k))

  return { own: mine, others: changed, deleted }
}

/**
 * Turns a record back into a log, for a pane restored after a resume: the turn as it ended, idle.
 * @param log the empty log the session started with
 * @param record the last kept turn
 * @returns the log
 */
export function restoredLog(log: StepLog, record: TurnRecord): StepLog {
  return {
    ...log,
    turn: record.turns.at(-1) ?? null,
    turnNo: record.turnNo,
    startedAt: record.startedAt,
    segmentStart: record.startedAt,
    workedMs: record.durationMs,
    steps: record.steps,
    dropped: record.dropped,
    isTurnRunning: false,
    last: record.last
  }
}
