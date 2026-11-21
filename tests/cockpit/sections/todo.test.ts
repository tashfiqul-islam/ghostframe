import { expect, test } from 'claude-code/testing'

import { noteTodo, startTodo, todoRows } from '../../../hooks/cockpit/sections/todo'
import type { Todo } from '../../../hooks/cockpit/sections/todo'
import type { Part } from '../../../hooks/shared/parts'
import { vw } from '../../../hooks/shared/text'
import { C } from '../../../hooks/shared/tokens'

const W = 72
const line = (r: readonly Part[]) => r.map(p => p.t).join('')
const text = (todo: Todo, cap = 3, width = W) => todoRows(todo, width, cap).map(line)
const EMPTY: Todo = { items: [], isRevised: false }
const create = (todo: Todo, id: string, subject: string) => noteTodo(todo, 'TaskCreate', { subject, description: subject }, { task: { id, subject } })
const set = (todo: Todo, taskId: string, status: string) => noteTodo(todo, 'TaskUpdate', { taskId, status }, { success: true, taskId })

test('a to-do list changing across steps: items keep their place, their state changes in place, the label counts', () => {
  let todo = ['Read the spec', 'Write the rows', 'Fit the pane', 'Run the gate'].reduce((t, s, i) => create(t, `${i + 1}`, s), EMPTY)
  expect(text(todo, 5)).toEqual([
    expect.stringMatching(/^┄ \[ TODO \] ┄+ 0 of 4 done$/),
    '  [ ] Read the spec'.padEnd(W),
    '  [ ] Write the rows'.padEnd(W),
    '  [ ] Fit the pane'.padEnd(W),
    '  [ ] Run the gate'.padEnd(W)
  ])

  todo = set(todo, '1', 'in_progress')
  todo = set(todo, '1', 'completed')
  todo = set(todo, '2', 'in_progress')
  const rows = todoRows(todo, W, 5)
  expect(rows.map(line)).toEqual([
    expect.stringMatching(/ 1 of 4 done$/),
    '  [x] Read the spec'.padEnd(W),
    '▸ [>] Write the rows'.padEnd(W),
    '  [ ] Fit the pane'.padEnd(W),
    '  [ ] Run the gate'.padEnd(W)
  ])
  // The item in progress is the brightest row; a done one is dim.
  expect(rows[2]?.find(p => p.t.startsWith('[>]'))?.color).toBe(C.textBright)
  expect(rows[1]?.[0]?.color).toBe(C.dim)
  for (const r of rows) expect(vw(line(r))).toBe(W)

  // TodoWrite names the whole list in another order: known items keep their place.
  const written = noteTodo(
    { items: [], isRevised: false },
    'TodoWrite',
    {
      todos: [
        { content: 'B', status: 'pending', activeForm: 'b' },
        { content: 'A', status: 'in_progress', activeForm: 'a' }
      ]
    },
    {}
  )
  const again = noteTodo(
    written,
    'TodoWrite',
    {
      todos: [
        { content: 'A', status: 'completed', activeForm: 'a' },
        { content: 'B', status: 'in_progress', activeForm: 'b' }
      ]
    },
    {}
  )
  expect(again.items.map(i => [i.text, i.state])).toEqual([
    ['B', 'in_progress'],
    ['A', 'completed']
  ])
  expect(again.isRevised).toBe(false)
})

test('the window: the item before the current one, the current one and what follows; `all N done`; REVISED', () => {
  let todo = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'].reduce((t, s, i) => create(t, `${i}`, s), EMPTY)

  for (const id of ['0', '1', '2', '3']) todo = set(todo, id, 'completed')
  todo = set(todo, '4', 'in_progress')
  expect(text(todo, 3).slice(1)).toEqual(['  [x] four'.padEnd(W), '▸ [>] five'.padEnd(W), '  [ ] six'.padEnd(W)])
  expect(text(todo, 3)[0]).toMatch(/ 4 of 7 done$/)
  // Folded to the current item.
  expect(todoRows(todo, W, 3, 'one').map(line)).toEqual([expect.stringMatching(/TODO/), '▸ [>] five'.padEnd(W)])

  // An item added once work has begun revises the list.
  const revised = create(todo, '9', 'eight')
  expect(text(revised, 3)[0]).toMatch(/^┄ \[ TODO · REVISED \] ┄+ 4 of 8 done$/)
  expect(startTodo(revised).isRevised).toBe(false)

  for (const id of ['4', '5', '6']) todo = set(todo, id, 'completed')
  expect(text(todo, 3)).toEqual([expect.stringMatching(/ 7 of 7 done$/), '  all 7 done'.padEnd(W)])
  // The next turn starts without a list every item of which was done.
  expect(startTodo(todo).items).toEqual([])
  // A deleted item goes.
  expect(set(todo, '0', 'deleted').items.map(i => i.id)).toEqual(['1', '2', '3', '4', '5', '6'])
})
