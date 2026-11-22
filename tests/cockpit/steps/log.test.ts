import { expect, test } from 'claude-code/testing'

import { clearAgentWork, endLaunched, endTurn, newLog, newTurn, noteAgentWork, receiptOf, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import type { StepLog } from '../../../types'

const launch = (ids: readonly string[]): StepLog => {
  let log = newTurn(newLog(null, null), 't1', 0)

  for (const id of ids) log = startStep(log, { id, tool: 'Agent', input: { description: id, prompt: 'x' }, at: 1_000 })

  return log
}
const async = { result: { status: 'async_launched', agentId: 'x', description: 'x' } }
const row = (log: StepLog) => log.steps[0]

test('a background launch: its calls return as they launch, and its agents` reports settle it, `2 done · 1 failed`', () => {
  let log = launch(['c1', 'c2', 'c3'])

  for (const id of ['c1', 'c2', 'c3']) log = settleStep(log, { id, tool: 'Agent', input: {}, outcome: async, at: 2_000 })

  expect(row(log)).toMatchObject({ subject: '3 launched', isRunning: true, result: '' })

  log = endLaunched(log, 'c2', false, 5_000)
  log = endLaunched(log, 'c1', true, 6_000)
  expect(row(log)?.isRunning).toBe(true)

  log = endLaunched(log, 'c3', false, 9_000)
  expect(row(log)).toMatchObject({ isRunning: false, result: '2 done · 1 failed', mark: '', clock: 9_000 })
})

test('a foreground agent is counted once, whether its report or its call`s return says so first', () => {
  let log = launch(['c1'])
  log = endLaunched(log, 'c1', false, 4_000)
  log = settleStep(log, { id: 'c1', tool: 'Agent', input: {}, outcome: { result: { status: 'completed' } }, at: 4_100 })
  expect(row(log)).toMatchObject({ done: 1, failed: 0, result: '1 done' })

  // A call that failed before its agent started counts as failed.
  let denied = launch(['c9'])
  denied = settleStep(denied, { id: 'c9', tool: 'Agent', input: {}, outcome: { deny: 'no' }, at: 2_000 })
  expect(row(denied)?.result).toBe('0 done · 1 failed')
})

test('agents still running when the turn ends: the launch stays running and settles when they report, in a later turn too', () => {
  let log = settleStep(launch(['c1', 'c2']), { id: 'c1', tool: 'Agent', input: {}, outcome: async, at: 2_000 })
  log = settleStep(log, { id: 'c2', tool: 'Agent', input: {}, outcome: async, at: 2_000 })
  log = endTurn(log, 3_000, false, 3_000)
  expect(row(log)).toMatchObject({ isRunning: true, result: '' })

  // Their reports start a turn with no prompt: the launch is that turn's `[ STEPS · TURN 1 ]` and settles there.
  log = newTurn(log, 't2', 4_000)
  log = endLaunched(endLaunched(log, 'c1', false, 5_000), 'c2', false, 6_000)
  expect(log.prev?.steps[0]).toMatchObject({ isRunning: false, result: '2 done' })

  // Interrupted, the launch is cut with the turn.
  const cut = endTurn(launch(['c3']), 3_000, true, 3_000)
  expect(row(cut)).toMatchObject({ isRunning: false, result: 'interrupted' })
})

test('a failed fetch or search is a source problem: ✕ in [ STEPS ], but no open failure, and the turn is done (amendment 6)', () => {
  let log = newTurn(newLog(null, null), 't1', 0)
  log = startStep(log, { id: 'f1', tool: 'WebFetch', input: { url: 'https://httpbin.org/status/404', prompt: 'x' }, at: 1_000 })
  log = settleStep(log, {
    id: 'f1',
    tool: 'WebFetch',
    input: { url: 'https://httpbin.org/status/404', prompt: 'x' },
    outcome: { isError: true, text: 'Request failed with status code 404' },
    at: 2_000
  })
  log = startStep(log, { id: 's1', tool: 'WebSearch', input: { query: 'x' }, at: 2_000 })
  log = settleStep(log, { id: 's1', tool: 'WebSearch', input: { query: 'x' }, outcome: { isError: true, text: 'search failed' }, at: 3_000 })
  log = endTurn(log, 3_000, false, 3_000)

  expect(log.steps.map(s => s.mark)).toEqual(['✕', '✕'])
  expect(log.last?.state).toBe('done')
  expect(receiptOf(log)).toMatchObject({ state: 'done', failures: 0, open: [] })

  // A failing command is still the turn's failure.
  let shell = newTurn(newLog(null, null), 't2', 0)
  shell = startStep(shell, { id: 'b1', tool: 'Bash', input: { command: 'exit 3' }, at: 1_000 })
  shell = settleStep(shell, { id: 'b1', tool: 'Bash', input: { command: 'exit 3' }, outcome: { isError: true, text: 'Exit code 3' }, at: 2_000 })
  shell = endTurn(shell, 2_000, false, 2_000)
  expect(receiptOf(shell)).toMatchObject({ state: 'failed', failures: 1 })
})

test('to-do calls and the engine`s own plumbing draw no [ STEPS ] row: [ TODO ] shows the list', () => {
  let log = newTurn(newLog(null, null), 't1', 0)

  for (const [id, tool] of [
    ['k1', 'TaskCreate'],
    ['k2', 'TaskUpdate'],
    ['k3', 'TodoWrite'],
    ['k4', 'TaskList'],
    ['k5', 'TaskGet'],
    ['k6', 'ToolSearch'],
    ['k7', 'WaitForMcpServers'],
    ['r1', 'Read']
  ] as const) {
    log = startStep(log, { id, tool, input: { file_path: 'a.ts' }, at: 1_000 })
    log = settleStep(log, { id, tool, input: { file_path: 'a.ts' }, outcome: { result: {} }, at: 2_000 })
  }

  expect(log.steps.map(s => s.kind)).toEqual(['read'])
  expect(receiptOf(endTurn(log, 2_000, false, 2_000)).steps).toBe(1)
})

test('a receipt counts the files and pages agents touched since the last receipt, beside the main loop`s; its steps stay the main loop`s (B3)', () => {
  let log = newTurn(newLog(null, null), 't1', 0)
  log = startStep(log, { id: 'e1', tool: 'Edit', input: { file_path: '/repo/a.ts' }, at: 1_000 }, '/repo')
  log = settleStep(log, { id: 'e1', tool: 'Edit', input: { file_path: '/repo/a.ts' }, at: 2_000, outcome: { result: { structuredPatch: [] }, text: 'ok' } })
  const patch = { result: { structuredPatch: [{ lines: ['+x'] }] }, text: 'ok' }
  log = noteAgentWork(log, 'Edit', { file_path: '/repo/a.ts' }, patch, '/repo')
  log = noteAgentWork(log, 'Write', { file_path: '/repo/b.ts' }, patch, '/repo')
  log = noteAgentWork(log, 'Edit', { file_path: '/repo/c.ts' }, { isError: true, text: 'no match' }, '/repo')
  log = noteAgentWork(log, 'WebFetch', { url: 'https://www.Example.com/docs/' }, { isError: true, text: '404' }, '/repo')
  log = noteAgentWork(log, 'Read', { file_path: '/repo/d.ts' }, { text: 'ok' }, '/repo')

  expect(receiptOf(log)).toMatchObject({ steps: 1, files: 2, sources: 1 })

  // A new typed turn carries what no receipt has counted yet.
  expect(receiptOf(newTurn(log, 't2', 9_000))).toMatchObject({ steps: 0, files: 2, sources: 1 })
})

test('a receipt clears only the agents` work it counted: what ended after it waits for the next one', () => {
  const counted = { files: ['a.ts'], pages: ['example.com'] }
  const log = { ...newLog(null, null), agentWork: { files: ['a.ts', 'b.ts'], pages: ['example.com'] } }
  expect(clearAgentWork(log, counted).agentWork).toEqual({ files: ['b.ts'], pages: [] })
  expect(clearAgentWork({ ...log, agentWork: counted }, counted).agentWork).toBeUndefined()
})
