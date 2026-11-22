// A typed turn as history keeps it (spec E.45), and the plan that keeps every session's history in $.store under its
// budget: the oldest turns' bulky parts (output excerpts, patches, files' diffs) go first, then the oldest other
// sessions, and a session's own summary rows only when nothing else is left. Pure: store.ts reads and writes.
import type { FileDiff, LogStep, Receipt, RosterAgent, StepDetail, StepLog, TurnRecord, TurnWork } from '../../../types'

const SUBJECT_MAX = 200 // a step's subject as history keeps it (E.45)

/** $.store's whole budget, in characters of JSON (probe 24 refused 4.2 MB), less room for the other keys' framing. */
export const STORE_MAX = 4_194_304
const STORE_MARGIN = 65_536

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
  const ids = new Set(log.steps.map(s => s.id))
  const steps: LogStep[] = log.steps.map(s => (s.subject.length > SUBJECT_MAX ? { ...s, subject: `${s.subject.slice(0, SUBJECT_MAX - 1)}…` } : s))

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
    roster: [...parts.roster],
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

/** Whether a record still holds bulky parts. */
const isBulky = (r: TurnRecord): boolean => r.diffs.length > 0 || r.details.some(d => d.excerpt.length > 0 || d.patch.length > 0)

/** A record without its bulky parts: the details keep their command and timing, the diffs go. */
export function trimmed(r: TurnRecord): TurnRecord {
  return { ...r, details: r.details.map(d => ({ ...d, excerpt: [], patch: [] })), diffs: [], isTrimmed: true }
}

/**
 * One session's history as $.store holds it, under `history:<session id>`; `extra`, the characters of the keys that
 * go with it (its prompts' stamps, `also`), weighed with it and deleted with it. A session with stamps and no history
 * (one Cockpit never kept) is one with no turns, under its stamps' key.
 */
export type Kept = { key: string; savedAt: number; turns: TurnRecord[]; extra?: number; also?: string[] }

const sizeOf = (k: Kept): number => k.key.length + JSON.stringify({ savedAt: k.savedAt, turns: k.turns }).length + 8 + (k.extra ?? 0)

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
