// Cockpit's rows as terminal Text lines, for the pane and the quiet left alike.
import type { RenderElement } from 'claude-code'

import type { Part } from '../shared/parts'
import type { Ui } from '../shared/rule'

/**
 * One row as a Text line.
 * @param ui the surface's elements
 * @param row the row's parts
 * @param key the line's key
 * @returns the line
 */
export function drawRow(ui: Pick<Ui, 'Text'>, row: readonly Part[], key: string): RenderElement {
  const { Text } = ui

  return (
    <Text key={key} wrap="truncate">
      {row.map((p, j) => (
        <Text key={`${j}`} color={p.color} {...(p.bold === true ? { weight: 'bold' as const } : {})} {...(p.bg === undefined ? {} : { backgroundColor: p.bg })}>
          {p.t}
        </Text>
      ))}
    </Text>
  )
}

/**
 * Rows as Text lines, one per row.
 * @param ui the surface's elements
 * @param rows the rows
 * @returns the lines
 */
export function drawRows(ui: Pick<Ui, 'Text'>, rows: readonly (readonly Part[])[]): RenderElement[] {
  return rows.map((row, i) => drawRow(ui, row, `row:${i}`))
}
