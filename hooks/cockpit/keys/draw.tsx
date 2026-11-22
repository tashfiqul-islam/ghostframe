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

/** The section keys, which the inline inspector (E.46), one section only, does not offer. */
const SECTION_KEYS = new Set(['a', 't', 'f', 'u'])

/**
 * The keys each view offers; the inline inspector's fitted view offers no section keys. While an agent's conversation
 * is in view, every view also offers `m` for the main conversation.
 */
export function keysOf(view: View, isPinned = false, isInspector = false, isViewing = false): Key[] {
  return [...viewKeys(view, isPinned, isInspector), ...(isViewing ? [{ key: 'm', label: 'main' }] : [])]
}

/** The keys a view offers of its own. */
function viewKeys(view: View, isPinned: boolean, isInspector: boolean): Key[] {
  // An agent's steps listed where the engine would not show its conversation: the fitted layout, and `b` back.
  if (view.kind === 'agent') return [...viewKeys({ kind: 'fit' }, isPinned, isInspector), { key: 'b', label: 'back' }]

  if (view.kind === 'fit') {
    const keys = [
      { key: 's', label: 'steps' },
      { key: 'a', label: 'agents' },
      { key: 't', label: 'todo' },
      { key: 'f', label: 'files' },
      { key: 'u', label: 'sources' },
      { key: 'c', label: 'copy' },
      { key: 'p', label: 'prev' },
      { key: 'n', label: 'next' },
      ...(isPinned ? [{ key: 'l', label: 'live' }] : [])
    ]

    return isInspector ? keys.filter(k => !SECTION_KEYS.has(k.key)) : keys
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

/** The hint row's rows: as many as its keys take at this width, each key `k: label` and two cells apart. */
export function hintRows(view: View, width: number, isPinned = false, isInspector = false, isViewing = false): number {
  const cells = keysOf(view, isPinned, isInspector, isViewing).reduce((n, k) => n + k.key.length + 2 + k.label.length + 2, 0) + escHint(isViewing).length

  return Math.max(1, Math.ceil(cells / Math.max(1, width)))
}

/**
 * What the hint row says of Escape: nothing while an agent's conversation is in view, where Escape at the prompt
 * stops the agent's running shell (amendment 13); else that it returns the keyboard to the prompt.
 */
const escHint = (isViewing: boolean): string => (isViewing ? '' : 'esc: prompt')

/**
 * The pane's tree: its rows, an openable one as a Button under its id, and, while focused, the hint row: at the
 * bottom of the fitted layout (fitted to leave it room), at the top of a view taller than the pane (which opens at
 * its top), so it is on screen either way.
 * @param $ the engine interface
 * @param e the `Pane` render
 * @param lines the rows
 * @param view what the pane shows
 * @param note `copied` or `nothing to copy`, while it shows
 * @param isPinned whether a past turn is pinned (`l` is then offered)
 * @param isInspector whether the pane is the inline inspector (no section keys)
 * @param isViewing whether an agent's conversation is in view (`m` is then offered, Escape is not)
 * @returns the tree
 */
export function drawPane(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  lines: readonly Line[],
  view: View,
  note: string | undefined,
  isPinned = false,
  isInspector = false,
  isViewing = false
): RenderElement {
  const ui = $.ui.resolve(e)
  const { Box, Text, Button } = ui
  const rows = lines.map((l, i) => {
    const id = l.id

    return id === undefined ? (
      drawRow(ui, l.parts, `row:${i}`)
    ) : (
      // The press's promise is returned: an agent's row calls `$.ui.view`, allowed only while it answers the press.
      <Button key={id} plain onPress={async () => openRow($, id)}>
        {drawRow(ui, l.parts, `text:${i}`)}
      </Button>
    )
  })
  const hint = e.props.isFocused ? (
    <Box key="keys" flexDirection="row" flexWrap="wrap">
      {keysOf(view, isPinned, isInspector, isViewing).map(k => (
        <Box key={`key:${k.key}`} marginRight={2}>
          {/* The press's promise is returned: `m` calls `$.ui.view`, allowed only while it answers the press. */}
          <Button key={`key-${k.key}`} hotkey={k.key} plain onPress={async () => pressKey($, k.key)}>
            {k.label}
          </Button>
        </Box>
      ))}
      {!isViewing && <Text color={C.dim}>{escHint(isViewing)}</Text>}
      {note !== undefined && <Text color={C.dim}>{`  ${note}`}</Text>}
    </Box>
  ) : undefined

  const isFitted = view.kind === 'fit' || view.kind === 'agent'

  return (
    <Box flexDirection="column">
      {!isFitted && hint}
      {rows}
      {isFitted && hint}
    </Box>
  )
}
