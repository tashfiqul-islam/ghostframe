// A realistic kept turn, for the history tests and for measuring what a session's history weighs in the store.
import { recordOf } from '../../hooks/cockpit/history/record'
import { newLog, newTurn } from '../../hooks/cockpit/steps/log'
import type { LogStep, StepDetail, TurnRecord } from '../../types'
import type { Engine, On } from './engine'

/** A realistic typed turn: 20 steps, 3 files, 5 pages, each step's detail with 10 output rows, 40-row patches. */
export function aTurn(turnNo: number, startedAt: number): TurnRecord {
  const steps: LogStep[] = Array.from({ length: 20 }, (_, i) => ({
    id: `t${turnNo}s${i}`,
    kind: i % 4 === 0 ? 'edit' : 'shell',
    subject: `hooks/cockpit/some/long/path/module-${i}.ts --with --some --flags ${'x'.repeat(40)}`,
    key: `k${i}`,
    result: i % 4 === 0 ? '+12 −3' : '1.2 kB',
    mark: '',
    isRunning: false,
    clock: i * 3_000
  }))
  const details: StepDetail[] = steps.map(s => ({
    id: s.id,
    tool: s.kind === 'edit' ? 'Edit' : 'Bash',
    command: s.subject,
    startAt: startedAt,
    ms: 1_200,
    isFailed: false,
    lines: 120,
    excerpt: Array.from({ length: 10 }, (_, i) => `output row ${i} ${'y'.repeat(80)}`),
    patch: s.kind === 'edit' ? Array.from({ length: 40 }, (_, i) => `${i % 2 === 0 ? '+' : '-'}changed line ${i} ${'z'.repeat(60)}`) : []
  }))
  const log = { ...newTurn(newLog(null, null), `e${turnNo}`, startedAt), turnNo, steps, workedMs: 90_000 }

  return recordOf({
    log,
    work: {
      todo: [],
      isRevised: false,
      files: [0, 1, 2].map(i => ({ path: `hooks/file-${i}.ts`, tag: '', adds: 12, dels: 3 })),
      sources: [0, 1, 2, 3, 4].map(i => ({ url: `https://docs.example.com/page/${i}`, title: `Page ${i}`, status: '200' })),
      cited: []
    },
    roster: [],
    receipts: [],
    details,
    diffs: [0, 1, 2].map(i => ({ path: `hooks/file-${i}.ts`, patch: Array.from({ length: 30 }, (_, j) => `+line ${j} ${'w'.repeat(60)}`) }))
  })
}

/**
 * Answers `session.end` as the engine's end step does; a test that calls `endSession` registers it with its hooks.
 * @param on the test's `on`
 */
export function answerSessionEnd(on: On): void {
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
}

/**
 * Ends the session as an exit does: Cockpit writes the turns it kept to the store at its end (it writes them once
 * the session is quiet otherwise, and a test's timers never fire), so the store holds every one of them after this.
 * The test answers `session.end` (`answerSessionEnd`).
 * @param $ the test's engine
 */
export async function endSession($: Engine): Promise<void> {
  await $.session.end({ reason: 'other', sessionId: 'ended', resume: {} } as never)
}
