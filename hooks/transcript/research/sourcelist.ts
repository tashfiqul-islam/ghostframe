// A `Sources:` list: the label line, then one link per item (an optional ` — note` after).
const SOURCES_LABEL = /^\s{0,3}(?:#{1,6}\s+)?(?:\*\*|__)?sources?:?(?:\*\*|__)?:?\s*$/i
const SOURCE_ITEM = /^\s{0,3}(?:[-*+]|\d+[.)])\s+\[([^[\]\n]+)\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)\s*(?:[-–—:·]\s*.*)?$/

export const isSourcesLabel = (line: string): boolean => SOURCES_LABEL.test(line)

/** A block's lines as a sources list (label optional when `labelled` says the line above was it). */
export function sourceItems(lines: readonly string[], labelled: boolean): { title: string; url: string }[] | undefined {
  const body = lines.length > 0 && isSourcesLabel(lines[0] ?? '') ? lines.slice(1) : labelled ? lines : undefined

  if (body === undefined || body.length === 0) return undefined

  const items: { title: string; url: string }[] = []

  for (const l of body) {
    const m = SOURCE_ITEM.exec(l)

    if (m === null) return undefined
    items.push({ title: (m[1] ?? '').replace(/[*_`]/g, '').trim(), url: m[2] ?? '' })
  }

  return items
}

/**
 * A Sources list still streaming (the reply's last block): its label, then whole items,
 * then at most one item still being written. Its whole items, the one being written left
 * out until it is whole; `[]` for the label alone. Anything else → undefined.
 * The list then draws the same way while it streams as once it's done, never as a
 * paragraph or a plain list on the way (§6: a drawn row never changes).
 */
export function pendingSourceItems(lines: readonly string[], labelled: boolean): { title: string; url: string }[] | undefined {
  const body = lines.length > 0 && isSourcesLabel(lines[0] ?? '') ? lines.slice(1) : labelled ? lines : undefined

  if (body === undefined) return undefined

  const last = body[body.length - 1]
  const whole = last !== undefined && SOURCE_ITEM.test(last) ? body : body.slice(0, -1)

  // The line being written must look like the start of another item.
  if (whole.length < body.length && !/^\s{0,3}(?:[-*+]|\d+[.)])(\s|$)/.test(last ?? '')) return undefined

  return whole.length === 0 ? [] : sourceItems(whole, true)
}

/** A line that may still become a Sources label as it streams (`S`, `Sour`, `**Sources`). */
export const isSourcesLabelPrefix = (line: string): boolean =>
  /^\s{0,3}(?:#{1,6}\s+)?(?:\*\*|__)?s(?:o(?:u(?:r(?:c(?:e(?:s)?)?)?)?)?)?:?(?:\*\*|__)?:?\s*$/i.test(line)
