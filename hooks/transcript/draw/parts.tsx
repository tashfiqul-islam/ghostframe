// Lines of parts drawn as Text: one line, a stack of lines, a frame with its margins.
import type { RenderElement } from 'claude-code'

import { sameStyleJoined } from '../../shared/parts'
import type { Part } from '../../shared/parts'
import type { Ui } from '../../shared/rule'

// One line of parts, never wrapped (every framed line is built exactly the frame's width).
// A part's `href` is never drawn. The engine's Link is an OSC 8 span only where it
// judges the terminal supports one; elsewhere (Windows Terminal, as seen) it draws the
// text, then the whole URL, which overruns the measure and pushes later footnotes off
// the line. A Text can't carry the escape itself (control characters are dropped), so
// the label alone is drawn: never the raw URL, at the cost of the click.
export const drawParts = (ui: Ui, parts: readonly Part[], key: string, isJoined = false): RenderElement => {
  const { Text } = ui

  return (
    <Text key={key} wrap="truncate">
      {parts.length === 0
        ? ' '
        : (isJoined ? sameStyleJoined(parts) : parts).map((p, i) => (
            <Text key={`${i}`} color={p.color} {...(p.bold ? { weight: 'bold' as const } : {})} {...(p.bg === undefined ? {} : { backgroundColor: p.bg })}>
              {p.t}
            </Text>
          ))}
    </Text>
  )
}

// Frame pieces stacked with no margins (a frame drawn across several rows). Cockpit's left draws every row through
// here, so neighbouring parts of one style are joined: fewer Texts for the engine to carry over and lay out.
export const drawRows = (ui: Ui, lines: readonly Part[][], key: string): RenderElement => {
  const { Box } = ui

  return (
    <Box key={key} flexDirection="column">
      {lines.map((l, i) => drawParts(ui, l, `${key}${i}`, true))}
    </Box>
  )
}

export const drawFrame = (ui: Ui, lines: readonly Part[][]): RenderElement => {
  const { Box } = ui

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {lines.map((l, i) => drawParts(ui, l, `f${i}`))}
    </Box>
  )
}
