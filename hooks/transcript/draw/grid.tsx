// Activity on the gutter grid: our rows under the activity rule and `claude`, or the engine's row indented to the dots.
import type { RenderChildren } from 'claude-code'

import type { Lay } from '../../shared/layout'
import type { Part } from '../../shared/parts'
import type { Ui } from '../../shared/rule'
import { pad } from '../../shared/text'
import { C } from '../../shared/tokens'
import { browserBottom } from '../browser'
import { cell, claude } from './cell'
import { drawParts } from './parts'
import { drawActivityRule } from './step'

// Wraps step rows in the gutter grid, under the activity rule when this opens the turn's
// activity; `claude` in the gutter when the turn opened on tools. Never holds an engine node.
// `extra.close`: the bottom edge of a browser frame left open right above (N actions).
// `extra.caps`: the capability line under `claude`. `extra.gap`: a blank row above the
// body (a frame opening after plain steps).
type Extra = { close?: number | undefined; caps?: Part[] | undefined; gap?: boolean | undefined }

export const inGrid = (ui: Ui, head: string | undefined, lay: Lay, body: RenderChildren, label = false, extra: Extra = {}) => {
  const { Box } = ui
  const closing = (extra.close ?? 0) > 0

  return (
    <Box flexDirection="column">
      {closing && closeRow(ui, lay, extra.close ?? 0)}
      {cell(
        ui,
        lay,
        claude(label),
        [
          ...(extra.caps !== undefined
            ? [
                <Box key="caps" marginBottom={1}>
                  {drawParts(ui, extra.caps, 'caps')}
                </Box>
              ]
            : []),
          ...(head !== undefined ? [<Box key="head">{drawActivityRule(ui, head)}</Box>] : []),
          <Box key="body" flexDirection="column">
            {body}
          </Box>
        ],
        head !== undefined || label || closing || extra.gap === true ? 1 : 0
      )}
    </Box>
  )
}

// `+┄┄┄…┄┄ 5 actions +`: closes the browser frame above, in the content column.
export const closeRow = (ui: Ui, lay: Lay, actions: number) => {
  const { Box } = ui

  return (
    <Box flexDirection="row" flexWrap="nowrap" paddingLeft={lay.gutter}>
      <Box width={lay.width} flexShrink={1} minWidth={0}>
        {drawParts(ui, browserBottom(lay.width, actions), 'close')}
      </Box>
    </Box>
  )
}

// An engine-drawn row the timeline can't redraw (a folded group, an unknown tool): the
// activity rule and `claude` still draw, as siblings above it, and the engine's node is
// indented by a padded gutter Text so its dot lines up with the step dots. The node
// itself never sits under a Box that has a width.
export const engineInGutter = (ui: Ui, node: RenderChildren, head: string | undefined, lay: Lay, label: boolean, extra: Extra = {}) => {
  const { Box, Text } = ui
  const closing = (extra.close ?? 0) > 0
  // The caps line takes the `claude` label's row; the head (or the node) follows. Narrow,
  // `claude` is always its own caption line, so it heads the column the same way.
  const capsFirst = label && extra.caps !== undefined
  const onHead = head !== undefined || capsFirst || (label && lay.narrow)

  return (
    <Box flexDirection="column">
      {closing && closeRow(ui, lay, extra.close ?? 0)}
      <Box flexDirection="column" marginTop={onHead || label || closing || extra.gap === true ? 1 : 0}>
        {onHead &&
          cell(ui, lay, claude(label), [
            ...(capsFirst
              ? [
                  <Box key="caps" marginBottom={head !== undefined ? 1 : 0}>
                    {drawParts(ui, extra.caps ?? [], 'caps')}
                  </Box>
                ]
              : []),
            ...(head !== undefined ? [<Box key="head">{drawActivityRule(ui, head)}</Box>] : [])
          ])}
        {label && !onHead ? (
          <Box flexDirection="row" flexWrap="nowrap">
            <Box flexShrink={0}>
              <Text color={C.accent}>{pad('claude', lay.gutter)}</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              {node}
            </Box>
          </Box>
        ) : (
          // Padding, not a spacer Text: a node that draws nothing leaves no blank row.
          <Box flexDirection="column" paddingLeft={lay.gutter}>
            {node}
          </Box>
        )}
      </Box>
    </Box>
  )
}
