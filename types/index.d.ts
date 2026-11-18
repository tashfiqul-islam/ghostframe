/** When a typed prompt was submitted, so its turn rule can show the time. */
export type PromptStamp = { text: string; at: number }

/** One finished main-loop turn, for its close rule: tokens, tally, and an open browser frame to close. */
/** `turn`: the turn it closed, so each footer row claims exactly one close. */
export type TurnClose = { durationMs: number; tokens: number | null; tally: string; browser: number; turn?: string }

/** One main-loop tool call: its turn, tool, start, how long it took (null while running), and whether it succeeded. */
export type StepStamp = { id: string; turn: string | null; at: number; ms: number | null; tool?: string; ok?: boolean }

/** What a turn used before its first visible block (the capability line). */
export type CapsStamp = { skills: string[]; hooks: string[]; mcp: string[]; thoughtMs: number }

/** The capability line a turn's opener (its first text's key, or its first tool call's id) carries, with the turn it opened. */
export type OpenerCaps = { key: string; turn: string | null; caps: CapsStamp }

/** A turn's first prose block: its key, and the turn it opened (absent when seeded from history). */
export type FirstText = { key: string; turn?: string | null }

/** What a whole turn used, for the close rule's tally. */
export type TallyStamp = {
  skills: string[]
  hooks: number
  agents: number
  sources: string[]
  browser: number
  files: string[]
  tests: number
  shipped: number
}

/** One assistant block, in stored order: a text (its key) or a tool call (its id and tool). */
/** `cites`: the sources a text block adds to its turn, first-cited order (`listed`: named in a Sources list; `marked`: a drawn block carries its marker). */
export type FlowStamp = {
  turn: string | null
  kind: 'text' | 'tool'
  key: string
  tool?: string
  cites?: { url: string; title: string; listed?: boolean; marked?: boolean }[]
}

/** A test run's counts, by its call's id, with the turn it ran in. */
export type TestRunStamp = { id: string; turn?: string | null; runner: string; passed: number; failed: number; skipped: number }

/** What a shell call shipped, by its call's id. */
export type ShipStamp = {
  id: string
  turn?: string | null
  commit?: { sha: string; subject: string; files: number; adds: number; dels: number }
  push?: { from: string; to: string }
  pr?: { n: number; url: string; head?: string; base?: string }
}

declare module 'claude-code' {
  interface PluginState {
    ghostframe: {
      prompts: Shaped<PromptStamp[]>
      closes: Shaped<TurnClose[]>
      steps: Shaped<StepStamp[]>
      turn: Shaped<string | null>
      firstTexts: Shaped<FirstText[]>
      awaitingFirst: Shaped<boolean>
      firstTools: Shaped<string[]>
      asked: Shaped<string[]>
      streaming: Shaped<boolean>
      caps: Shaped<CapsStamp>
      openers: Shaped<OpenerCaps[]>
      tally: Shaped<TallyStamp>
      flow: Shaped<FlowStamp[]>
      testRuns: Shaped<TestRunStamp[]>
      ships: Shaped<ShipStamp[]>
    }
  }
}
