import { expect, test } from 'claude-code/testing'

import { newLog, newTurn, startStep } from '../../../hooks/cockpit/steps/log'
import { liveArea } from '../../../hooks/cockpit/rows/live'
import type { RosterAgent } from '../../../types'

// The left's live area under decisions A and B (round 5): it draws nothing of its own while the engine's dialog asks
// (the dialog and the pane's pill say NEEDS YOU), nor while only background agents run after the answer (docked the
// pane head says it, with no pane the band above the prompt).
const agent: RosterAgent = {
  id: 'ag-1',
  call: 'c1',
  parent: null,
  name: 'Audit src',
  isBackground: true,
  state: 'running',
  kind: '',
  subject: '',
  steps: 0,
  startedAt: 0,
  endedAt: null,
  subjectAt: 0,
  pending: null
}

for (const isFallback of [false, true]) {
  test(`B. ${isFallback ? 'fallback' : 'docked'}: a permission dialog up, the left draws no NEEDS YOU row`, () => {
    const log = startStep(newTurn(newLog('t1', 0), 't1', 0), { id: 'r1', tool: 'PowerShell', input: { command: 'Remove-Item a.ts' }, at: 1_000 })

    expect(liveArea({ ...log, asking: ['r1'] }, [], [], 5_000, 0, 200, isFallback)).toEqual([])
  })

  test(`A. ${isFallback ? 'fallback' : 'docked'}: Claude answered and agents still run: the left stays quiet`, () => {
    const log = { ...newTurn(newLog('t1', 0), 't1', 0), isTurnRunning: false }

    expect(liveArea(log, [agent, { ...agent, id: 'ag-2' }], [], 5_000, 0, 200, isFallback)).toEqual([])
  })
}
