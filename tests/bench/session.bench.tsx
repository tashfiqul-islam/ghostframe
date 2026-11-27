// The long-session benchmark in Claude Code's plugin harness (docs/development/performance.md): the 1,000-row fixture
// (tests/fixtures/long-session.ts) replayed with Cockpit on, its pane docked, and off, at 280 × 70 and 120 × 40, with
// the profiler (tools/perf/probe) above ghostframe. Each phase prints one `BENCH {…}` line: every hook's own time in
// it, and its wall time. It only measures: tools/bench/run.ts holds the numbers to the budgets.
// Run it with `bun tools/bench/run.ts` (or `bun tools/bench/root.ts tests/bench/session.bench.tsx`), never in the
// plugin's suite: it is named *.bench.tsx so `claude plugin test .` leaves it out.
import { mock, test } from 'claude-code/testing'

import { paneColumns } from '../../hooks/cockpit/seat'
import { register, type HookSummary } from '../../tools/perf/probe/hooks/register'
import * as long from '../fixtures/long-session'
import { PANE } from '../support/cockpit'
import type { Engine } from '../support/engine'
import { blockRow, liveEngine, liveTurn, type Recorded } from '../support/live'

// The harness prints a test's console to its output; the engine's own lib leaves `console` undeclared.
declare const console: { log: (line: string) => void }

const REC: Recorded = { turns: long.TURNS, agents: long.AGENTS }

const CONFIGS = [
  { name: 'on-280x70', cockpit: true, columns: 280, rows: 70 },
  { name: 'on-120x40', cockpit: true, columns: 120, rows: 40 },
  { name: 'off-280x70', cockpit: false, columns: 280, rows: 70 },
  { name: 'off-120x40', cockpit: false, columns: 120, rows: 40 }
] as const

type Config = (typeof CONFIGS)[number]
type Site = Parameters<Engine['ui']['mount']>[0]
type Mounted = Awaited<ReturnType<Engine['ui']['mount']>>

/** The pieces each streamed response arrives in. */
const STEP_CHUNKS = 100

const PERF = { command: 'ghostframe', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } } as const

const perf = async ($: Engine, args: string): Promise<string> => ((await $.command.run({ ...PERF, args })) as { text?: string }).text ?? ''

/** Prints one phase's numbers: every hook's own time since the last reset, and the phase's wall time. */
async function phase($: Engine, config: Config, name: string, started: number, extra: Record<string, number> = {}): Promise<void> {
  const wallMs = performance.now() - started
  const { hooks } = JSON.parse(await perf($, 'perf json')) as { hooks: HookSummary[] }

  console.log(`BENCH ${JSON.stringify({ config: config.name, phase: name, wallMs, ...extra, hooks })}`)
  await perf($, 'perf reset')
}

/** A run of wall times as its p50, p95 and max, under the given prefix. */
const spread = (prefix: string, ms: readonly number[]): Record<string, number> => {
  const sorted = ms.toSorted((a, b) => a - b)
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? 0

  return { [`${prefix}P50`]: at(0.5), [`${prefix}P95`]: at(0.95), [`${prefix}Max`]: sorted.at(-1) ?? 0 }
}

/** Every transcript row of the session as the engine raises it: prompts, blocks, tool rows and agent rows. */
function rowsOf(config: Config, transcript: number): Site[] {
  const viewport = { columns: transcript, rows: config.rows, isFullscreen: true }
  const site = (component: string, requestId: string, props: Record<string, unknown>): Site =>
    ({ plugin: 'ghostframe', surface: 'terminal', component, requestId, viewport, props }) as never
  const rows: Site[] = []

  for (const [n, t] of Object.entries(REC.turns)) {
    rows.push(site('UserMessage', t.row, { text: t.prompt, origin: { kind: 'composer' }, isExpanded: false }))
    const first = t.events.find(e => e.k === 'text')

    for (const e of t.events) {
      if (e.k === 'text') {
        const text = String(e['text'])

        rows.push(site('AssistantMessage', blockRow(Number(n), text, REC), { text, isFirstOfReply: first === e }))
      }
      if (e.k === 'call') {
        const id = String(e['id'])
        const call = { tool_use_id: id, tool: String(e['tool']), input: e['input'], isRunning: false, isErrored: false, isInterrupted: false, output: {} }

        rows.push(
          e['tool'] === 'Agent'
            ? site('AgentRow', id, {
                id,
                description: 'review',
                type: 'general-purpose',
                status: 'completed',
                taskStatus: 'completed',
                rowIds: [id],
                isHidden: false
              })
            : site('ToolGroup', `g-${id}`, { calls: [call], isActive: false, isExpanded: false, isCallsOnly: true })
        )
      }
    }
  }

  return rows
}

