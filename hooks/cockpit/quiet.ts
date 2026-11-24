// The calls of a folded tool group, as the `ToolGroup` site carries them: read by the left's routing and by
// fallback's drawing.

/** One call of a folded tool group, as the `ToolGroup` site carries it. */
export type GroupCall = { tool_use_id?: string | undefined; tool: string; input: unknown; output?: unknown; isErrored: boolean }
