// ─── Fields: typed reads of a tool call's unknown input and output ───────────

export const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim().length > 0 ? v : undefined)
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const obj = (v: unknown): Record<string, unknown> | undefined => (isRecord(v) ? v : undefined)
export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