for (const config of CONFIGS) {
  test(
    `bench: the long session, ${config.name}`,
    { options: { cockpit: config.cockpit }, timeoutMs: 600_000, plugins: [{ name: 'ghostframe-perf', tier: 'prepend', register }] },
    async ($, on) => {
      const clock = { now: 0 }
      mock.env(on, { GHOSTFRAME_PERF: '1' })
      mock.store(on)
      liveEngine(on, clock, true, REC)
      on('session.id', () => ({ value: 'bench-session' }))
      // A model response as the engine streams it: some thinking, then the answer in small pieces.
      on('turn.step', async function* (_, e) {
        for (let i = 0; i < STEP_CHUNKS; i++) yield i < 10 ? { kind: 'thinking', index: 0, text: 'hm ' } : { kind: 'text', index: 1, text: 'the width check ' }
        return { turnId: e.turnId, index: 0, answer: 'done', toolUses: [], stopReason: 'end_turn', usage: null } as never
      })
      const body = paneColumns(config.columns)
      const transcript = config.cockpit ? config.columns - body - 1 : config.columns
      const pane = {
        ...PANE,
        props: { ...PANE.props, bodyColumns: body, scroll: { offset: 0, bodyRows: config.rows - 8, contentRows: config.rows - 8 } },
        viewport: { columns: transcript, rows: config.rows, isFullscreen: true }
      }

      let t = performance.now()
      await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
      if (config.cockpit)
        await $.command.run({ command: 'cockpit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: config.columns } })
      await phase($, config, 'start', t)

      // Streaming: each turn's prompt, blocks, calls and agents as the engine raises them. The first 40 turns with
      // nothing mounted, so every event hook runs alone and its own time is its own; the last 10 with the pane
      // mounted, as docked, where each change redraws it beside the event.
      const turns = Object.keys(REC.turns).map(Number)
      t = performance.now()
      for (const n of turns.slice(0, 40)) await liveTurn($, clock, n, config.columns, REC)
      await phase($, config, 'stream', t)

      t = performance.now()
      const paneUi = config.cockpit ? await $.ui.mount(pane) : undefined
      for (const n of turns.slice(40)) await liveTurn($, clock, n, config.columns, REC)
      await phase($, config, 'stream-docked', t)

      // A streamed model response: 10 turns of STEP_CHUNKS pieces each, through every turn.step hook.
      t = performance.now()
      for (let i = 0; i < 10; i++) {
        await $.turn.start({ text: `stream ${i}`, turnId: `s${i}` })
        for await (const _ of $.turn.step({ turnId: `s${i}`, index: 0, model: 'm', messageCount: 1 })) {
          // drain, as the engine does
        }
        await $.turn.complete({ answer: 'done', durationMs: 1_000, isAborted: false, turnId: `s${i}`, reason: 'answer' })
      }
      await phase($, config, 'turn-step', t, { chunks: STEP_CHUNKS })

      // Every row's first draw, one mounted at a time (with all 1,000 mounted, each invalidate would redraw every one of
      // them at once). Then every row again, unchanged: the same id, width and text, so each must be served from a cache.
      const rows = rowsOf(config, transcript)

      for (const name of ['first-draw', 'redraw-unchanged']) {
        const ms: number[] = []

        await perf($, 'perf reset')
        for (const r of rows) {
          const f = performance.now()

          await (await $.ui.mount(r)).unmount()
          ms.push(performance.now() - f)
        }
        await phase($, config, name, performance.now(), { rows: rows.length, ...spread('row', ms) })
      }

      // One frame: the rows a screen holds (a row of the transcript is at least two lines) and the pane, each drawn again
      // in turn, so each hook's own time is its own.
      const onScreen: Mounted[] = []

      for (const r of rows.slice(-Math.ceil(config.rows / 2))) onScreen.push(await $.ui.mount(r))
      const frames: number[] = []

      await perf($, 'perf reset')
      for (let i = 0; i < 20; i++) {
        const f = performance.now()

        for (const m of [...onScreen, ...(paneUi === undefined ? [] : [paneUi])]) await m.redraw()
        frames.push(performance.now() - f)
      }
      await phase($, config, 'frame', performance.now(), { rows: onScreen.length, ...spread('frame', frames) })
      for (const m of onScreen) await m.unmount()

      // The pane alone, 50 draws: the whole pane's own time per draw.
      t = performance.now()
      if (paneUi !== undefined) for (let i = 0; i < 50; i++) await paneUi.redraw()
      await phase($, config, 'pane', t)

      // A keystroke: what the prompt's line redraws on each key (the band above it and the hint).
      const band = await $.ui.mount({
        plugin: 'ghostframe',
        surface: 'terminal',
        component: 'AbovePrompt',
        requestId: 'band',
        viewport: pane.viewport,
        props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10 }
      } as never)
      const hint = await $.ui.mount({
        plugin: 'ghostframe',
        surface: 'terminal',
        component: 'PromptHint',
        viewport: pane.viewport,
        props: { isDraft: true, isWorking: false, hint: '? for shortcuts' }
      } as never)
      await perf($, 'perf reset')
      t = performance.now()
      for (let i = 0; i < 100; i++) {
        await band.redraw()
        await hint.redraw()
      }
      await phase($, config, 'keystroke', t, { keys: 100 })

      for (const m of [band, hint, ...(paneUi === undefined ? [] : [paneUi])]) await m.unmount()
    }
  )
}
