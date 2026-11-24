import { expect, test } from 'claude-code/testing'

import { noteTodo, startTodo } from '../../../hooks/cockpit/sections/todo'
import type { Todo } from '../../../hooks/cockpit/sections/todo'

const EMPTY: Todo = { items: [], isRevised: false }
const states = (todo: Todo) => todo.items.map(i => [i.text, i.state])
const create = (todo: Todo, id: string, subject: string) => noteTodo(todo, 'TaskCreate', { subject, description: subject }, { task: { id, subject } })
const set = (todo: Todo, taskId: string, status: string) => noteTodo(todo, 'TaskUpdate', { taskId, status }, { success: true, taskId })

test('a to-do list changing across steps: items keep their place, their state changes in place', () => {
  let todo = ['Read the spec', 'Write the rows', 'Fit the pane', 'Run the gate'].reduce((t, s, i) => create(t, `${i + 1}`, s), EMPTY)
  expect(states(todo)).toEqual([
    ['Read the spec', 'pending'],
    ['Write the rows', 'pending'],
    ['Fit the pane', 'pending'],
    ['Run the gate', 'pending']
  ])

  todo = set(todo, '1', 'in_progress')
  todo = set(todo, '1', 'completed')
  todo = set(todo, '2', 'in_progress')
  expect(states(todo)).toEqual([
    ['Read the spec', 'completed'],
    ['Write the rows', 'in_progress'],
    ['Fit the pane', 'pending'],
    ['Run the gate', 'pending']
  ])

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

test('REVISED, a finished list gone at the next turn, a deleted item gone', () => {
  let todo = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'].reduce((t, s, i) => create(t, `${i}`, s), EMPTY)

  for (const id of ['0', '1', '2', '3']) todo = set(todo, id, 'completed')
  todo = set(todo, '4', 'in_progress')

  // An item added once work has begun revises the list.
  const revised = create(todo, '9', 'eight')
  expect(revised.isRevised).toBe(true)
  expect(revised.items).toHaveLength(8)
  expect(startTodo(revised).isRevised).toBe(false)

  for (const id of ['4', '5', '6']) todo = set(todo, id, 'completed')
  expect(todo.items.every(i => i.state === 'completed')).toBe(true)
  // The next turn starts without a list every item of which was done.
  expect(startTodo(todo).items).toEqual([])
  // A deleted item goes.
  expect(set(todo, '0', 'deleted').items.map(i => i.id)).toEqual(['1', '2', '3', '4', '5', '6'])
})
