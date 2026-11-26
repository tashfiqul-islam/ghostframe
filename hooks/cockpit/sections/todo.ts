// Cockpit's `[ TODO ]` (spec E.41): the session's to-do list from TodoWrite, TaskCreate and TaskUpdate, its items
// in the order they first appeared and changed in place. Pure: hooks/cockpit/work.ts keeps the list and
// hooks/cockpit/rows/views.ts draws it.
import type { TodoItem } from '../../../types'
import { obj, s } from '../../shared/calls/fields'

/** The list and whether it was revised. */
export type Todo = { items: TodoItem[]; isRevised: boolean }

const STATES: readonly TodoItem['state'][] = ['pending', 'in_progress', 'completed']
const stateOf = (v: unknown): TodoItem['state'] | undefined => STATES.find(state => state === v)
const hasBegun = (items: readonly TodoItem[]) => items.some(i => i.state !== 'pending')

/**
 * A to-do call succeeded: the list it leaves. TodoWrite names the whole list (an item known by its text keeps its
 * place; a new one goes last); TaskCreate adds an item, its id from the result; TaskUpdate changes one in place, or
 * removes it (`deleted`). Items added or removed once work has begun revise the list (`REVISED`, E.41).
 * @param todo the list before the call
 * @param tool the call's tool
 * @param input the call's input
 * @param result the call's record
 * @returns the list after it; the same list for any other tool
 */
export function noteTodo(todo: Todo, tool: string, input: unknown, result: unknown): Todo {
  const i = obj(input) ?? {}

  if (tool === 'TodoWrite') {
    const listed = (Array.isArray(i['todos']) ? i['todos'] : []).flatMap(t => {
      const text = s(obj(t)?.['content'])
      const state = stateOf(obj(t)?.['status'])

      return text === undefined || state === undefined ? [] : [{ text, state }]
    })
    const kept = todo.items.flatMap(item => {
      const now = listed.find(l => l.text === item.text)

      return now === undefined ? [] : [{ ...item, state: now.state }]
    })
    const added = listed.filter(l => !todo.items.some(item => item.text === l.text)).map((l, n) => ({ id: `w${todo.items.length + n}`, ...l }))
    const isChanged = kept.length !== todo.items.length || added.length > 0

    return { items: [...kept, ...added], isRevised: todo.isRevised || (isChanged && hasBegun(todo.items)) }
  }

  if (tool === 'TaskCreate') {
    const id = s(obj(obj(result)?.['task'])?.['id'])
    const text = s(i['subject'])

    if (id === undefined || text === undefined) return todo

    return { items: [...todo.items, { id, text, state: 'pending' }], isRevised: todo.isRevised || hasBegun(todo.items) }
  }

  if (tool === 'TaskUpdate') {
    const id = s(i['taskId'])
    const status = i['status']

    if (id === undefined || !todo.items.some(item => item.id === id)) return todo
    if (status === 'deleted') return { items: todo.items.filter(item => item.id !== id), isRevised: todo.isRevised || hasBegun(todo.items) }

    const text = s(i['subject'])
    const state = stateOf(status)

    return {
      ...todo,
      items: todo.items.map(item => (item.id === id ? { ...item, ...(text === undefined ? {} : { text }), ...(state === undefined ? {} : { state }) } : item))
    }
  }

  return todo
}

/** A typed turn starts: a list every item of which is done is gone; any other stays, no longer revised. */
export const startTodo = (todo: Todo): Todo => ({ items: todo.items.every(i => i.state === 'completed') ? [] : todo.items, isRevised: false })
