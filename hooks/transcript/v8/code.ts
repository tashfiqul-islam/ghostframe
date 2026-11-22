// Code cards on the left (spec 7.5): a `codeHead` strip with the language, the path, the diff's counts and the copy
// key, over a `code` body with line-number gutters. A diff has two gutters (old, new), its added and removed rows
// tinted the card's full width, the words that changed highlighted. Pure.
import type { Part } from '../../shared/parts'
import { bottomEdge, cardRow, topEdge } from '../../shared/look/card'
import { GLYPH } from '../../shared/look/glyphs'
import { TINT, TOKEN } from '../../shared/look/palette'
import { cutPath, splitPath } from '../../shared/look/paths'

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** Whether a fence's lines are a unified diff: a hunk header, and rows that each start `+`, `-` or a space. */
export function isUnifiedDiff(lines: readonly string[]): boolean {
  return lines.some(l => HUNK.test(l)) && lines.every(l => l.length === 0 || /^[+\- @\\]/.test(l))
}

/** A language as the strip names it (7.5): bold capitals, from the fence's word or the path's extension. */
export function languageOf(lang: string, path: string): string {
  const word = lang.length > 0 ? lang : (/\.([A-Za-z0-9]+)$/.exec(path)?.[1] ?? '')
  const alias: Record<string, string> = { yml: 'YAML', yaml: 'YAML', ts: 'TS', tsx: 'TSX', js: 'JS', jsx: 'JSX', py: 'PY', sh: 'SH', bash: 'SH', md: 'MD' }

  return (alias[word.toLowerCase()] ?? word).toUpperCase()
}

/** A path drawn folder dim, file bright (5.4). */
export function pathParts(path: string, cells: number): Part[] {
  const { folder, file } = splitPath(cutPath(path, cells))

  return [...(folder.length > 0 ? [{ t: folder, color: TOKEN.dim }] : []), { t: file, color: TOKEN.textBright }]
}

/** The copy key at a card's right end (7.5): `c` in accent, `copy` dim. */
const COPY: Part[] = [
  { t: 'c', color: TOKEN.accent },
  { t: ' copy', color: TOKEN.dim }
]

/** The head strip's rows: its top edge, the strip, and the edge into the body. */
function head(lang: string, path: string, counts: Part[], width: number): Part[][] {
  const name: Part[] = [
    ...(lang.length > 0 ? [{ t: lang, color: TOKEN.machine, bold: true }] : []),
    ...(lang.length > 0 && path.length > 0 ? [{ t: '   ', color: TOKEN.dim }] : []),
    ...(path.length > 0 ? pathParts(path, width - 30) : [])
  ]
  const right = [...counts, ...(counts.length > 0 ? [{ t: '     ', color: TOKEN.dim }] : []), ...COPY]

  return [topEdge(TOKEN.codeHead, width), cardRow(name, TOKEN.codeHead, width, undefined, right), topEdge(TOKEN.code, width, TOKEN.codeHead)]
}

const gutter = (n: number | undefined, cells: number): Part => ({ t: (n === undefined ? '' : String(n)).padStart(cells), color: TOKEN.dim })

/**
 * A code block that is not a diff (7.5): the strip, then one gutter.
 * @param lines the block's lines
 * @param lang the fence's language word
 * @param path a path the fence's info names, '' for none
 * @param width the text column's cells
 * @returns the rows
 */
export function codeCard(lines: readonly string[], lang: string, path: string, width: number): Part[][] {
  const body = lines.map((l, i) => cardRow([gutter(i + 1, 3), { t: '  ', color: TOKEN.dim }, { t: l, color: TOKEN.text }], TOKEN.code, width))

  return [...head(languageOf(lang, path), path, [], width), ...body, bottomEdge(TOKEN.code, width)]
}

