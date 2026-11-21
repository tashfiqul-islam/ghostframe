import { G } from '../../shared/layout'
import type { Part } from '../../shared/parts'
import { clip, vw } from '../../shared/text'
import { C } from '../../shared/tokens'
import { sourceLabel } from '../../shared/url'
import { sup } from './cites'
import type { Cite } from './cites'
import { clipLabel, sourceTitles } from './labels'

const NOTE_LEAD = `${G.hEdge.repeat(4)} `
const NOTE_GAP = '   '
const NOTE_MIN = 12 // the narrowest entry worth its own room: `¹ ` and about ten cells of address

/**
 * The footnote lines for one block, each at most `width` cells:
 * `┄┄┄┄ ¹ host/path   ² host/path`. Every marker the block uses is listed, the first
 * block to use a source and any later one alike: entries share a line evenly while
 * each keeps `NOTE_MIN` cells, and the rest go to further lines under the first.
 * `byTitle`: name a source by its title (a Sources list) instead of its address.
 * `href` keeps the whole URL; the line itself draws only the short label.
 */
export function footnoteLines(cites: readonly Cite[], width: number, byTitle = false): Part[][] {
  const lead = vw(NOTE_LEAD)
  const perLine = Math.max(1, Math.floor((width - lead + vw(NOTE_GAP)) / (NOTE_MIN + vw(NOTE_GAP))))
  const lines: Part[][] = []
  const titles = byTitle ? sourceTitles(cites) : []

  for (let at = 0; at < cites.length; at += perLine) {
    const chunk = cites.slice(at, at + perLine)
    const share = Math.floor((width - lead - vw(NOTE_GAP) * (chunk.length - 1)) / chunk.length)
    const parts: Part[] = [{ t: at === 0 ? NOTE_LEAD : ' '.repeat(lead), color: C.hairline }]

    chunk.forEach((c, i) => {
      const title = titles[at + i] ?? c.title
      // `n` 0: a source with no marker (a Sources list item): a dim `·`, not a number.
      const mark = c.n > 0 ? `${sup(c.n)} ` : '· '
      // A URL's label clips in the middle (it ends on its most specific part); a title at a word.
      const text = byTitle ? clip(title, Math.max(1, share - vw(mark))) : clipLabel(sourceLabel(c.url), Math.max(1, share - vw(mark)))

      if (i > 0) parts.push({ t: NOTE_GAP, color: C.dim })
      // Link colour on the marker only; the label is muted (§0.2 URLs).
      parts.push({ t: mark, color: c.n > 0 ? C.link : C.dim }, { t: text, color: C.muted, href: c.url })
    })
    lines.push(parts)
  }

  return lines
}
