import { expect, test } from 'claude-code/testing'

import { planLine, tasksFrame } from '../../hooks/transcript/states'
import { partsWidth } from '../../hooks/shared/parts'
import { TODOS, PLAN } from '../support/states'

test('plan: one dim line, `plan approved · <~-shortened path>`; the path keeps its file name', async () => {
  const path = (p: string) => p.replace(/^C:\/Users\/me/, '~')
  const line = planLine(96, { plan: PLAN, isAgent: false, filePath: 'C:/Users/me/.claude/plans/fix-toast.md' }, path) ?? []
  expect(line.map(p => p.t).join('')).toBe('plan approved · ~/.claude/plans/fix-toast.md')
  expect(line.every(p => p.color === '#4e4e5a')).toBe(true)

  // No plan file: the engine's block.
  expect(planLine(96, { plan: PLAN, isAgent: false }, path)).toBe(undefined)

  for (const width of [96, 50, 30]) {
    const l = planLine(width, { plan: 'x'.repeat(200), isAgent: false, filePath: `/home/me/${'deep/'.repeat(20)}plan.md` }, path) ?? []
    expect(partsWidth(l)).toBeLessThanOrEqual(width)
    expect(l.map(p => p.t).join('')).toMatch(/plan\.md$/)
  }

  expect(planLine(96, { plan: null, isAgent: false }, path)).toBe(undefined)
  expect(planLine(96, { plan: PLAN, isAgent: true, awaitingLeaderApproval: true }, path)).toBe(undefined)
  expect(planLine(96, 'oops', path)).toBe(undefined)
})

test('tasks: done / total, [x] [>] [ ], rail and percent', async () => {
  const lines = tasksFrame(60, TODOS) ?? []
  expect(lines[0]?.some(p => p.t === '1 / 4')).toBe(true)
  expect(lines[1]?.[1]?.t).toBe('[x]  ')
  expect(lines[2]?.some(p => p.t === '  in progress')).toBe(true)
  expect(lines[lines.length - 2]?.some(p => p.t.includes('25%'))).toBe(true)
  expect(tasksFrame(60, { newTodos: [] })).toBe(undefined)
  expect(tasksFrame(60, { newTodos: [{ content: 'x', status: 'weird' }] })).toBe(undefined)
})
