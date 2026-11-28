// History (spec E.45): every typed turn's record, in $.state for the session (it survives a plugin reload) and in
// $.store under `history:<session id>` (it survives a resume), fitted to the store's budget with the other sessions'
// histories; and the pinned turn the pane shows instead of the live one.
import { noticeSink } from '../switch'
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Receipt, TurnRecord } from '../../../types'
import { STORE_MAX, planBudget, recordOf, withRecord } from './record'
import type { Kept, RecordParts } from './record'
import { changeHeld, loadHeld, nextTick, type Held } from '../../shared/held'

const PREFIX = 'history:'
// The prompts' stamps each session keeps (hooks/transcript/ledger/state.ts): weighed and evicted with its history.
const STAMPS = 'prompts:'

// The session's turns, oldest first. Change the tag when a record's fields change.
// The session's turns, oldest first, are held in this module (`heldHistory`) and kept in the store, never copied into
// $.state: every kept turn's steps, outputs and diffs, megabytes in a long session. A draw follows `historyTick`. A copy
// of the module loaded after a `/tui` switch reads them from the store, which is current where the state is not (probe 19).
const historyTick = atom({ plugin: 'ghostframe', key: 'historyTick' } as const, 0, { shape: 'historyTick-1' })
// Every kept turn's narration row ids, kept beside history whenever history is written: a transcript row asks only
// this, never `history` itself, whose every turn's steps, outputs and diffs a long session makes megabytes of.
const keptNarration = atom({ plugin: 'ghostframe', key: 'keptNarration' } as const, [] as string[], { shape: 'keptNarration-1' })
// The turn the pane shows instead of the live one; null for live.
const pin = atom({ plugin: 'ghostframe', key: 'pin' } as const, null as number | null, { shape: 'pin-1' })

// shortcut: the session's key and the other keys' sizes are read once, at session start; another session writing
// meanwhile is seen only when a write is refused, which reads them all again. This session's own stamps are weighed
// as they were then too: at most 100 stamps of 200 characters each (hooks/transcript/ledger/state.ts), about 30 kB.
let key: string | undefined
let others: Kept[] = []
let fixedSize = 0 // the characters of every key that is no history and no prompts' stamps
let ownExtra = 0 // the characters of this session's stamps, as the store held them

const isRecords = (v: unknown): v is TurnRecord[] => Array.isArray(v) && v.every(r => typeof r === 'object' && r !== null && 'turnNo' in r && 'steps' in r)
const keptOf = (k: string, v: unknown): Kept | undefined => {
  const value = typeof v === 'object' && v !== null ? (v as { savedAt?: unknown; turns?: unknown }) : {}

  return isRecords(value.turns) ? { key: k, savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0, turns: value.turns } : undefined
}

/**
 * Writes the session's kept turns, and their narration rows beside them (`keptNarration`).
 * @param $ the engine interface
 * @param turns the turns, oldest first
 */
async function keepHistory($: EngineInterface, turns: readonly TurnRecord[]): Promise<void> {
  // Held here (shared/held.ts), never copied into $.state; the store's copy is written by `write`.
  const rows = turns.flatMap(r => r.narration ?? [])

  heldHistory.value = { v: [...turns] }
  heldNarration.value = { v: new Set(rows) }
  await $.state.set({ plugin: 'ghostframe', key: 'historyTick' }, { shape: 'historyTick-1', value: nextTick(heldHistory) })
  await $.state.set({ plugin: 'ghostframe', key: 'keptNarration' }, { shape: 'keptNarration-1', value: rows })
  await $.state.set({ plugin: 'ghostframe', key: 'keptNarrationTick' }, { shape: 'keptNarrationTick-1', value: nextTick(heldNarration) })
}

const setOf = async (rows: Promise<readonly string[]>): Promise<ReadonlySet<string>> => new Set(await rows)

// The session's kept turns as this file last wrote them; read from $.state once per load of the module.
const heldHistory: Held<TurnRecord[]> = {}
// Their narration rows, asked by every transcript row's draw while docked: a draw reads the tick and asks the set.
const heldNarration: Held<ReadonlySet<string>> = {}
const keptNarrationTick = atom({ plugin: 'ghostframe', key: 'keptNarrationTick' } as const, 0, { shape: 'keptNarrationTick-1' })

/**
 * The session's kept turns, as this module holds them; a copy of the module that holds none yet reads the store.
 * @param $ the engine interface
 * @returns the turns, oldest first
 */
export async function historyNow($: EngineInterface): Promise<TurnRecord[]> {
  // A store that cannot be read holds no turns for this copy of the module, as `storedRecordList` does: the session
  // keeps its turns from then on, whether or not the store takes them (`saveTurn`).
  if (heldHistory.value === undefined) await loadHeld(heldHistory, readStoreOrNone($))

  return changeHeld(heldHistory, list => list)
}

/** This session's kept narration rows as the store had them when this copy of the module first asked. */
let storedNarration: Set<string> | undefined
/** This session's kept turns as the store had them when this copy of the module first asked. */
let storedRecords: TurnRecord[] | undefined

