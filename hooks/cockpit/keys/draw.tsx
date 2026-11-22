// The pane's tree with its keys (spec E.44): each openable row a Button (Tab reaches it, Enter opens it), and, only
// while the pane holds the keyboard, the hint row of Cockpit's keys as hotkey Buttons. An unfocused pane draws no
// hotkey at all, so no key of the prompt's can ever press one.
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { C } from '../../shared/tokens'
import { drawRow } from '../draw'
import type { Line } from '../line'
import { openRow, pressKey } from './view'
import type { View } from './view'

/** One of Cockpit's keys: its letter and the word the hint row gives it. */
type Key = { key: string; label: string }

/** The keys each view offers. */
export function keysOf(view: View): Key[] {
  if (view.kind === 'fit') {
    return [
      { key: 's', label: 'steps' },
      { key: 'a', label: 'agents' },
      { key: 't', label: 'todo' },
      { key: 'f', label: 'files' },
      { key: 'u', label: 'sources' },
      { key: 'c', label: 'copy' }
    ]
  }

  return view.kind === 'all'
    ? [
        { key: 's', label: 'fit' },
        { key: 'c', label: 'copy' },
        { key: 'b', label: 'back' }
      ]
    : [
        { key: 'c', label: 'copy' },
        { key: 'b', label: 'back' }
      ]
}

/** The hint row's rows: one, or two in a pane too narrow for the fitted layout's keys on one row. */
export const hintRows = (view: View, width: number): number => (view.kind === 'fit' && width < 64 ? 2 : 1)

/**
 * The pane's tree: its rows, an openable one as a Button under its id, and, while focused, the hint row: at the
 * bottom of the fitted layout (fitted to leave it room), at the top of a view taller than the pane (which opens at
 * its top), so it is on screen either way.
 * @param $ the engine interface
 * @param e the `Pane` render
 * @param lines the rows
 * @param view what the pane shows
 * @param note `copied` or `nothing to copy`, while it shows
 * @returns the tree
 */
export function drawPane($: EngineInterface, e: RenderInput<'Pane'>, lines: readonly Line[], view: View, note: string | undefined): RenderElement {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button } = ui
  const rows = lines.map((l, i) => {
    const id = l.id

    return id === undefined ? (
      drawRow(ui, l.parts, `row:${i}`)
    ) : (
      <Button key={id} plain onPress={() => void openRow($, id)}>
        {drawRow(ui, l.parts, `text:${i}`)}
      </Button>
    )
  })
  const hint = e.props.isFocused ? (
    <Box key="keys" flexDirection="row" flexWrap="wrap">
      {keysOf(view).map(k => (
        <Box key={`key:${k.key}`} marginRight={2}>
          <Button key={`key-${k.key}`} hotkey={k.key} plain onPress={() => void pressKey($, k.key)}>
            {k.label}
          </Button>
        </Box>
      ))}
      <Text color={C.dim}>esc: prompt</Text>
      {note !== undefined && <Text color={C.dim}>{`  ${note}`}</Text>}
    </Box>
  ) : undefined

  return (
    <Box flexDirection="column">
      {view.kind !== 'fit' && hint}
      {rows}
      {view.kind === 'fit' && hint}
    </Box>
  )
}
