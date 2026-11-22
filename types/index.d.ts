/** What came right before a typed turn, named on its rule (amendment 12): a resume, a compaction, a rewind. */
export type TurnAfter = 'resume' | 'compact' | 'rewind'

/**
 * A typed prompt: when it was submitted, so its turn rule can show the time. While Cockpit is on, also the row the
 * engine draws it under (its `session.append` uuid), its turn number (the step log's, set only when its turn starts)
 * and what came right before its turn. A prompt typed while a turn ran keeps that turn's id (`over`); delivered into
 * it, it is a steer (E.20), `steerMs` the turn clock it arrived at, and takes no number.
 */
export type PromptStamp = { text: string; at: number; row?: string; turnNo?: number; after?: TurnAfter; over?: string; steerMs?: number }

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
/** `row`: a text block's row id, the `session.append` uuid the engine draws it under, live and after a resume. */
export type FlowStamp = {
  turn: string | null
  kind: 'text' | 'tool'
  key: string
  row?: string
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

/** The mark a settled step row carries in Cockpit's `[ STEPS ]`: none, failed, a passing check that fixed a failure, committed, published. */
export type StepMark = '' | '✕' | '✓' | '±' | '↗'

/**
 * One `[ STEPS ]` row. `clock` is the turn clock in ms: at the start while running, at the end once settled.
 * `key` is what a later step must share to fix it. An agent launch (amendment 1) lists its `calls`, counts them
 * `done` and `failed`, and keeps in `ended` the calls already counted (a report and the call's return both end one).
 */
export type LogStep = {
  id: string
  kind: string
  subject: string
  key: string
  result: string
  mark: StepMark
  isRunning: boolean
  clock: number
  calls?: string[]
  done?: number
  failed?: number
  ended?: string[]
}

/** How a finished turn ended, for `[ LAST ]`: its state word, the story in a few words, what waits (or ''), its time, and when it ended (wall clock, ms). */
export type LastTurn = { state: 'done' | 'failed' | 'interrupted'; story: string; wait: string; durationMs: number; endedAt: number | null }

/** The steps of the most recent earlier turn that had any, shown while a turn has none (`[ STEPS · TURN n ]`). */
export type PrevSteps = { turnNo: number; steps: LogStep[]; dropped: number }

/**
 * Cockpit's log for the current (or last) typed turn: the turn the person's prompt started, and the turns its
 * agents' reports start after it, which carry on its steps and its number (`turnNo` counts typed prompts only).
 * `turn` is the engine's id of the turn running now (or last), whose receipt this log writes. `startedAt` is the
 * typed turn's start, the steps' clock; `segmentStart`, `segmentFrom` and `segmentMs` are the engine turn's own
 * start, its first step (counting `dropped`) and its time; `workedMs`, the time of the typed turn's engine turns
 * so far. `dropped` counts the oldest steps past the cap. The head reads the rest: whether a turn runs, the last
 * thing Claude said, the spinner's mode and since when (wall clock, ms), the steps waiting on a permission
 * answer, and how the turn ended.
 */
export type StepLog = {
  turn: string | null
  startedAt: number | null
  segmentStart: number | null
  segmentFrom: number
  segmentMs: number
  workedMs: number
  steps: LogStep[]
  dropped: number
  turnNo: number
  isTurnRunning: boolean
  said: string
  mode: string | null
  modeSince: number | null
  asking: string[]
  last: LastTurn | null
  prev: PrevSteps | null
}

/** A failure nothing fixed by the end of its turn: its `still failing` row above the receipt (spec E.5). */
export type OpenFailure = { kind: string; subject: string; result: string; clock: number }

/**
 * What a finished engine turn's receipt says (spec E.32, amendment 3), by the engine's turn id, so a receipt drawn
 * again later still shows its own turn (`answer`, the id of the turn's last answer row, the same after a resume,
 * finds it there: two answers with the same text never swap receipts): the state (`waiting` while background agents run on, `agents` of them),
 * its own counts (never another turn's), the last commit's short hash (or ''), the failures left open, and the
 * turn's time on Cockpit's clock.
 */
export type Receipt = {
  turn: string | null
  turnNo: number
  answer: string
  state: LastTurn['state'] | 'waiting'
  agents: number
  steps: number
  failures: number
  fixed: number
  files: number
  /** The agents the turn's launches started, and the pages it fetched (E.32); absent in a receipt kept before phase 9. */
  launched?: number
  sources?: number
  commit: string
  open: OpenFailure[]
  durationMs: number
  /**
   * For a turn that wrote no answer row: the id of its last call, whose row draws the receipt instead (E.3 case 3,
   * E.47). Kept with the receipt in the state and in history's store copy, so it outlives a reload and a resume.
   */
  lastCall?: string
}

/**
 * One agent in Cockpit's `[ AGENTS ]` (spec E.40), in launch order: its id (`agent.spawn`'s `agentId`), the Agent call
 * that launched it (`call`, '' when none did), its parent agent (null for the main loop's), its name (the call's
 * description), whether it runs in the background, its state, the kind and subject of its current step (or, once it
 * ended, the head of its report or the reason it failed), its step count, and when it started and ended (wall
 * clock, ms). The subject changes at most once a second (E.40): `subjectAt` is when it last did, and `pending` the
 * newer step it will show once that second is up.
 */
export type RosterAgent = {
  id: string
  call: string
  parent: string | null
  name: string
  /** The other names a row may give it: its own name and its type (`Explore`), as a peer's message names its sender. */
  called?: string[]
  isBackground: boolean
  state: 'running' | 'done' | 'failed'
  kind: string
  subject: string
  steps: number
  startedAt: number
  endedAt: number | null
  subjectAt: number
  pending: { kind: string; subject: string } | null
}

/** One to-do item (spec E.41): its id (the task's, or its place in a TodoWrite list), its text and its state. */
export type TodoItem = { id: string; text: string; state: 'pending' | 'in_progress' | 'completed' }

/** One file the turn changed (spec E.42): its path from the project root, `new` or `del` (or ''), and its +/− lines. */
export type FileChange = { path: string; tag: '' | 'new' | 'del'; adds: number; dels: number }

/** One page the turn read (spec E.43): its URL, a title (the answer's link text, a search result's, or ''), and its HTTP status ('' unknown). */
export type SourcePage = { url: string; title: string; status: string }

/**
 * What a typed turn worked on, for `[ TODO ]`, `[ FILES ]` and `[ SOURCES ]`: the session's to-do list (kept across
 * turns until a turn starts with every item done; `isRevised` once items were added or removed after work began),
 * the files changed and the pages read in order of first touch, and the pages the answer cites, in mark order.
 */
export type TurnWork = {
  todo: TodoItem[]
  isRevised: boolean
  files: FileChange[]
  sources: SourcePage[]
  cited: { url: string; title: string }[]
}

/**
 * What a step's detail view (spec E.44, Enter) shows, kept apart from the step log: the call's full command or
 * subject, when it started (wall clock, ms) and how long it ran (null while running), whether it failed, its output
 * (its line count and an excerpt: the first rows of a success, the last of a failure), and, for an edit or a write,
 * its patch as unified lines (`@@` headers, `+`, `-` and ` ` rows).
 */
export type StepDetail = {
  id: string
  tool: string
  command: string
  startAt: number
  ms: number | null
  isFailed: boolean
  lines: number
  excerpt: string[]
  patch: string[]
}

/** A file's diff over a whole turn: its content at the turn's start against its end, or why there is none. */
export type FileDiff = { path: string; patch: string[]; note?: string }

/**
 * One typed turn as history keeps it (spec E.45), in $.state for the session and in $.store across a resume: its
 * number, the engine turns it spanned, its time and verdict, its steps (subjects cut at 200 characters), files,
 * pages, agents and receipts (the summary rows, never trimmed while any bulky part is left), and its bulky parts,
 * the steps' details (output excerpts, patches) and the files' diffs, trimmed first, oldest turn first, to keep the
 * store under its budget (`isTrimmed` says they went).
 */
export type TurnRecord = {
  turnNo: number
  turns: string[]
  startedAt: number | null
  durationMs: number
  last: LastTurn | null
  steps: LogStep[]
  dropped: number
  files: FileChange[]
  sources: SourcePage[]
  cited: { url: string; title: string }[]
  roster: RosterAgent[]
  receipts: Receipt[]
  details: StepDetail[]
  diffs: FileDiff[]
  isTrimmed: boolean
  /**
   * The row ids of the turn's narration (text a tool call followed): a resumed transcript has no flow to tell, so these
   * stay hidden by their ids. Part of the summary, never trimmed; absent in a record kept before phase 10.
   */
  narration?: string[]
}

declare module 'claude-code' {
  interface PluginState {
    ghostframe: {
      prompts: Shaped<PromptStamp[]>
      pendingAfter: Shaped<TurnAfter | null>
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
      second: Shaped<number>
      frame: Shaped<number>
      stepLog: Shaped<StepLog>
      receipts: Shaped<Receipt[]>
      roster: Shaped<RosterAgent[]>
      work: Shaped<TurnWork>
      details: Shaped<StepDetail[]>
      viewTick: Shaped<number>
      history: Shaped<TurnRecord[]>
      pin: Shaped<number | null>
    }
  }
}