/**
 * This session's kept turns from the store, read once per copy of the module: for rows drawn before the session's
 * start has brought them into the state (a resumed transcript is drawn first, amendment 8).
 * @param $ the engine interface
 * @returns the turns, oldest first
 */
async function storedRecordList($: EngineInterface): Promise<TurnRecord[]> {
  if (storedRecords === undefined) {
    // A store that cannot be read costs the early draw only: the state's turns come with the session's start.
    try {
      const k = `${PREFIX}${await $.session.id()}`
      storedRecords = keptOf(k, await $.store.get(k))?.turns ?? []
    } catch (error: unknown) {
      $.ui.log(`cockpit: kept turns not read before the session start: ${String(error)}`, { to: 'debug' })
      storedRecords = []
    }
  }

  return storedRecords
}

/**
 * This session's kept receipts from the store, read once per copy of the module (see `storedRecordList`).
 * @param $ the engine interface
 * @returns the receipts, oldest first
 */
export async function storedReceiptList($: EngineInterface): Promise<Receipt[]> {
  return (await storedRecordList($)).flatMap(t => t.receipts)
}

/**
 * The session's kept turns: the state's, or, before the session's start has brought them there, the store's.
 * @param $ the engine interface
 * @returns the turns, oldest first
 */
export async function keptRecords($: EngineInterface): Promise<TurnRecord[]> {
  await read($, historyTick)
  const held = heldHistory.value?.v ?? []

  return held.length > 0 ? held : storedRecordList($)
}

/**
 * Whether a row is narration a kept turn recorded: from the state's history, or, for a row drawn before the session's
 * start has brought history back (a resumed transcript is drawn first, amendment 8), from the store, read once.
 * @param $ the engine interface
 * @param row the row's id
 * @returns whether it is
 */
export async function isKeptNarration($: EngineInterface, row: string): Promise<boolean> {
  await read($, keptNarrationTick)
  if (heldNarration.value === undefined) await loadHeld(heldNarration, setOf(read($, keptNarration)))
  if (heldNarration.value?.v.has(row) === true) return true

  if (storedNarration === undefined) {
    const k = `${PREFIX}${await $.session.id()}`
    storedNarration = new Set(keptOf(k, await $.store.get(k))?.turns.flatMap(t => t.narration ?? []) ?? [])
  }

  return storedNarration.has(row)
}

/**
 * How many turns the store keeps for this session, read from the store alone: the copy of the module loaded after a
 * `/tui` switch reads the state as it was before the switch's last writes (probe 19), the store as it is.
 * @param $ the engine interface
 * @returns the count
 */
export async function storedTurnCount($: EngineInterface): Promise<number> {
  const k = `${PREFIX}${await $.session.id()}`

  return keptOf(k, await $.store.get(k))?.turns.length ?? 0
}

/**
 * Reads the store: this session's kept turns, and the other sessions' sizes for the budget.
 * @param $ the engine interface
 * @returns this session's kept turns, oldest first
 */
async function readStore($: EngineInterface): Promise<TurnRecord[]> {
  key = `${PREFIX}${await $.session.id()}`
  others = []
  fixedSize = 0
  ownExtra = 0
  let own: TurnRecord[] = []

  const keys = await $.store.keys()
  const values = await Promise.all(keys.map(async k => ({ k, value: await $.store.get(k) })))
  const histories = new Map<string, Kept>()
  const stamps = new Map<string, { size: number; savedAt: number }>()

  for (const { k, value } of values) {
    const kept = k.startsWith(PREFIX) ? keptOf(k, value) : undefined
    const size = k.length + JSON.stringify(value ?? null).length + 8

    if (kept !== undefined) histories.set(k.slice(PREFIX.length), kept)
    else if (k.startsWith(STAMPS) && Array.isArray(value)) stamps.set(k.slice(STAMPS.length), { size, savedAt: newestAt(value) })
    else fixedSize += size
  }

  // Each session's stamps go with its history; stamps with none are a session of their own, with no turns.
  for (const [id, s] of stamps) {
    const kept = histories.get(id)

    histories.set(
      id,
      kept === undefined ? { key: `${STAMPS}${id}`, savedAt: s.savedAt, turns: [], extra: s.size } : { ...kept, extra: s.size, also: [`${STAMPS}${id}`] }
    )
  }

  for (const kept of histories.values()) {
    if (kept.key === key || kept.key === `${STAMPS}${key.slice(PREFIX.length)}`) {
      own = kept.turns
      ownExtra = kept.extra ?? 0
    } else {
      others.push(kept)
    }
  }

  return own
}

/**
 * This session's kept turns from the store, or none when it cannot be read (said in the debug log).
 * @param $ the engine interface
 * @returns the turns, oldest first
 */
async function readStoreOrNone($: EngineInterface): Promise<TurnRecord[]> {
  try {
    return await readStore($)
  } catch (error: unknown) {
    $.ui.log(`cockpit: kept turns not read from the store: ${String(error)}`, { to: 'debug' })

    return []
  }
}

