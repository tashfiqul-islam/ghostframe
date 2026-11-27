// ghostframe's performance budgets: every number the benchmarks hold it to, each with why it is that number
// (docs/development/performance.md). tools/bench/run.ts checks the harness benchmark against them, tools/bench/live.ts
// the real session, tools/bench/statusline.ts the status line. Change a budget here and nowhere else.

/** One budget: its limit, the unit, and why. */
export type Budget = { limit: number; unit: 'ms' | 'ratio' | '%' | 'MB'; why: string }

/** Every budget's name. */
export type BudgetName = 'keystroke' | 'unchangedRow' | 'pane' | 'eventHook' | 'firstDraw' | 'statusline' | 'idleCpu' | 'memoryGrowth' | 'session'

export const BUDGETS: Readonly<Record<BudgetName, Budget>> = {
  keystroke: {
    limit: 2,
    unit: 'ms',
    why: 'One keystroke may cost ghostframe 2 ms of its own work. At 60 Hz a frame is 16.7 ms and Claude Code needs most of it for the composer and the terminal write; 2 ms keeps typing under the ~10 ms where people start to feel echo lag, with room for the engine.'
  },
  unchangedRow: {
    limit: 0.5,
    unit: 'ms',
    why: 'A row drawn again with the same id, width and content must come from a cache, never be laid out again. 0.5 ms is a cache lookup and the tree it returns, with no parsing, wrapping or measuring: 35 such rows on a screen stay under one frame budget of 8 ms with room for the pane.'
  },
  pane: {
    limit: 8,
    unit: 'ms',
    why: 'The whole pane, drawn once, in 8 ms of own time: half a 60 Hz frame, so the pane and the transcript beside it fit in one frame together.'
  },
  eventHook: {
    limit: 5,
    unit: 'ms',
    why: 'Each turn.step and tool.call hook does at most 5 ms of its own work per call. They run on every streamed piece and every tool call; 5 ms keeps a burst of 100 calls under half a second, far inside the engine’s 10 s hook budget, and never lets an event queue behind a slow hook.'
  },
  firstDraw: {
    limit: 300,
    unit: 'ms',
    why: 'From session start to the pane’s first draw within 300 ms, measured from the first prompt the engine draws: under the ~300 ms people read as “instant” for a panel opening beside what they already see.'
  },
  statusline: {
    limit: 50,
    unit: 'ms',
    why: 'One status line run, process start to the last byte, in 50 ms on Windows, where process start is slowest. Claude Code runs it after each message and on a timer; 50 ms keeps it from ever being seen redrawing late.'
  },
  idleCpu: {
    limit: 0.5,
    unit: '%',
    why: 'Idle CPU effectively zero: with nothing changing, ghostframe adds under 0.5% of one core over the ghostframe-off baseline. Any timer that fires while nothing changes shows here.'
  },
  memoryGrowth: {
    limit: 20,
    unit: 'MB',
    why: 'Memory flat over 10 minutes: ghostframe adds under 20 MB of growth, minute 1 to minute 10, over the same session with ghostframe off (Claude Code alone grew 24 MB in that window). The first minute is warm-up. A list without a hard limit grows past it.'
  },
  session: {
    limit: 1.2,
    unit: 'ratio',
    why: 'The whole session (CPU time and wall time of the same scripted work) within 1.2× of the same session with ghostframe off: ghostframe may cost a fifth on top of Claude Code, never more.'
  }
}

/**
 * What a CI runner gets on top of each time budget while the CI job reports only: GitHub's shared runners are 2 to 4
 * vCPUs, often busy, and 2.0–2.8× slower than the desktop these budgets were set on: the plugin's own suite took
 * 51 s here and 104–144 s on CI run 46048184725 (Ubuntu, macOS, Windows). 3× keeps a run that passes here from failing
 * there on noise alone. Ratios, memory and CPU share are not scaled: each is measured against the same runner's own
 * ghostframe-off run.
 */
export const CI_HEADROOM = 3

/**
 * A budget's limit on this machine.
 * @param name the budget
 * @param isCi whether the run is on a CI runner (`CI=true`)
 * @returns the limit, with CI's headroom on time budgets
 */
export function limitOf(name: BudgetName, isCi: boolean): number {
  const b: Budget = BUDGETS[name]

  return isCi && b.unit === 'ms' ? b.limit * CI_HEADROOM : b.limit
}
