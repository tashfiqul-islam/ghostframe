import { expect, test } from 'claude-code/testing'

import { LEAD, stepOf } from '../../../hooks/transcript/activity/steps'
import type { Step } from '../../../hooks/transcript/activity/steps'
import { foldOutput, layoutStep } from '../../../hooks/transcript/activity/row'
import { vw } from '../../../hooks/shared/text'
import { INSET } from '../../../hooks/shared/layout'
import { OK } from '../../support/step'
import { WIDTHS } from '../../support/narrow'

const rowWidth = (step: Step, time: string, width: number) => {
  const l = layoutStep(step, time, width)
  return 2 + vw(l.verb) + vw(l.target) + vw(l.gap) + vw(step.result.map(r => r.text).join(' ')) + vw(l.timeCell)
}

test('every step row is exactly the measure wide', async () => {
  const long = stepOf('Read', { file_path: 'src/' + 'deep/'.repeat(40) + 'file.ts' }, { type: 'text', file: { numLines: 9 } }, OK)
  const fail = stepOf('Bash', { command: 'x'.repeat(300) }, 'Exit code 128', { ...OK, isErrored: true })

  for (const step of [long, fail]) {
    if (step === undefined) throw new Error('no step')
    for (const width of [96, 70, 40]) for (const time of ['0.1s', '41s', '']) expect(rowWidth(step, time, width)).toBe(width)
  }

  expect(layoutStep(long as Step, '0.1s', 60).target).toContain('…')
})

test('shell output folds: first 2, a fold, the last', async () => {
  expect(foldOutput('a\nb')).toEqual({ lines: ['a', 'b'], more: 0 })
  expect(foldOutput('1\n2\n3\n4\n5\n6')).toEqual({ lines: ['1', '2'], more: 3, last: '6' })
  expect(foldOutput('   ')).toBe(undefined)
  expect(LEAD).toBe(10)
})

test('narrow step rows: verb and target, result and time right; the time goes before the target clips', async () => {
  const step = stepOf(
    'Bash',
    { command: 'claude plugin test .', description: 'Run the plugin tests for the ghostframe mod' },
    { stdout: ' 56 pass\n 0 fail', stderr: '' },
    OK
  )
  if (step === undefined) throw new Error('no step')
  for (const c of WIDTHS) {
    const w = c - INSET
    const l = layoutStep(step, '1m 12s', w)
    expect(2 + vw(l.verb) + vw(l.target) + vw(l.gap) + vw('56 pass') + vw(l.timeCell)).toBe(w)
  }
  expect(layoutStep(step, '1m 12s', 88).timeCell).toMatch(/1m 12s$/)
  const tight = layoutStep(step, '1m 12s', 34)
  expect(tight.timeCell).toBe('') // dropped first
  expect(tight.target.length).toBeGreaterThan(0)
})