/** The newest stamp's time in a list of stamps, 0 for none. */
const newestAt = (list: readonly unknown[]): number =>
  Math.max(0, ...list.map(s => (typeof s === 'object' && s !== null && 'at' in s && typeof s.at === 'number' ? s.at : 0)))

/**
 * Session start: the turns this session kept before (a resume) come back, unless the session's state already holds
 * them (a plugin reload).
 * @param $ the engine interface
 * @returns the turns, oldest first
 */
export async function loadHistory($: EngineInterface): Promise<TurnRecord[]> {
  const kept = await readStore($)
  const held = heldHistory.value?.v ?? []

  if (held.length > 0) return held

  await keepHistory($, kept)

  return kept
}

/**
 * Writes the plan: this session's turns, the other sessions it trimmed, the ones it dropped.
 * @param $ the engine interface
 * @param own this session's turns
 * @returns the turns kept
 */
async function write($: EngineInterface, own: readonly TurnRecord[]): Promise<TurnRecord[]> {
  if (key === undefined) await readStore($)

  const plan = planBudget({ key: key ?? `${PREFIX}?`, savedAt: Date.now(), turns: [...own], extra: ownExtra }, others, STORE_MAX - 65_536 - fixedSize)

  // Room first: the dropped and trimmed other sessions, then this session's.
  await Promise.all(plan.deleted.map(async gone => $.store.delete(gone)))
  await Promise.all(plan.others.filter(k => k.key.startsWith(PREFIX)).map(async k => $.store.set(k.key, { savedAt: k.savedAt, turns: k.turns })))

  await $.store.set(plan.own.key, { savedAt: plan.own.savedAt, turns: plan.own.turns })
  others = others.filter(o => !plan.deleted.includes(o.key)).map(o => plan.others.find(k => k.key === o.key) ?? o)

  return plan.own.turns
}

/**
 * A typed turn's engine turn ended: its record is kept, in the session's state first, then in the store, under the
 * budget. A store that refuses the write is read again, all of it, and the plan made afresh, once.
 * @param $ the engine interface
 * @param parts what the record is built from
 */
export async function saveTurn($: EngineInterface, parts: RecordParts): Promise<void> {
  const record = recordOf(parts)
  const all = withRecord(await historyNow($), record)

  // The session keeps the turn whether or not the store takes it: the pane's pins and fallback's redraw of a past
  // turn (13.1) read it. A refused write costs the turn its place after a resume, never the session's copy.
  await keepHistory($, all)
  let kept: TurnRecord[]

  try {
    kept = await write($, all)
  } catch (error: unknown) {
    $.ui.log(`cockpit: history write refused, reading the store again: ${String(error)}`, noticeSink())
    await readStore($)
    kept = await write($, all)
  }

  // Written again only when the store's budget trimmed it.
  if (kept.length !== all.length || kept.some((r, i) => r !== all[i])) await keepHistory($, kept)
}

/**
 * The conversation compacted: every kept turn's receipts say so (`isCompacted`), in the session's state and in the
 * store, so the rows the summary replaced never read as rewound, after a reload or a resume either.
 * @param $ the engine interface
 */
export async function markCompacted($: EngineInterface): Promise<void> {
  const all = (await historyNow($)).map(r => ({ ...r, receipts: r.receipts.map(compacted) }))

  heldHistory.value = { v: all }
  await $.state.set({ plugin: 'ghostframe', key: 'historyTick' }, { shape: 'historyTick-1', value: nextTick(heldHistory) })
  try {
    await write($, all)
  } catch (error: unknown) {
    $.ui.log(`cockpit: history write refused, reading the store again: ${String(error)}`, noticeSink())
    await readStore($)
    await write($, all)
  }
}

/**
 * A receipt whose turn the conversation compacted away.
 * @param r the receipt
 * @returns it, marked
 */
export const compacted = (r: Receipt): Receipt => ({ ...r, isCompacted: true })

/**
 * Turns a rewind took out of the conversation leave history (7.1): the session's copy at once, the store's at the
 * next turn's write, which starts from the session's copy.
 * @param $ the engine interface
 * @param turnNos the turns' numbers
 */
export async function dropTurns($: EngineInterface, turnNos: readonly number[]): Promise<void> {
  await keepHistory(
    $,
    (await historyNow($)).filter(r => !turnNos.includes(r.turnNo))
  )
}

/**
 * The session's turns; read while drawing.
 * @param $ the engine interface
 * @returns the turns, oldest first
 */
export async function readHistory($: EngineInterface): Promise<TurnRecord[]> {
  await read($, historyTick)

  return historyNow($)
}

/**
 * The pinned turn's number; read while drawing.
 * @param $ the engine interface
 * @returns the number, or null for live
 */
export async function readPin($: EngineInterface): Promise<number | null> {
  return read($, pin)
}

/**
 * Pins a turn, or releases the pin (null, or the live turn's own number: pinning the current turn is releasing).
 * @param $ the engine interface
 * @param turnNo the turn
 * @param liveNo the live turn's number
 */
export async function setPin($: EngineInterface, turnNo: number | null, liveNo: number): Promise<void> {
  await update($, pin, () => (turnNo === null || turnNo === liveNo ? null : turnNo))
}
