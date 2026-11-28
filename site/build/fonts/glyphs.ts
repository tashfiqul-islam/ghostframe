// The code points the font subsets keep, and which file sets which. subset.ts builds the files from this; the tests hold
// the built pages to it. Facts (versions, commands) come from the repository and are ASCII, so they need nothing here.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { words } from '../../src/content/words'

const handoff = join(import.meta.dirname, '..', '..', '..', 'docs', 'design', 'website', 'handoff', 'build')

function* strings(value: unknown): Generator<string> {
  if (typeof value === 'string') yield value
  else if (value && typeof value === 'object') for (const inner of Object.values(value)) yield* strings(inner)
}

/** The code points of the characters in every string of `text`. */
function pointsOf(text: Iterable<string>): number[] {
  return Array.from(text).flatMap(chunk => Array.from(chunk, char => char.codePointAt(0)!))
}

/** The characters of the site's own words. */
export const WORDS_POINTS = [...new Set(pointsOf(strings(words)))].toSorted((a, b) => a - b)

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
export const BOX_AND_BLOCKS = range(0x2500, 0x259f)
const SYMBOLS = pointsOf(['❯→↗←↑↓·×—–●○■□▸▾…’“”'])
const PRINTABLE_ASCII = range(0x20, 0x7e)
const HANDOFF = pointsOf(['session.ts', 'content.ts'].map(file => readFileSync(join(handoff, file), 'utf8')))

/** Every code point the mono subset keeps. */
export const GLYPHS = [
  ...new Set([...PRINTABLE_ASCII, ...BOX_AND_BLOCKS, ...SYMBOLS, ...WORDS_POINTS, ...HANDOFF].filter(p => p >= 0x20 && p !== 0x7f))
].toSorted((a, b) => a - b)

/** The sans subset: the same, without the box and block ranges the proportional face never sets. */
export const SANS_GLYPHS = GLYPHS.filter(p => !BOX_AND_BLOCKS.includes(p))

/** `✓ ↻ ∴ ▮`: in neither main font, so a third face holds them (ADR 0017). */
export const GLYPH_FACE_POINTS = [0x2713, 0x21bb, 0x2234, 0x25ae]

/** The woff2 file that sets text in each family; the glyph face is joined to the mono family by `unicode-range`. */
export const FONT_FILES = { 'Hanken Grotesk': 'hanken-grotesk.woff2', 'JetBrains Mono': 'jetbrains-mono.woff2', glyphs: 'julia-mono-glyphs.woff2' } as const
