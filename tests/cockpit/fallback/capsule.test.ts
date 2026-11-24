import { expect, test } from 'claude-code/testing'

import { capsuleOf } from '../../../hooks/cockpit/fallback/capsule'
import { endLaunched, newLog, newTurn, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import type { Outcome } from '../../../hooks/cockpit/steps/log'
import type { StepLog } from '../../../types'
import { T0, failed } from '../../support/cockpit'
import { must } from '../../support/fallback'

const ok = (result: unknown): Outcome => ({ result, text: '' })
let at = 0
function step(log: StepLog, id: string, tool: string, input: Record<string, unknown>, outcome: Outcome): StepLog {
  at += 2_000
  return settleStep(startStep(log, { id, tool, input, at: T0 + at }), { id, tool, input, outcome, at: T0 + at + 1_000 })
}

/** 20 steps: 6 shell, 5 read, 2 test (the first failing, the second fixing it), 7 of four other kinds. */
function twentySteps(): StepLog {
  at = 0
  let log = newTurn(newLog(null, null), 't1', T0)
  log = step(log, 'f', 'Bash', { command: 'bun test width' }, failed('Exit code 1\n 12 pass\n 2 fail\n'))
  for (let i = 0; i < 6; i++) log = step(log, `s${i}`, 'Bash', { command: `echo ${i}` }, ok({ stdout: 'x', stderr: '' }))
  for (let i = 0; i < 5; i++) log = step(log, `r${i}`, 'Read', { file_path: `f${i}.ts` }, ok({ file: { numLines: 3 } }))
  for (let i = 0; i < 3; i++) log = step(log, `e${i}`, 'Edit', { file_path: `e${i}.ts` }, ok({ structuredPatch: [] }))
  for (let i = 0; i < 2; i++) log = step(log, `g${i}`, 'Grep', { pattern: `p${i}` }, ok({}))
  for (let i = 0; i < 2; i++) log = step(log, `w${i}`, 'Write', { file_path: `w${i}.ts` }, ok({}))
  return step(log, 'p', 'Bash', { command: 'bun test width' }, ok({ stdout: ' 14 pass\n 0 fail\n', stderr: '' }))
}

test('a capsule counts its stretch: steps, its kinds most first, a fixed failure, the turn clock', () => {
  const log = twentySteps()
  const capsule = must(capsuleOf(log.steps, 0, log.steps.length))
  expect(capsule).toMatchObject({ steps: 20, failures: 1, open: 0, agents: 0, clock: 41_000 })
  expect([...capsule.kinds].slice(0, 3)).toEqual([
    ['shell', 6],
    ['read', 5],
    ['edit', 3]
  ])
})

test('a failure nothing fixed stays open; a stretch of no steps has no capsule', () => {
  at = 0
  let log = newTurn(newLog(null, null), 't1', T0)
  log = step(log, 'r', 'Read', { file_path: 'a.ts' }, ok({ file: { numLines: 3 } }))
  log = step(log, 'x', 'Bash', { command: 'false' }, failed('Exit code 1'))
  expect(capsuleOf(log.steps, 0, 2)).toMatchObject({ steps: 2, failures: 1, open: 1, clock: 5_000 })
  expect(capsuleOf(log.steps, 2, 2)).toBeUndefined()
})

test('a launch is one step and its agents are counted apart (amendment 1)', () => {
  at = 0
  let log = newTurn(newLog(null, null), 't1', T0)
  for (const id of ['a1', 'a2', 'a3']) log = startStep(log, { id, tool: 'Agent', input: { description: id }, at: T0 + 1_000 })
  log = endLaunched(endLaunched(endLaunched(log, 'a1', false, T0 + 9_000), 'a2', false, T0 + 9_000), 'a3', true, T0 + 12_000)
  expect(capsuleOf(log.steps, 0, log.steps.length)).toMatchObject({ steps: 1, agents: 3, clock: 12_000 })
})
