// Word wrapping for the left's text column (spec 6.1): prose wraps at the column's width, by words; a word longer than
// the row is broken where it must be.
import { widthOf } from './width'

/**
 * Text broken into rows of at most `width` cells, by words.
 * @param text one paragraph, its own line breaks kept as row breaks
 * @param width the cells a row may take
 * @returns the rows
 */
export function wrapWords(text: string, width: number): string[] {
  const room = Math.max(1, width)
  const out: string[] = []

  for (const line of text.split('\n')) {
    let row = ''

    for (const word of line.split(/ +/).filter(w => w.length > 0)) {
      let w = word

      while (widthOf(w) > room) {
        if (row.length > 0) {
          out.push(row)
          row = ''
        }

        const chars = Array.from(w)
        let head = ''

        for (const ch of chars) {
          if (widthOf(head + ch) > room) break
          head += ch
        }

        out.push(head)
        w = w.slice(head.length)
      }

      if (row.length === 0) row = w
      else if (widthOf(row) + 1 + widthOf(w) <= room) row += ` ${w}`
      else {
        out.push(row)
        row = w
      }
    }

    out.push(row)
  }

  return out
}
