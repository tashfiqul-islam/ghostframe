import type { TestBody } from 'claude-code/testing'

export type Engine = Parameters<TestBody>[0]

export type On = Parameters<TestBody>[1]

export type Found = { props: Record<string, unknown>; text: string }

export const engine = (on: On) => on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

export const engineText = ($: { ui: { resolve: (e: never) => { Text: (p: { children: string }) => unknown } } }, e: never) =>
  $.ui.resolve(e).Text({ children: 'engine' })
