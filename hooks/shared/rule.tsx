import type { Elements } from 'claude-code'

import { G, RULE_LEAD } from './layout'
import { C } from './tokens'

// ─── Grid rule (r3, r13): `+┄┄┄┄┄┄┄┄┄┄┄┄┄ 02:10 ┄┄┄┄…┄┄┄┄ label ┄┄+` ──────────
// `+` at the two ends only. The filler is a one-row, overflow-hidden Box holding a
// long run of ┄ that hard-wraps at the Box's width, so it fills exactly the room
// left and never shows an ellipsis or a second row, whatever the container width.
export type Ui = Elements['terminal']

export type RuleLabel = { text: string; color: string }

export function Rule(ui: Ui, left?: RuleLabel, right?: RuleLabel, width?: number) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" flexWrap="nowrap" width={width ?? '100%'} height={1}>
      <Box flexShrink={0}>
        <Text color={C.ruleStrong}>{G.cross}</Text>
      </Box>
      {left !== undefined && left.text.length > 0 && (
        <Box flexShrink={0}>
          <Text color={C.hairline}>{G.hEdge.repeat(RULE_LEAD)}</Text>
          <Text color={left.color}>{` ${left.text} `}</Text>
        </Box>
      )}
      <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden">
        <Text color={C.hairline} wrap="wrap">
          {G.hEdge.repeat(600)}
        </Text>
      </Box>
      {right !== undefined && right.text.length > 0 && (
        <Box flexShrink={0}>
          <Text color={right.color}>{` ${right.text} `}</Text>
          <Text color={C.hairline}>{G.hEdge.repeat(2)}</Text>
        </Box>
      )}
      <Box flexShrink={0}>
        <Text color={C.ruleStrong}>{G.cross}</Text>
      </Box>
    </Box>
  )
}
