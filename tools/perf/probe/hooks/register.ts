// ghostframe-perf, the profiler (docs/development/performance.md). A mod of its own, loaded only to profile: listed
// in `prependPlugins` it sits in the `prepend` tier, above ghostframe, and with GHOSTFRAME_PERF=1 its one `*` hook
// times every dispatch ghostframe takes part in. The engine's `next.trace` gives ghostframe's link its own wall time
// with its `next()` calls taken out; the probe takes out the `$` calls too, each of which it sees as a dispatch whose
// `next.origin` is ghostframe. `/ghostframe perf` lists the ten slowest hooks. ghostframe itself is unchanged, so
// with the probe not loaded, profiling costs nothing.
//
// Everything lives inside `register`: the benchmarks load this same function as an inline plugin, which the test
// harness runs on its own, closed over nothing of its file.
import type { Register } from 'claude-code'

/**
 * One hook's numbers, in ms of own time. `overlapped`: calls that had another dispatch open beside or inside them;
 * their `$` calls are counted against the innermost one, so their times are a close estimate, not exact.
 */
export type HookSummary = {
  hook: string
  calls: number
  perSec: number
  p50: number
  p95: number
  max: number
  total: number
  overlapped: number
  /** Every own time kept (at most SAMPLES_MAX, the latest), in ms to the microsecond: what a comparison resamples. */
  samples: number[]
}

