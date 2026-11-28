// Builds site/public/fonts/*.woff2, the OFL texts, coverage.json and src/styles/fonts.css (ADR 0017).
// Run by hand when the subset changes: `cd site && bun build/fonts/subset.ts`. It needs mise's pinned fontTools (mise.toml);
// the site build itself never runs it and needs no Python.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FONT_FILES, GLYPHS, GLYPH_FACE_POINTS, SANS_GLYPHS } from './glyphs'

const site = join(import.meta.dirname, '..', '..')
const repo = join(site, '..')
const out = join(site, 'public', 'fonts')
const GOOGLE_FONTS = 'https://raw.githubusercontent.com/google/fonts/5026800714d07231937d92eb4cceabf06e05d74e/ofl'
const pins = {
  hanken: { url: `${GOOGLE_FONTS}/hankengrotesk/HankenGrotesk%5Bwght%5D.ttf`, sha256: '813b3f8fa0965405669a89b38e51bbefd95eef6b8e20d1cb2d8c10cce062662f' },
  jetbrains: { url: `${GOOGLE_FONTS}/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf`, sha256: '48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda' },
  hankenOfl: { url: `${GOOGLE_FONTS}/hankengrotesk/OFL.txt`, sha256: 'e02ccb89a86839b22feff7872ff5cc355cc0f58318d29eee20e2cf83a612f16d' },
  jetbrainsOfl: { url: `${GOOGLE_FONTS}/jetbrainsmono/OFL.txt`, sha256: 'b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d' },
  // JuliaMono v0.63.2's release archive; its LICENSE is the OFL text.
  julia: {
    url: 'https://github.com/cormullion/juliamono/releases/download/v0.63.2/JuliaMono-ttf.tar.gz',
    sha256: 'be6517295198ec5c92bdbaad42f4f6f8d83f921d80512b79f54fe036add95c0c'
  }
}
const JULIA_REGULAR_SHA256 = '40a07da0d1601215eb6b89312eb44128a3e2f36675d3e1f518264bd391fc7023'
const JULIA_LICENSE_SHA256 = 'bae3beff9e15f1a680c2764c4bbdb25b995b9bf539aeaf8467482a495c75ad0c'

// Fallback metrics need the fallback fonts' widths. Read once with fontTools from Arial and Courier New (unitsPerEm 2048),
// weighted by the letter frequencies below (Capsize's latin table, a to z and the space): shortcut: Windows' files,
// other versions of Arial differ by a hair, so re-read them only if the page jumps while the font loads.
const ARIAL_AVERAGE_EM = 0.439006
const COURIER_NEW_ADVANCE_EM = 1229 / 2048
const FREQUENCY: Record<string, number> = {
  ' ': 0.154,
  a: 0.0668,
  b: 0.0114,
  c: 0.0232,
  d: 0.0298,
  e: 0.0922,
  f: 0.017,
  g: 0.0155,
  h: 0.0351,
  i: 0.0588,
  j: 0.0009,
  k: 0.0046,
  l: 0.0304,
  m: 0.0181,
  n: 0.0578,
  o: 0.0571,
  p: 0.0163,
  q: 0.0008,
  r: 0.0526,
  s: 0.0469,
  t: 0.0672,
  u: 0.0207,
  v: 0.0076,
  w: 0.011,
  x: 0.0025,
  y: 0.0123,
  z: 0.0011
}

function run(cmd: string[], cwd = repo): string {
  // A fixed timestamp keeps fontTools from stamping the time into the files: the same inputs give the same bytes.
  const done = Bun.spawnSync(cmd, { cwd, env: { ...process.env, SOURCE_DATE_EPOCH: '1764374400' } })
  if (done.exitCode !== 0) throw new Error(`${cmd.join(' ')} failed:\n${done.stderr.toString()}`)
  return done.stdout.toString()
}
const fonttools = (...args: string[]) => run(['mise', 'exec', '--', ...args])
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const unicodes = (points: number[]) => `--unicodes=${points.map(p => `U+${p.toString(16).toUpperCase()}`).join(',')}`

