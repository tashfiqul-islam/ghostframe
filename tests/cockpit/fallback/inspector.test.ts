import { expect, test } from 'claude-code/testing'

import { inspectorLines } from '../../../hooks/cockpit/fallback/inspector'
import { newLog, newTurn, settleStep, startStep } from '../../../hooks/cockpit/steps/log'
import type { StepLog, TurnRecord } from '../../../types'
import { T0 } from '../../support/cockpit'

const W = 98
const text = (log: StepLog, rows: number, pinned?: TurnRecord) => inspectorLines(log, W, rows, pinned).map(l => l.parts.map(p => p.t).join(''))

function turnOf(n: number): StepLog {
  let log = newTurn(newLog(null, null), 't1', T0)
  for (let i = 0; i < n; i++) {
    const input = { file_path: `f${i}.ts` }
    log = settleStep(startStep(log, { id: `r${i}`, tool: 'Read', input, at: T0 + i * 1_000 }), {
      id: `r${i}`,
      tool: 'Read',
      input,
      outcome: { result: { file: { numLines: 3 } }, text: '' },
      at: T0 + i * 1_000 + 500
    })
  }
  return log
}

test('the inspector is one section across the terminal: `[ STEPS · TURN n ]`, fitted to the rows given', () => {
  const rows = text(turnOf(20), 12)
  expect(rows).toHaveLength(12)
  expect(rows[0]).toMatch(/^┄ \[ STEPS · TURN 1 \] ┄+ 20 steps$/)
  expect(rows[1]).toMatch(/^ {2}… 10 earlier/)
  for (const row of rows) expect(row.length).toBe(W)
})

test('pinned: `[ STEPS · TURN n · PINNED ]` with the turn`s time; a turn with no steps still shows its label', () => {
  const kept = turnOf(3)
  const record = { turnNo: 2, steps: kept.steps, dropped: 0, durationMs: 164_000 } as unknown as TurnRecord
  expect(text(turnOf(1), 12, record)[0]).toMatch(/^┄ \[ STEPS · TURN 2 · PINNED \] ┄+ 3 steps · 2m 44s$/)
  expect(text(turnOf(0), 12)).toEqual([expect.stringMatching(/^┄ \[ STEPS · TURN 1 \] ┄+ 0 steps$/)])
})
