// Linear on purpose: the closing `#` run is cut in code (`headingText`), not by backtracking.
export const HEADING: RegExp = /^\s{0,3}#{1,6}\s+(.*)$/

/**
 * A heading's text without its closing `#` run (CommonMark): the run goes only after a
 * space or tab, or when it is the whole text, so `C#` keeps its `#`.
 */
export const headingText = (raw: string): string => {
  const t = raw.trimEnd()
  let end = t.length

  while (end > 0 && t[end - 1] === '#') end--

  return end === 0 || t[end - 1] === ' ' || t[end - 1] === '\t' ? t.slice(0, end).trimEnd() : t
}
