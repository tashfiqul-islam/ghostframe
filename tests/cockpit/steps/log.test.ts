import { expect, test } from 'claude-code/testing'

import { endLaunched, endTurn, newLog, newTurn, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
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
