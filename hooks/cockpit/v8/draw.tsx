// The v8 pane's tree (spec 8, 9.5): its rows, an openable one as a Button under its id (Tab reaches it, Enter opens
// it), and, only while the pane holds the keyboard, its keys as hotkey Buttons: the tabs' digits on the tab strip, the
// view's keys on the hint row, the wordmark at its right. An unfocused pane draws no hotkey, so none takes a key from
// the prompt (amendment 7).
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { drawRow } from '../draw'
import type { Line } from '../line'
import { openRow, pressKey } from '../keys/view'

/** Every hotkey of the focused pane (9.5): drawn in every view, so each works wherever the spec says it does. */
const ALL_KEYS = ['1', '2', '3', '4', '5', 's', 'c', 'p', 'n', 'l', 'b', 'u', 'm']

/**
 * The pane's tree.
 * @param $ the engine interface
 * @param e the `Pane` render
 * @param lines the rows, the hint row last
 * @param only the inline inspector's hotkeys (8.13): its card draws its own key row, so no hint row is drawn
 * @returns the tree
 */
export function drawPaneV8($: EngineInterface, e: RenderInput<'Pane'>, lines: readonly Line[], only?: readonly string[]): RenderElement {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button } = ui
  const isFocused = e.props.isFocused
  const body = lines.slice(0, -1).map((l, i) =>
    l.id === undefined ? (
      drawRow(ui, l.parts, `row:${i}`)
    ) : (
      // The press's promise is returned: an agent's row calls `$.ui.view`, allowed only while it answers the press.
      <Button key={l.id} plain onPress={async () => openRow($, l.id ?? '')}>
        {drawRow(ui, l.parts, `text:${i}`)}
      </Button>
    )
  )
  // The hint row is drawn as one row (8.12): the keys that work here and the wordmark. The keys themselves are hotkey
  // Buttons with nothing of their own to draw, bound only while the pane holds the keyboard.
  // `m` only while an agent's conversation is in view: it answers with `$.ui.view`, which only that view needs.
  const isViewing = e.props.view.agentId !== undefined
  const bound = isFocused ? (only ?? ALL_KEYS.filter(k => k !== 'm' || isViewing)) : []
  const hint = (
    <Box key="hint" flexDirection="column">
      {only === undefined && drawRow(ui, lines.at(-1)?.parts ?? [], 'hint')}
      {bound.map(k => (
        <Button key={`key-${k}`} hotkey={k} plain onPress={async () => pressKey($, k)}>
          <Text>{''}</Text>
        </Button>
      ))}
    </Box>
  )
  return (
    <Box flexDirection="column">
      {body}
      {hint}
    </Box>
  )
}