async function download({ url, sha256: want }: { url: string; sha256: string }, to: string) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  if (sha256(bytes) !== want) throw new Error(`${url} is not the pinned file: sha256 ${sha256(bytes)}, pinned ${want}`)
  writeFileSync(to, bytes)
}

interface Tables {
  unitsPerEm: number
  ascent: number
  descent: number
  lineGap: number
  codePoints: number[]
  advanceOf: (codePoint: number) => number
}
/** head, hhea, cmap and hmtx of a font file, through `ttx`. */
function tables(file: string): Tables {
  const xml = fonttools('ttx', '-t', 'head', '-t', 'hhea', '-t', 'cmap', '-t', 'hmtx', '-o', '-', file)
  const num = (tag: string) => Number(xml.match(new RegExp(`<${tag} value="(-?\\d+)"`))![1])
  const names = new Map([...xml.matchAll(/<map code="0x([0-9a-f]+)" name="([^"]+)"/g)].map(m => [parseInt(m[1]!, 16), m[2]!]))
  const widths = new Map([...xml.matchAll(/<mtx name="([^"]+)" width="(\d+)"/g)].map(m => [m[1]!, Number(m[2])]))
  const unitsPerEm = num('unitsPerEm')
  return {
    unitsPerEm,
    ascent: num('ascent'),
    descent: num('descent'),
    lineGap: num('lineGap'),
    codePoints: [...names.keys()].toSorted((a, b) => a - b),
    advanceOf: point => widths.get(names.get(point)!)! / unitsPerEm
  }
}

const weightedAverageEm = (font: Tables) => {
  const total = Object.values(FREQUENCY).reduce((sum, w) => sum + w, 0)
  return Object.entries(FREQUENCY).reduce((sum, [char, w]) => sum + font.advanceOf(char.codePointAt(0)!) * w, 0) / total
}

/** Capsize's overrides for `font` standing in until it loads: scaled to the fallback's width, metrics from the font's own. */
function overrides(font: Tables, sizeAdjust: number) {
  const pct = (units: number) => `${((Math.abs(units) / font.unitsPerEm / sizeAdjust) * 100).toFixed(4)}%`
  return { sizeAdjust: `${(sizeAdjust * 100).toFixed(4)}%`, ascent: pct(font.ascent), descent: pct(font.descent), lineGap: pct(font.lineGap) }
}

const tmp = mkdtempSync(join(tmpdir(), 'ghostframe-fonts-'))
const at = (name: string) => join(tmp, name)
await Promise.all(Object.entries(pins).map(([name, pin]) => download(pin, at(name === 'julia' ? 'julia.tar.gz' : name))))
mkdirSync(at('julia'))
run(['tar', '-xzf', '../julia.tar.gz'], at('julia'))
const juliaRegular = at('julia/JuliaMono-Regular.ttf')
if (sha256(readFileSync(juliaRegular)) !== JULIA_REGULAR_SHA256) throw new Error('JuliaMono-Regular.ttf is not the v0.63.2 file')
if (sha256(readFileSync(at('julia/LICENSE'))) !== JULIA_LICENSE_SHA256) throw new Error('JuliaMono LICENSE is not the v0.63.2 file')

mkdirSync(out, { recursive: true })
const target = (file: string) => join(out, file)
const subset = (from: string, file: string, points: number[], ...extra: string[]) =>
  fonttools('pyftsubset', from, unicodes(points), '--no-hinting', '--flavor=woff2', ...extra, `--output-file=${target(file)}`)

fonttools('fonttools', 'varLib.instancer', at('hanken'), 'wght=400:800', '-o', at('hanken-400-800.ttf'))
fonttools('fonttools', 'varLib.instancer', at('jetbrains'), 'wght=400:500', '-o', at('jetbrains-400-500.ttf'))
subset(at('hanken-400-800.ttf'), FONT_FILES['Hanken Grotesk'], SANS_GLYPHS)
subset(at('jetbrains-400-500.ttf'), FONT_FILES['JetBrains Mono'], GLYPHS, '--layout-features-=liga,calt')
subset(juliaRegular, FONT_FILES.glyphs, GLYPH_FACE_POINTS, '--layout-features=')

writeFileSync(target('OFL-hanken-grotesk.txt'), readFileSync(at('hankenOfl')))
writeFileSync(target('OFL-jetbrains-mono.txt'), readFileSync(at('jetbrainsOfl')))
writeFileSync(target('OFL-julia-mono.txt'), readFileSync(at('julia/LICENSE')))

const glyphFace = tables(target(FONT_FILES.glyphs))
for (const point of GLYPH_FACE_POINTS) {
  if (!glyphFace.codePoints.includes(point)) throw new Error(`JuliaMono has no U+${point.toString(16).toUpperCase()}`)
  if (glyphFace.advanceOf(point) !== 0.6)
    throw new Error(`JuliaMono's U+${point.toString(16).toUpperCase()} advances ${glyphFace.advanceOf(point)} em, not 0.6`)
}

const coverage = Object.fromEntries(
  Object.values(FONT_FILES).map(file => [file, { sha256: sha256(readFileSync(target(file))), codePoints: tables(target(file)).codePoints }])
)
writeFileSync(target('coverage.json'), `${JSON.stringify(coverage)}\n`)

const hanken = tables(at('hanken'))
const jetbrains = tables(at('jetbrains'))
const sans = overrides(hanken, weightedAverageEm(hanken) / ARIAL_AVERAGE_EM)
const mono = overrides(jetbrains, jetbrains.advanceOf(0x61) / COURIER_NEW_ADVANCE_EM)
if (overrides(jetbrains, 1).ascent !== '102.0000%' || overrides(jetbrains, 1).descent !== '30.0000%')
  throw new Error(`JetBrains Mono's own metrics are not 102% and 30%`)

writeFileSync(
  join(site, 'src', 'styles', 'fonts.css'),
  `/* Written by build/fonts/subset.ts; run it to change this file. @font-face only: the families live in tokens.css.
   The fallback faces are Capsize-style (size-adjust and the three overrides), computed by subset.ts from the fonts' own
   head, hhea, cmap and hmtx tables: ascent, descent and line gap over size-adjust, size-adjust = the web font's
   frequency-weighted average advance over Arial's (Hanken) or Courier New's (JetBrains Mono). Courier New advances 0.6 em like
   JetBrains Mono, so the cell grid holds while the font loads. */
@font-face {
  font-family: 'Hanken Grotesk';
  src: url('/fonts/${FONT_FILES['Hanken Grotesk']}') format('woff2');
  font-weight: 400 800;
  font-display: swap;
}

@font-face {
  font-family: 'JetBrains Mono';
  src: url('/fonts/${FONT_FILES['JetBrains Mono']}') format('woff2');
  font-weight: 400 500;
  font-display: swap;
}

/* ✓ ↻ ∴ ▮ are in neither font: JuliaMono's four glyphs, its own family, listed after JetBrains Mono in --mono, fetched only
   by a page that draws one. Its metrics are JetBrains Mono's own, so a glyph from it never changes a line's height. */
@font-face {
  font-family: 'Julia Glyphs';
  src: url('/fonts/${FONT_FILES.glyphs}') format('woff2');
  font-weight: 400 500;
  font-display: swap;
  unicode-range: ${GLYPH_FACE_POINTS.map(p => `U+${p.toString(16).toUpperCase()}`).join(', ')};
  ascent-override: 102%;
  descent-override: 30%;
  line-gap-override: 0%;
}

@font-face {
  font-family: 'Hanken Fallback';
  src: local('Arial'), local('ArialMT');
  size-adjust: ${sans.sizeAdjust};
  ascent-override: ${sans.ascent};
  descent-override: ${sans.descent};
  line-gap-override: ${sans.lineGap};
}

@font-face {
  font-family: 'Mono Fallback';
  src: local('Courier New'), local('CourierNewPSMT');
  size-adjust: ${mono.sizeAdjust};
  ascent-override: ${mono.ascent};
  descent-override: ${mono.descent};
  line-gap-override: ${mono.lineGap};
}
`
)
// The repo's formatter owns the layout of the two text files, so a rerun leaves no diff beyond what changed.
run(['bun', 'x', 'oxfmt', 'site/public/fonts/coverage.json', 'site/src/styles/fonts.css'])
console.log(Object.fromEntries(Object.values(FONT_FILES).map(file => [file, readFileSync(target(file)).length])))
