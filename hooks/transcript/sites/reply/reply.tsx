// Claude's reply (`AssistantMessage`): its blocks on the measure, `claude` and the capability line on the turn's
// opener, and footnote lines or a [ SOURCES ] frame for what it cites.
import type { On } from 'claude-code'

import { drawAnswerCapsule, drawAnswerReceipt, drawUnfoldedSentence, endsKeptTurn, isQuietRow } from '../../../cockpit/left'
import { layout, ruleWidth } from '../../../shared/layout'
import { C } from '../../../shared/tokens'
import type { Block } from '../../blocks/split'
import { blocksOf, citationsFor, turnCites } from '../../citations'
import { cell, claude } from '../../draw/cell'
import { closeRow } from '../../draw/grid'
import { drawParts, drawRows } from '../../draw/parts'
import { browserOpenAbove, firstKey, flowPlace, inTurn, isQuietOpenerAt, isTurnOpener, isWebTool, sameKey } from '../../ledger/flow'
import { readFlow } from '../../../shared/flow'
import { openerCaps, readFirstTexts, readStreaming, readTurn } from '../../ledger/state'
import { sourcesFrame } from '../../research/sources'
import { drawBlock } from './blocks'
import type { Reply } from './blocks'
import { drawnAs, messageOf, replyGap } from './message'
import { isHiddenNarration } from './narration'
import { drawSummary } from './summary'
import { tableDraws } from './tables'

/**
 * Adds Claude's reply drawing (`AssistantMessage`).
 * @param on the `on` that `register` receives
 */