/** The changed middle of a pair of rows: what lies between their common head and tail, at word edges. */
function changedSpan(a: string, b: string): { from: number; toA: number; toB: number } {
  let from = 0

  while (from < a.length && from < b.length && a[from] === b[from]) from++
  while (from > 0 && /\w/.test(a[from - 1] ?? '')) from--

  let tail = 0

  while (tail < a.length - from && tail < b.length - from && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  while (tail > 0 && /\w/.test(a[a.length - tail] ?? '')) tail--

  return { from, toA: a.length - tail, toB: b.length - tail }
}

/** A diff row's content, its changed words on the word tint. */
function changed(text: string, span: { from: number; to: number } | undefined, color: string, word: string): Part[] {
  if (span === undefined || span.to <= span.from) return [{ t: text, color }]

  return [
    { t: text.slice(0, span.from), color },
    { t: text.slice(span.from, span.to), color, bg: word },
    { t: text.slice(span.to), color }
  ].filter(p => p.t.length > 0)
}

/**
 * A diff as a code card (7.5): the strip with `+n −n`, two gutters (old, new), `+` and `−` rows tinted the card's
 * full width, the changed words of a removed row and the added row after it highlighted.
 * @param lines the unified diff's rows (`---`, `+++` and `@@` headers kept or not)
 * @param info the fence's info, which may name the path
 * @param width the text column's cells
 * @returns the rows
 */
export function diffCard(lines: readonly string[], info: string, width: number): Part[][] {
  const named = /^\+\+\+ (?:b\/)?(.+)$/m.exec(lines.join('\n'))?.[1]
  const path = (info.trim().length > 0 ? info.trim() : (named ?? '')).replace(/^b\//, '')
  const rows = lines.filter(l => !/^(?:---|\+\+\+) /.test(l) && !l.startsWith('\\'))
  const adds = rows.filter(l => l.startsWith('+')).length
  const dels = rows.filter(l => l.startsWith('-')).length
  const counts: Part[] = [
    ...(adds > 0 ? [{ t: `+${adds}`, color: TOKEN.ok }] : []),
    ...(adds > 0 && dels > 0 ? [{ t: ' ', color: TOKEN.dim }] : []),
    ...(dels > 0 ? [{ t: `${GLYPH.minus}${dels}`, color: TOKEN.err }] : [])
  ]
  const body: Part[][] = []
  let oldNo = 0
  let newNo = 0

  for (let i = 0; i < rows.length; i++) {
    const l = rows[i] ?? ''
    const hunk = HUNK.exec(l)

    if (hunk !== null) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      continue
    }

    const sign = l[0] ?? ' '
    const text = l.slice(1)
    // A removed row and the added row right after it are one change: their differing words are highlighted.
    const pair = sign === '-' ? rows[i + 1] : sign === '+' ? rows[i - 1] : undefined
    const other = pair !== undefined && (pair[0] ?? '') === (sign === '-' ? '+' : '-') ? pair.slice(1) : undefined
    const span = other === undefined ? undefined : sign === '-' ? changedSpan(text, other) : changedSpan(other, text)
    const own = span === undefined ? undefined : sign === '-' ? { from: span.from, to: span.toA } : { from: span.from, to: span.toB }

    if (sign === '+') {
      body.push(line(undefined, newNo, '+', changed(text, own, TOKEN.text, TINT.addedWord), TINT.addedLine, width))
      newNo++
    } else if (sign === '-') {
      body.push(line(oldNo, undefined, GLYPH.minus, changed(text, own, TOKEN.text, TINT.removedWord), TINT.removedLine, width))
      oldNo++
    } else {
      body.push(line(oldNo, newNo, ' ', [{ t: text, color: TOKEN.text }], TOKEN.code, width))
      oldNo++
      newNo++
    }
  }

  return [...head(languageOf('', path), path, counts, width), ...body, bottomEdge(TOKEN.code, width)]
}

/** One diff row: the two gutters, the sign, the content, on the row's tint. */
function line(oldNo: number | undefined, newNo: number | undefined, sign: string, content: Part[], bg: string, width: number): Part[] {
  const signColor = sign === '+' ? TOKEN.ok : TOKEN.err

  return cardRow(
    [gutter(oldNo, 3), gutter(newNo, 4), { t: '  ', color: TOKEN.dim }, { t: sign, color: signColor }, { t: ' ', color: TOKEN.dim }, ...content],
    bg,
    width
  )
}
