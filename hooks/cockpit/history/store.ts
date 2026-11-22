// History (spec E.45): every typed turn's record, in $.state for the session (it survives a plugin reload) and in
// $.store under `history:<session id>` (it survives a resume), fitted to the store's budget with the other sessions'
// histories; and the pinned turn the pane shows instead of the live one.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { TurnRecord } from '../../../types'
import { STORE_MAX, planBudget, recordOf, withRecord } from './record'
import type { Kept, RecordParts } from './record'

const PREFIX = 'history:'

// The session's turns, oldest first. Change the tag when a record's fields change.
const history = atom({ plugin: 'ghostframe', key: 'history' } as const, [] as TurnRecord[], { shape: 'history-1' })
// The turn the pane shows instead of the live one; null for live.
const pin = atom({ plugin: 'ghostframe', key: 'pin' } as const, null as number | null, { shape: 'pin-1' })

// shortcut: the session's key and the other keys' sizes are read once, at session start; another session writing
// meanwhile is seen only when a write is refused, which reads them all again.
let key: string | undefined
let others: Kept[] = []
let fixedSize = 0 // the characters of every key that is no history

const isRecords = (v: unknown): v is TurnRecord[] => Array.isArray(v) && v.every(r => typeof r === 'object' && r !== null && 'turnNo' in r && 'steps' in r)
const keptOf = (k: string, v: unknown): Kept | undefined => {
  const value = typeof v === 'object' && v !== null ? (v as { savedAt?: unknown; turns?: unknown }) : {}

  return isRecords(value.turns) ? { key: k, savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0, turns: value.turns } : undefined
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
  let own: TurnRecord[] = []

  const keys = await $.store.keys()
  const values = await Promise.all(keys.map(async k => ({ k, value: await $.store.get(k) })))

  for (const { k, value } of values) {
    const kept = k.startsWith(PREFIX) ? keptOf(k, value) : undefined

    if (k === key) own = kept?.turns ?? []
    else if (kept !== undefined) others.push(kept)
    else fixedSize += k.length + JSON.stringify(value ?? null).length + 8
  }

  return own
}

/**
 * Session start: the turns this session kept before (a resume) come back, unless the session's state already holds
 * them (a plugin reload).
 * @param $ the engine interface
 * @returns the turns, oldest first
 */
export async function loadHistory($: EngineInterface): Promise<TurnRecord[]> {
  const kept = await readStore($)
  const held = await read($, history)

  if (held.length > 0) return held

  await update($, history, () => kept)

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

  const plan = planBudget({ key: key ?? `${PREFIX}?`, savedAt: Date.now(), turns: [...own] }, others, STORE_MAX - 65_536 - fixedSize)

  // Room first: the dropped and trimmed other sessions, then this session's.
  await Promise.all(plan.deleted.map(async gone => $.store.delete(gone)))
  await Promise.all(plan.others.map(async k => $.store.set(k.key, { savedAt: k.savedAt, turns: k.turns })))

  await $.store.set(plan.own.key, { savedAt: plan.own.savedAt, turns: plan.own.turns })
  others = others.filter(o => !plan.deleted.includes(o.key)).map(o => plan.others.find(k => k.key === o.key) ?? o)

  return plan.own.turns
}

/**
 * A typed turn's engine turn ended: its record is kept, in the session's state and in the store, under the budget.
 * A store that refuses the write is read again, all of it, and the plan made afresh, once.
 * @param $ the engine interface
 * @param parts what the record is built from
 */
export async function saveTurn($: EngineInterface, parts: RecordParts): Promise<void> {
  const record = recordOf(parts)
  const all = withRecord(await read($, history), record)
  let kept: TurnRecord[]

  try {
    kept = await write($, all)
  } catch (error: unknown) {
    $.ui.log(`cockpit: history write refused, reading the store again: ${String(error)}`)
    await readStore($)
    kept = await write($, all)
  }

  await update($, history, () => kept)
}

/**
 * The session's turns; read while drawing.
 * @param $ the engine interface
 * @returns the turns, oldest first
 */
export async function readHistory($: EngineInterface): Promise<TurnRecord[]> {
  return read($, history)
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
