// Cockpit's rows as terminal Text lines, for the pane and the quiet left alike.
import type { RenderElement } from 'claude-code'

import type { Part } from '../shared/parts'
import type { Ui } from '../shared/rule'

/**
 * Rows as Text lines, one per row.
 * @param ui the surface's elements
 * @param rows the rows
 * @returns the lines
 */
export function drawRows(ui: Pick<Ui, 'Text'>, rows: readonly (readonly Part[])[]): RenderElement[] {
  const { Text } = ui

  return rows.map((row, i) => (
    <Text key={`row:${i}`} wrap="truncate">
      {row.map((p, j) => (
        <Text key={`${j}`} color={p.color} {...(p.bold === true ? { weight: 'bold' as const } : {})}>
          {p.t}
        </Text>
      ))}
    </Text>
  ))
}
