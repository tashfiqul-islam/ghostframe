// The v8 pane's tree (spec 8, 9.5): its rows, an openable one as a Button under its id (Tab reaches it, Enter opens
// it), and, only while the pane holds the keyboard, its keys as hotkey Buttons: the tabs' digits on the tab strip, the
// view's keys on the hint row, the wordmark at its right. An unfocused pane draws no hotkey, so none takes a key from
// the prompt (amendment 7).
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { drawRow } from '../draw'
import type { Line } from '../line'
import { openRow, pressKey, ringNow } from '../keys/view'
import { GLYPH } from '../../shared/look/glyphs'
import { selected, underRing } from './pane'

/** Every hotkey of the focused pane (9.5): drawn in every view, so each works wherever the spec says it does. */
const ALL_KEYS = ['1', '2', '3', '4', '5', 's', 'c', 'p', 'n', 'l', 'b', 'u', 'm']

// The rows' ids as last drawn, in order: where the ring goes instead of a hidden key Button (`ringPastKeys`).
let rowIds: readonly string[] = []

/**
 * Where the focus ring goes when Tab would land on a hidden key Button: the engine has no way to leave a Button out
 * of the ring, and a stop on a key nobody can see looks like the ring vanished. Forward from the last row it wraps
 * to the first; otherwise (backward from the first row, or from the engine's own stops) it lands on the last row.
 * @param was the element the ring was on
 * @returns the row to land on, or undefined when the view has no rows
 */
export function ringPastKeys(was: string | undefined): string | undefined {
  return was !== undefined && was === rowIds.at(-1) ? rowIds[0] : rowIds.at(-1)
}

/** Whether an element is one of the hidden key Buttons. */
export const isKeyElement = (element: string | undefined): boolean => element?.startsWith('key-') === true

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
  const ring = isFocused ? ringNow() : undefined

  rowIds = lines.flatMap(l => (l.id === undefined ? [] : [l.id]))
  const body = lines.slice(0, -1).map((l, i) =>
    l.id === undefined ? (
      drawRow(ui, l.parts, `row:${i}`)
    ) : (
      // The press's promise is returned: an agent's row calls `$.ui.view`, allowed only while it answers the press.
      // The row under the ring is the selected row (6.2), unless its view already drew it so (the Files tab's file),
      // drawn for the engine's inversion of the focused Button.
      <Button key={l.id} plain onPress={async () => openRow($, l.id ?? '')}>
        {drawRow(ui, l.id === ring ? underRing(l.parts[0]?.t === GLYPH.pillStart ? l.parts : selected(l.parts)) : l.parts, `text:${i}`)}
      </Button>
    )
  )
  // The hint row is drawn as one row (8.12): the keys that work here and the wordmark. The keys themselves are hotkey
  // Buttons with nothing of their own to draw, bound only while the pane holds the keyboard.
  // `m` only while an agent's conversation is in view: it answers with `$.ui.view`, which only that view needs.
  const isViewing = e.props.view.agentId !== undefined
  const bound = isFocused ? (only ?? ALL_KEYS.filter(k => k !== 'm' || isViewing)) : []
  // A hotkey Button always draws its key (`1: …`), so the keys sit in a Box that is not displayed: they press, and
  // nothing of them shows; the hint row is the only place the keys are written (8.12).
  const hint = (
    <Box key="hint" flexDirection="column">
      {only === undefined && drawRow(ui, lines.at(-1)?.parts ?? [], 'hint')}
      {bound.length > 0 && (
        <Box key="keys" display="none">
          {bound.map(k => (
            <Button key={`key-${k}`} hotkey={k} plain onPress={async () => pressKey($, k)}>
              <Text>{''}</Text>
            </Button>
          ))}
        </Box>
      )}
    </Box>
  )
  return (
    <Box flexDirection="column">
      {body}
      {hint}
    </Box>
  )
}