export const register: Register = on => {
  const PLUGIN = 'ghostframe'
  const COMMAND = 'ghostframe'
  // How many of a hook's latest own times are kept for its percentiles: a hard cap, so memory stays flat.
  const SAMPLES_MAX = 4096
  const TOP = 10

  type Record = { calls: number; own: number[]; at: number; total: number; max: number; overlapped: number }
  type Dispatch = { dollar: number; isOverlapped: boolean }

  let isOn = false
  let since = performance.now()
  const hooks = new Map<string, Record>()
  // The dispatches in flight that ghostframe may take part in, in the order they opened, each with the `$` time its
  // hooks spent so far. One the engine raises inside another's `next()` (a `tool.check` inside its `tool.call`) is the
  // innermost, and the `$` calls made while it is open are its own.
  const open: Dispatch[] = []

  const note = (hook: string, own: number, isOverlapped: boolean): void => {
    let r = hooks.get(hook)

    if (r === undefined) {
      r = { calls: 0, own: [], at: 0, total: 0, max: 0, overlapped: 0 }
      hooks.set(hook, r)
    }
    r.calls += 1
    r.overlapped += isOverlapped ? 1 : 0
    r.total += own
    r.max = Math.max(r.max, own)
    r.own[r.at] = own
    r.at = (r.at + 1) % SAMPLES_MAX
  }

  // Nearest rank over sorted samples.
  const quantile = (sorted: readonly number[], q: number): number =>
    sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? 0)

  const summaries = (): { elapsedMs: number; hooks: HookSummary[] } => {
    const elapsedMs = performance.now() - since
    const list = [...hooks].map(([hook, r]): HookSummary => {
      const sorted = r.own.toSorted((a, b) => a - b)

      return {
        hook,
        calls: r.calls,
        perSec: elapsedMs > 0 ? r.calls / (elapsedMs / 1000) : 0,
        p50: quantile(sorted, 0.5),
        p95: quantile(sorted, 0.95),
        max: r.max,
        total: r.total,
        overlapped: r.overlapped,
        samples: r.own.map(n => Math.round(n * 1000) / 1000)
      }
    })

    return { elapsedMs, hooks: list }
  }

  const fixed = (n: number, digits = 2): string => n.toFixed(digits).padStart(8)

  // The ten slowest hooks by p95, then max.
  const reportText = (list: readonly HookSummary[], elapsedMs: number): string => {
    const top = list.toSorted((a, b) => b.p95 - a.p95 || b.max - a.max).slice(0, TOP)
    const width = Math.max(4, ...top.map(h => h.hook.length))
    const head = ['hook'.padEnd(width), ...['calls', '/s', 'p50', 'p95', 'max', 'total'].map(c => c.padStart(8))].join('  ')
    const rows = top.map(h =>
      [h.hook.padEnd(width), String(h.calls).padStart(8), fixed(h.perSec, 1), fixed(h.p50), fixed(h.p95), fixed(h.max), fixed(h.total, 1)].join('  ')
    )
    const overlapped = list.reduce((n, h) => n + h.overlapped, 0)
    const foot = overlapped === 0 ? [] : [`${overlapped} calls had another dispatch open beside them: their times are close estimates`]

    return [`ghostframe perf · own time per hook in ms, over ${(elapsedMs / 1000).toFixed(1)} s`, head, ...rows, ...foot].join('\n')
  }

  const answer = (args: string): string => {
    const words = args.trim().split(/\s+/)

    if (words[0] !== 'perf') return 'usage: /ghostframe perf | perf json | perf reset | perf save <file>'
    if (words[1] === 'reset') {
      hooks.clear()
      open.length = 0
      since = performance.now()

      return 'ghostframe perf: counts reset'
    }
    const { elapsedMs, hooks: list } = summaries()

    return words[1] === 'json' ? JSON.stringify({ elapsedMs, hooks: list }) : reportText(list, elapsedMs)
  }

  // A hook's label: its event, and for the events ghostframe hooks per component, command or tool, that name.
  const labelOf = (event: string, e: unknown): string => {
    const pick = (k: string): unknown => (typeof e === 'object' && e !== null ? Reflect.get(e, k) : undefined)
    const name = event === 'ui.render' ? pick('component') : event === 'command.run' ? pick('command') : event.startsWith('tool.') ? pick('tool') : undefined

    return typeof name === 'string' ? `${event} ${name}` : event
  }

  on('*', async ($, e, next) => {
    if (next.is('session.start', e)) {
      isOn = ((await $.env.get('GHOSTFRAME_PERF')) ?? '') === '1'
      hooks.clear()
      since = performance.now()
      if (isOn) {
        await $.command.register({ name: COMMAND, description: 'ghostframe’s profiler', argumentHint: 'perf | perf json | perf reset | perf save <file>' })
      }
    }
    if (!isOn) return next(e)
    if (next.is('command.run', e) && e.command === COMMAND) {
      const save = /^perf save (.+)$/.exec(e.args.trim())?.[1]

      // `perf save <file>`: every hook's numbers as JSON in a file, for a script to read (tools/bench/live.ts).
      if (save === undefined) return { text: answer(e.args) }
      await $.fs.write(save, JSON.stringify(summaries()))

      return { text: `ghostframe perf: saved to ${save}` }
    }

    const t0 = performance.now()

    // A timer ghostframe set (`$.clock.after`, `$.clock.every`): its dispatch stays open until the timer is due, beside
    // the hook that set it and after, which never waits on it. It is no time of any hook's, and opens no overlap.
    if (next.origin.plugin === PLUGIN && (next.event === 'clock.after' || next.event === 'clock.every')) return next(e)

    // One of ghostframe's own `$` calls: its time comes out of the innermost dispatch open.
    if (next.origin.plugin === PLUGIN) {
      try {
        return await next(e)
      } finally {
        const innermost = open.at(-1)

        if (innermost !== undefined) innermost.dollar += performance.now() - t0
        if (open.length > 1) for (const d of open) d.isOverlapped = true
      }
    }

    const mine: Dispatch = { dollar: 0, isOverlapped: false }

    open.push(mine)
    try {
      return await next(e)
    } finally {
      open.splice(open.indexOf(mine), 1)
      const link = next.trace.find(t => t.plugin === PLUGIN)

      if (link !== undefined) note(labelOf(next.event, e), Math.max(0, link.ms - mine.dollar), mine.isOverlapped)
    }
  })
}
