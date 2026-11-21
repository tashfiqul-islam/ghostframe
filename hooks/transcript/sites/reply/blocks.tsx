// One reply block drawn by its kind: prose, a heading, a table, a list, a figure, cited text, a Sources list.
import type { RenderElement } from 'claude-code'

import type { Lay } from '../../../shared/layout'
import type { Ui } from '../../../shared/rule'
import { clip } from '../../../shared/text'
import { C } from '../../../shared/tokens'
import type { Block } from '../../blocks/split'
import type { citationsOf } from '../../citations'
import { drawRows } from '../../draw/parts'
import { figureLines } from '../../figure/draw'
import { toWords, wrapWords } from '../../prose'
import { sup } from '../../research/cites'
import { footnoteLines } from '../../research/footnotes'
import type { Drawn } from '../../table/layout'
import { drawLines, listGroups, listLines, runsLine } from './lines'
import type { Prose } from './lines'
import { tableLines } from './tables'

/**
 * What a reply's blocks draw with: its prose, the grid, whether its turn frames its sources (`framed`),
 * its citations, and each table's layout.
 */
export type Reply = Prose & {
  ui: Ui
  lay: Lay
  framed: boolean
  citations: ReturnType<typeof citationsOf>
  tableDraws: ReadonlyMap<Block, Drawn | undefined>
}

/**
 * Draws one reply block.
 * @param reply what the reply's blocks draw with
 * @param b the block
 * @param blockKey its key, from its position in the reply
 * @param gap the rows of margin above it
 * @returns the block's node, or null when it draws nothing
 */
export function drawBlock(reply: Reply, b: Block, blockKey: string, gap: number): RenderElement | null {
  const { ui, lay, width, quiet, framed, tableDraws } = reply
  const { cited, lists, tables } = reply.citations
  const { Box, Markdown } = ui

  // Whether a block draws its footnote line: in any turn without web tools, always (the
  // line comes with its markers, from the block's first draw).
  const notesShown = (_key: string, n: number) => n > 0 && !framed

  switch (b.kind) {
    case 'table': {
      const drawn = tableDraws.get(b)

      if (drawn === undefined) return null

      const lines = tableLines(drawn)
      // Only markers still on screen get an entry: a cell cut at its line limit (or
      // clipped narrow) can drop its marker, and a footnote never points at nothing.
      const shown = new Set(
        lines.flatMap(
          l =>
            l
              .map(sp => sp.t)
              .join('')
              .match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g) ?? []
        )
      )
      const notes = (tables.get(b)?.cites ?? []).filter(c => shown.has(sup(c.n)))

      if (notes.length === 0) return drawLines(ui, lines, blockKey, gap)

      // Markers in the cells: the footnote line goes right under the table.
      return (
        <Box key={blockKey} marginTop={gap} flexDirection="column">
          {drawLines(ui, lines, `${blockKey}-t`, 0)}
          {notesShown(blockKey, notes.length) && drawRows(ui, footnoteLines(notes, width), `${blockKey}-n`)}
        </Box>
      )
    }
    case 'heading':
      return drawLines(ui, [[{ t: clip(b.text, width), color: quiet ? C.dim : C.textBright, bold: true }]], blockKey, gap)
    case 'para':
      return drawLines(
        ui,
        wrapWords(toWords(b.runs), width).map(line => runsLine(reply, line, width)),
        blockKey,
        gap
      )
    // An mdxcn figure (§5.7): our frame at the measure; an artifact, never dimmed.
    case 'figure':
      return (
        <Box key={blockKey} marginTop={gap} flexDirection="column">
          {drawRows(ui, figureLines(b, width, lay.narrow), `${blockKey}-f`)}
        </Box>
      )
    case 'markdown':
      return (
        <Box key={blockKey} marginTop={gap} flexDirection="column">
          <Markdown text={b.text} dimColor={quiet} />
        </Box>
      )
    case 'list': {
      const p = lists.get(b)

      if (p === undefined) return null

      return (
        <Box key={blockKey} marginTop={gap} flexDirection="column">
          {listGroups(p).map((g, gi) => (
            <Box key={`${blockKey}-g${gi}`} marginTop={gi > 0 ? 1 : 0} flexDirection="column">
              {drawLines(ui, listLines(reply, g), `${blockKey}-g${gi}-l`, 0)}
              {notesShown(`${blockKey}-g${gi}`, g.cites.length) && drawRows(ui, footnoteLines(g.cites, width), `${blockKey}-g${gi}-n`)}
            </Box>
          ))}
        </Box>
      )
    }
    case 'cited':
    case 'sources': {
      const c = cited.get(b)

      if (c === undefined) {
        return b.kind === 'cited' ? (
          <Box key={blockKey} marginTop={gap} flexDirection="column">
            <Markdown text={b.text} dimColor={quiet} />
          </Box>
        ) : null
      }

      const body = c.runs === undefined ? [] : wrapWords(toWords(c.runs), width).map(line => runsLine(reply, line, width))
      // A Sources list draws no numbered line of its own (its items have no markers). In a
      // web turn it is the frame. Otherwise its marked sources are on their blocks' lines
      // already, and any it names with no marker get one dim line, `·` for a number.
      if (b.kind === 'sources') {
        const rest = c.unmarked ?? []

        if (framed || rest.length === 0) return null

        return (
          <Box key={blockKey} marginTop={gap} flexDirection="column">
            {drawRows(
              ui,
              footnoteLines(
                rest.map(r => ({ n: 0, url: r.url, title: r.title })),
                width,
                true
              ),
              `${blockKey}-n`
            )}
          </Box>
        )
      }

      return (
        <Box key={blockKey} marginTop={gap} flexDirection="column">
          {body.length > 0 && drawLines(ui, body, `${blockKey}-p`, 0)}
          {notesShown(blockKey, c.cites.length) && drawRows(ui, footnoteLines(c.cites, width, c.byTitle), `${blockKey}-n`)}
        </Box>
      )
    }
    default:
      return null
  }
}
