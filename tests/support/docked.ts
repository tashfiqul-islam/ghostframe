import type { On, Engine } from './engine'
import { T0, VIEW } from './cockpit'
import { respond, rowOf } from './respond'

export const text = (t: string) => ({ type: 'text', text: t })

export const use = (id: string, name: string, input: Record<string, unknown>) => ({ type: 'tool_use', id, name, input })

export const NARRATION = "I'll run the width tests first to see what fails on CI."

export const AGAIN = 'Running the width tests again now that the runner is pinned.'

export const ANSWER = 'Fixed: CI ran an old Bun whose bundled ICU split the skin-tone modifier; the runner is now pinned.'

export type Call = { id: string; tool: string; input: Record<string, unknown>; result: Record<string, unknown>; ms: number }

/** The engine's side of a turn: the clock, the calls' results, and an engine drawing beneath every site. */
export function engine(on: On, calls: readonly Call[], clock: { now: number }) {
  on('clock.now', () => ({ value: clock.now }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('tool.call', (_, e) => {
    const call = calls.find(c => c.id === e.tool_use_id)
    clock.now += call?.ms ?? 1_000

    return (call?.result ?? { result: {} }) as never
  })
}

export const FAIL = { isError: true, text: 'Exit code 1\n 12 pass\n 2 fail\n', result: 'Exit code 1\n 12 pass\n 2 fail\n' }

export const CALLS: Call[] = [
  { id: 't1', tool: 'Bash', input: { command: 'bun test width' }, result: FAIL, ms: 41_000 },
  {
    id: 'e1',
    tool: 'Edit',
    input: { file_path: '.github/workflows/ci.yml' },
    result: { result: { structuredPatch: [{ lines: ['+a', '-b'] }] }, text: 'ok' },
    ms: 2_000
  },
  {
    id: 't2',
    tool: 'Bash',
    input: { command: 'bun test width' },
    result: { result: { stdout: ' 14 pass\n 0 fail\n', stderr: '' }, text: ' 14 pass' },
    ms: 60_000
  }
]

/** One fixed-on-the-second-run turn, as the engine raises it: 2m 44s on Cockpit's clock, 2m 40s on the engine's. */
export async function fixedTurn($: Engine, clock: { now: number }) {
  await $.prompt.submit({ text: 'the width tests fail on CI, fix it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'the width tests fail on CI, fix it', turnId: 't1' })
  await $.session.append(respond([text(NARRATION), use('t1', 'Bash', { command: 'bun test width' })], 'r1'))
  await $.tool.call({ tool: 'Bash', command: 'bun test width', tool_use_id: 't1' } as never)
  await $.session.append(respond([use('e1', 'Edit', { file_path: '.github/workflows/ci.yml' })], 'r2'))
  await $.tool.call({ tool: 'Edit', file_path: '.github/workflows/ci.yml', tool_use_id: 'e1' } as never)
  await $.session.append(respond([text(AGAIN), use('t2', 'Bash', { command: 'bun test width' })], 'r3'))
  await $.tool.call({ tool: 'Bash', command: 'bun test width', tool_use_id: 't2' } as never)
  await $.session.append(respond([text(ANSWER)], 'r4'))
  clock.now = T0 + 164_000
  await $.turn.complete({ answer: ANSWER, durationMs: 160_000, isAborted: false, turnId: 't1', reason: 'answer' })
}

export const message = (t: string) =>
  ({ plugin: 'ghostframe', surface: 'terminal', component: 'AssistantMessage', ...rowOf(t), viewport: VIEW, props: { text: t, isFirstOfReply: true } }) as const
