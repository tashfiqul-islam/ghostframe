// A settled table's lines as the reply site draws them, without the engine: the reply's measure at `columns`
// (`layout`), the table's columns (`streamLayout`) and its lines (`tableLines`), each line's text.
import { layout } from '../../hooks/shared/layout'
import { splitBlocks } from '../../hooks/transcript/blocks/split'
import { tableLines } from '../../hooks/transcript/sites/reply/tables'
import { streamLayout } from '../../hooks/transcript/table/layout'

/**
 * The lines a reply holding only `markdown`, one table, draws at `columns`.
 * @param markdown a pipe table
 * @param columns the terminal's width
 * @returns each line's text, as the site's Text holds it
 */
export function tableText(markdown: string, columns: number): string[] {
  const b = splitBlocks(markdown)[0]
  const lay = layout(columns)

  if (b?.kind !== 'table') throw new Error('not a table')
  if (lay === undefined) throw new Error(`no measure at ${columns} columns`)

  return tableLines(streamLayout(b, lay.width, false, undefined, false).drawn).map(l => l.map(s => s.t).join(''))
}
