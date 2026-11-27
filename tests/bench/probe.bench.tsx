// The profiler's own check (tools/perf/probe): run by `bun tools/bench/root.ts tests/bench/probe.bench.tsx`, apart
// from the plugin's suite. It loads the probe above ghostframe, as `prependPlugins` seats it in a session.
import { expect, mock, test } from 'claude-code/testing'

import { register, type HookSummary } from '../../tools/perf/probe/hooks/register'
import type { Engine, On } from '../support/engine'

// The harness prints a test's console to its output; the engine's own lib leaves `console` undeclared.
declare const console: { log: (line: string) => void }

const PROBE = { plugins: [{ name: 'ghostframe-perf', tier: 'prepend', register }] } as const

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

const PERF = { command: 'ghostframe', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } } as const

// Holds the thread for `ms` of wall time: work beneath ghostframe, or inside a `$` call, that is never its own.
const spin = (ms: number): void => {
  const end = performance.now() + ms

  while (performance.now() < end) {
    // busy
  }
}

const start = async ($: Engine, on: On, env: Record<string, string>, beneath: number, inDollar: number): Promise<string[]> => {
  const registered: string[] = []
  mock.env(on, env)
  on('command.register', (_, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => (spin(inDollar), { value: [] }))
  on('session.start', (_, e) => (spin(beneath), { cwd: e.cwd }))
  await $.session.start(START)

  return registered
}

const perfJson = async ($: Engine): Promise<{ elapsedMs: number; hooks: HookSummary[] }> => {
  const said = (await $.command.run({ ...PERF, args: 'perf json' })) as { text?: string }

  return JSON.parse(said.text ?? 'null') as { elapsedMs: number; hooks: HookSummary[] }
}

for (const [beneath, inDollar] of [
  [0, 0],
  [80, 0],
  [0, 60],
  [80, 60]
] as const) {
  test(`own time: ${beneath} ms beneath ghostframe and ${inDollar} ms inside its $ call are never its own`, PROBE, async ($, on) => {
    const registered = await start($, on, { GHOSTFRAME_PERF: '1' }, beneath, inDollar)

    expect(registered).toContain('ghostframe')
    const own = (await perfJson($)).hooks.find(h => h.hook === 'session.start')

    expect(own?.calls).toBe(1)
    expect(own?.overlapped).toBe(0)
    expect(own?.max ?? Infinity).toBeLessThan(20)
    console.log(`BENCH probe ${JSON.stringify({ beneath, inDollar, own: own?.max })}`)
  })
}

test('/ghostframe perf: a table of the slowest hooks; reset empties it', PROBE, async ($, on) => {
  await start($, on, { GHOSTFRAME_PERF: '1' }, 0, 0)
  const text = ((await $.command.run({ ...PERF, args: 'perf' })) as { text?: string }).text ?? ''

  expect(text).toMatch(/p95/)
  expect(text).toMatch(/session\.start/)
  await $.command.run({ ...PERF, args: 'perf reset' })
  expect((await perfJson($)).hooks).toEqual([])
})

test('GHOSTFRAME_PERF unset: the probe registers no command and records nothing', PROBE, async ($, on) => {
  const registered = await start($, on, {}, 0, 0)

  expect(registered).not.toContain('ghostframe')
})