export function registerReply(on: On): void {
  // Claude's prose: `claude` in the gutter on the first block of a reply, body on the
  // one measure. Plain paragraphs and headings are laid out here (exact widths, code
  // chips); anything else goes through the engine's Markdown, links and all.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const lay = layout(e.viewport?.columns)

    if (e.surface !== 'terminal' || e.props.text.trim().length === 0 || lay === undefined) {
      return next(e)
    }

    // Quiet (Cockpit docked): narration leaves the transcript; its sentence is the pane's [ NOW ] (probe 1).
    // While the turn runs, its text waits unseen until it is known not to be narration, so nothing flashes:
    // the engine may raise a block before its message (and the tool call after it) is stored. The answer is
    // raised after `turn.complete` (probe 1), so waiting costs it nothing; a question to the person shows at once.
    // ctrl+o (E.4): a sentence Claude said while working is a `│` row, the steps it announced under it.
    const sentence = await drawUnfoldedSentence($, e, firstKey(e.props.text), ruleWidth(lay) ?? lay.width)

    if (sentence !== undefined) return sentence

    if (isQuietRow(e) && (await isHiddenNarration($, e.props.text))) {
      const { Box } = $.ui.resolve(e)

      return <Box />
    }

    const width: number = lay.width

    // A summary of text written between tool calls: dim, in the content column, no bullet,
    // no full-width line. `claude` only if this summary stands for the turn's opening text.
    if (e.props.isSummary === true) {
      return drawSummary($, e, lay)
    }

    const blocks = blocksOf(e.props.text)

    if (blocks.length === 0) {
      return next(e)
    }

    const ui = $.ui.resolve(e)
    const { Box, Text, Markdown } = ui

    // Footnote numbers run through the message in block order (§0.1 r7): an earlier
    // paragraph's numbers never change when a later one streams in.
    const live = await readStreaming($)
    const isOffScreen = e.props.onScreen === null
    const key = firstKey(e.props.text)
    const blocksSoFar = await readFlow($)
    const turnNow = await readTurn($)
    // Its own key first: a later block that only starts like this one is another block.
    // A prefix (text still streaming) is looked for in the running turn only.
    const place =
      flowPlace(blocksSoFar, f => f.kind === 'text' && f.key === key, false, turnNow) ??
      flowPlace(blocksSoFar, f => f.kind === 'text' && (!live || f.turn === turnNow) && sameKey(f.key, key), live, turnNow)
    // This draw's message, across remounts (see `messageOf`).
    const message = messageOf(e.requestId, key, place?.turn ?? null)

    drawnAs(e.requestId, { key, turn: place?.turn ?? null })
    // Numbers run through the turn, not just this message: a reply split over several
    // messages (prose, a list, a Sources list) numbers each source once.
    const earlier = place === undefined ? [] : turnCites(blocksSoFar, place.turn, place.at)
    const citations = citationsFor(e.requestId, blocks, earlier)
    const { cited, lists, tables, mine, mineListed, listsHere } = citations
    // §0.2 citations, decided once and the same on every draw, streaming or done: a turn
    // that used a web tool (search, fetch) before this message draws [ SOURCES ] frames and
    // no footnote lines; any other turn draws footnote lines under the blocks that hold the
    // markers. Read from the flow above this block, which never changes once the block
    // starts: nothing that streams in later (more links, a Sources list, the turn ending)
    // can turn footnote lines into a frame or back.
    const framed = place !== undefined && blocksSoFar.slice(0, place.at).some(f => f.turn === place.turn && f.kind === 'tool' && isWebTool(f.tool))
    // A message citing a source, or holding a Sources list (even one whose items no marker cites).
    const citesHere = listsHere || [...cited.values(), ...lists.values(), ...tables.values()].some(x => x.cites.length > 0)
    // Each citing message of a web turn ends with its own frame: what it cites, numbered
    // through the turn, then what its Sources list names with no marker. It grows only at
    // the message's own end while the message streams.
    const drawsFrame = framed && citesHere && mine.length + mineListed.length > 0

    // Narration (§0.1 r8): prose a tool call follows in the same turn is dim; the turn's
    // final answer, and every plain Q&A reply, keeps normal text. Known once the next
    // call is stored, so only the block right above the newest one changes, and only
    // its colour, never its rows.
    const quiet = place !== undefined && blocksSoFar.slice(place.at + 1).some(f => f.turn === place.turn && f.kind === 'tool')
    const base = quiet ? C.dim : C.text
    const reply: Reply = { ui, lay, width, quiet, base, framed, citations, tableDraws: tableDraws(blocks, message, width, live, isOffScreen, tables) }

    // Segments: runs of blocks in the gutter column, and `wide` engine tables at full width.
    type Segment = { wide: false; blocks: Block[] } | { wide: true; text: string }
    const segments: Segment[] = []

    for (const b of blocks) {
      const last = segments[segments.length - 1]

      if (b.kind === 'wide') {
        segments.push({ wide: true, text: b.text })
      } else if (last !== undefined && !last.wide) {
        last.blocks.push(b)
      } else {
        segments.push({ wide: false, blocks: [b] })
      }
    }

    // `claude` once per turn, on Claude's first visible block (isFirstOfReply is true after
    // every tool call too). A reply that opens on a wide table gets the label on its own row.
    // Matched within the block's own turn: prose that only starts like another turn's opener is not one.
    const isQuietLeft = isQuietRow(e)
    const isOpener = isQuietLeft
      ? place === undefined
        ? await endsKeptTurn($, e.requestId)
        : isQuietOpenerAt(blocksSoFar, place.at)
      : e.props.isFirstOfReply && isTurnOpener(await readFirstTexts($), e.props.text, place?.turn)
    // The capability line takes `claude`'s row; the reply follows a blank row below it. Quiet, it is the pane's.
    const capsRow = isOpener && !isQuietLeft ? await openerCaps($, o => inTurn(o.turn, place?.turn) && sameKey(o.key, key), width) : undefined
    const label = isOpener && capsRow === undefined ? 'claude' : ''
    const opensWide = segments[0]?.wide === true
    // A browser frame left open right above this block: its bottom edge first.
    const above = browserOpenAbove(blocksSoFar, place)
    // One blank row above a reply block, the same after an activity row (●) as anywhere,
    // except right under a frame that drew its own (a card, the task list). Decided when
    // the block starts and kept: a card collapsing later never moves this block.
    const prev = place !== undefined && place.at > 0 ? blocksSoFar[place.at - 1] : undefined
    const gap = replyGap(message, prev, place?.turn)
    // Fallback: a block that stays opens with the capsule of the work before it (E.3), decided before its receipt.
    const opening = isQuietLeft
      ? await drawAnswerCapsule($, e, place === undefined ? undefined : blocksSoFar[place.at]?.key, place?.turn, ruleWidth(lay) ?? width)
      : undefined
    const capsule = opening?.capsule
    // Quiet: the turn's last answer block ends with its receipt, once the turn is over (E.32).
    const endsTurn = place !== undefined && !blocksSoFar.slice(place.at + 1).some(f => f.turn === place.turn && f.kind === 'text')
    // The receipt that names this row (live, or a resumed transcript's, which has no place in the flow).
    const receipt = isQuietLeft ? await drawAnswerReceipt($, e, place?.turn ?? null, endsTurn, ruleWidth(lay) ?? width) : undefined

    return (
      <Box flexDirection="column">
        {above > 0 && closeRow(ui, lay, above)}
        {/* C.2: a capsule right under an event row (a failure) touches it. */}
        <Box flexDirection="column" marginTop={opening?.isAfterEvent === true ? 0 : gap}>
          {capsule !== undefined && <Box marginBottom={1}>{capsule}</Box>}
          {capsRow !== undefined && <Box marginBottom={1}>{cell(ui, lay, claude(true), drawParts(ui, capsRow, 'caps'))}</Box>}
          {(opensWide || lay.narrow) && label.length > 0 && <Text color={C.accent}>{label}</Text>}
          {segments.map((seg, si) =>
            seg.wide ? (
              <Box key={`seg-${si}`} marginTop={si > 0 || (opensWide && label.length > 0) ? 1 : 0} width="100%">
                <Markdown text={seg.text} />
              </Box>
            ) : (
              // Narrow: the label already stands as the caption line above.
              cell(
                ui,
                lay,
                claude(si === 0 && label.length > 0 && !lay.narrow),
                seg.blocks.map((b, i) => drawBlock(reply, b, `blk-${si}-${i}`, i > 0 ? 1 : 0)),
                si > 0 ? 1 : 0,
                `seg-${si}`
              )
            )
          )}
          {/* §0.2: one blank row above the frame; none of its own when the reply's only block is the list it replaces (the reply's gap is that row). */}
          {drawsFrame &&
            cell(
              ui,
              lay,
              undefined,
              drawRows(ui, sourcesFrame(mine, width, mineListed), 'sources'),
              blocks.every(b => b.kind === 'sources') ? 0 : 1,
              'sources'
            )}
        </Box>
        {receipt}
      </Box>
    )
  })
}
