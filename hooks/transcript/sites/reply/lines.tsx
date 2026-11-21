// A reply's prose lines: laid out on the measure, drawn as one Text per block; a list's items under their markers.
import type { Ui } from '../../../shared/rule'
import { clip, vw } from '../../../shared/text'
import { C } from '../../../shared/tokens'
import type { Prepared } from '../../citations'
import { spansOf, toWords, wrapWords } from '../../prose'
import type { Run, Span } from '../../prose'
import { clipRuns } from '../../table/cells'

/** How a reply block's prose draws: the measure, and whether it is narration (`quiet`: dim, on `base`). */
export type Prose = { width: number; quiet: boolean; base: string }

// Every prose block, heading and table is ONE Text: its lines are laid out and clipped
// here, then joined with `\n`, so a redraw while text streams replaces the block whole
// and can never leave a stale sibling line behind. Keys come from block position.
export const drawLines = ({ Box, Text }: Ui, lines: Span[][], lineKey: string, gap: number) => (
  <Box key={lineKey} marginTop={gap}>
    <Text wrap="wrap">
      {lines.flatMap((line, li) => [
        ...(li > 0 ? ['\n'] : []),
        ...line.map((s, k) => (
          <Text
            key={`${li}.${k}`}
            color={s.color}
            {...(s.bg !== undefined ? { backgroundColor: s.bg } : {})}
            {...(s.bold ? { weight: 'bold' as const } : {})}
            {...(s.italic === true ? { italic: true } : {})}
          >
            {s.t}
          </Text>
        ))
      ])}
    </Text>
  </Box>
)

export const runsLine = ({ base, quiet }: Prose, line: Run[][], room: number) =>
  spansOf(
    clipRuns(
      line.flatMap((word, wi) => (wi > 0 ? [{ t: ' ', s: 'plain' as const }, ...word] : word)),
      room
    ),
    base,
    quiet
  )

// A list: `·` / `3.` muted, each item wrapped under its own text (a hanging indent),
// nested lists 2 further in. Every item is laid out alone, so a finished item never
// moves while a later one streams.
// §0.2: a bulleted list running straight into a numbered one (or back) is two block
// kinds, so one blank row where the top-level marker changes kind.
export const listLines = (prose: Prose, p: Prepared): Span[][] => {
  const { width, quiet } = prose

  return [
    ...(p.title !== undefined ? [[{ t: clip(p.title, width), color: quiet ? C.dim : C.textBright, bold: true }]] : []),
    ...p.items.flatMap((it, ii) => {
      const before = p.items
        .slice(0, ii)
        .toReversed()
        .find(x => x.depth === 0)
      const switched = it.depth === 0 && before !== undefined && (before.marker === '·') !== (it.marker === '·')
      const lead = ' '.repeat(it.depth * 2)
      const hang = vw(lead) + vw(it.marker) + 1
      const room = Math.max(8, width - hang)
      const rows = it.runs.length === 0 ? [[]] : wrapWords(toWords(it.runs), room)

      return [
        ...(switched ? [[] as Span[]] : []),
        ...rows.map((row, ri) => [{ t: ri === 0 ? `${lead}${it.marker} ` : ' '.repeat(hang), color: C.muted }, ...runsLine(prose, row, room)])
      ]
    })
  ]
}

// A list's top-level runs of one marker kind (bullets, numbers), each with the sources
// its own items cite: a footnote line goes right under the run that holds its markers.
export const listGroups = (p: Prepared): Prepared[] => {
  const groups: Prepared[] = []

  for (const it of p.items) {
    const last = groups[groups.length - 1]
    const head = last?.items.find(x => x.depth === 0)
    const same = last !== undefined && (it.depth > 0 || head === undefined || (head.marker === '·') === (it.marker === '·'))

    if (same && last !== undefined) last.items.push(it)
    else groups.push({ title: groups.length === 0 ? p.title : undefined, items: [it], cites: [] })
  }

  for (const g of groups) {
    for (const c of g.items.flatMap(x => x.cites)) if (!g.cites.some(y => y.n === c.n)) g.cites.push(c)
  }

  return groups
}
