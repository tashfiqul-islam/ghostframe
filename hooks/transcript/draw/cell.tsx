// A block on the gutter grid: `label` (`claude`, `you`) in the 12-column gutter beside it, or above it narrow.
import type { RenderChildren, RenderElement } from 'claude-code'

import type { Lay } from '../../shared/layout'
import type { Ui } from '../../shared/rule'
import { C } from '../../shared/tokens'

// One block on the grid. Wide: a 12-column gutter holds `label` beside the content.
// Narrow (§4): `label` is a caption line above, the content inset 2 at full width.
type Label = { text: string; color: string }

export const cell = (ui: Ui, lay: Lay, label: Label | undefined, body: RenderChildren, marginTop: number = 0, key?: string): RenderElement => {
  const { Box, Text } = ui
  const text = label?.text ?? ''
  const content = (
    <Box flexDirection="column" width={lay.width} flexShrink={1} minWidth={0}>
      {body}
    </Box>
  )

  if (lay.narrow) {
    return (
      <Box {...(key !== undefined ? { key } : {})} flexDirection="column" marginTop={marginTop}>
        {text.length > 0 && <Text color={label?.color ?? C.accent}>{text}</Text>}
        <Box flexDirection="row" flexWrap="nowrap" paddingLeft={lay.gutter}>
          {content}
        </Box>
      </Box>
    )
  }

  return (
    <Box {...(key !== undefined ? { key } : {})} flexDirection="row" flexWrap="nowrap" marginTop={marginTop}>
      <Box width={lay.gutter} flexShrink={0}>
        <Text color={label?.color ?? C.accent}>{text}</Text>
      </Box>
      {content}
    </Box>
  )
}

export const claude = (shown: boolean): Label | undefined => (shown ? { text: 'claude', color: C.accent } : undefined)
