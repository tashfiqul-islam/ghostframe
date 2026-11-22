import { expect, test } from 'claude-code/testing'

import { capsuleOf, capsuleRow } from '../../../hooks/cockpit/fallback/capsule'
import { endLaunched, newLog, newTurn, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import type { Outcome } from '../../../hooks/cockpit/steps/log'
import { vw } from '../../../hooks/shared/text'
import type { StepLog } from '../../../types'
import { T0, failed } from '../../support/cockpit'
import { must } from '../../support/fallback'

const ok = (result: unknown): Outcome => ({ result, text: '' })
const text = (parts: { t: string }[]) => parts.map(p => p.t).join('')
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

test('a capsule counts its stretch: steps, the three biggest kinds and `+n` for the rest, a fixed failure, the turn clock', () => {
  const log = twentySteps()
  const capsule = capsuleOf(log.steps, 0, log.steps.length)
  expect(capsule).toMatchObject({ steps: 20, failures: 1, open: 0, agents: 0 })

  const row = text(capsuleRow(must(capsule), 79))
  expect(row).toMatch(/^│ worked · 20 steps · 6 shell · 5 read · 3 edit \+6 · 1 failure → fixed +41s$/)
  expect(vw(row)).toBe(79)
})

test('narrow, the kinds give way first: two below 72 columns, then fewer; below 60 the clock goes; the story stays', () => {
  const log = twentySteps()
  const capsule = must(capsuleOf(log.steps, 0, log.steps.length))

  expect(text(capsuleRow(capsule, 70))).toMatch(/^│ worked · 20 steps · 6 shell · 5 read \+9 · 1 failure → fixed +41s$/)
  expect(text(capsuleRow(capsule, 50))).toBe('│ worked · 20 steps · 1 failure → fixed')
})

test('a failure nothing fixed is the story in its own words; a stretch of no steps has no capsule', () => {
  at = 0
  let log = newTurn(newLog(null, null), 't1', T0)
  log = step(log, 'r', 'Read', { file_path: 'a.ts' }, ok({ file: { numLines: 3 } }))
  log = step(log, 'x', 'Bash', { command: 'false' }, failed('Exit code 1'))
  const capsule = capsuleOf(log.steps, 0, 2)
  expect(capsule).toMatchObject({ failures: 1, open: 1 })
  const parts = capsuleRow(must(capsule), 79)
  expect(text(parts)).toMatch(/^│ worked · 2 steps · 1 read · 1 shell · 1 failure +5s$/)
  // The story is the only coloured field.
  expect(parts.find(p => p.t === '1 failure')?.color).toBe('#ec84a0')
  expect(capsuleOf(log.steps, 2, 2)).toBeUndefined()
})

test('a launch is one step and its agents are counted apart: `1 step · 3 agents · 1 agent failed` (amendment 1)', () => {
  at = 0
  let log = newTurn(newLog(null, null), 't1', T0)
  for (const id of ['a1', 'a2', 'a3']) log = startStep(log, { id, tool: 'Agent', input: { description: id }, at: T0 + 1_000 })
  log = endLaunched(endLaunched(endLaunched(log, 'a1', false, T0 + 9_000), 'a2', false, T0 + 9_000), 'a3', true, T0 + 12_000)
  const capsule = must(capsuleOf(log.steps, 0, log.steps.length))
  expect(text(capsuleRow(capsule, 79))).toMatch(/^│ worked · 1 step · 3 agents · 1 agent failed +12s$/)
})
