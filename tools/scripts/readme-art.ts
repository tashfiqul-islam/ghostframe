// The README's designed images, drawn from the brand's tokens: a divider, a feature strip (wide, and stacked for
// narrow screens) and the "runs on" platform chip, each in a dark and a light version, as SVG under
// docs/assets/readme/. Text is Hanken Grotesk turned into outlines here, so it looks the same in every browser and
// needs no font; the platform icons are docs/assets/icons/'s Font Awesome paths, embedded unchanged and recoloured.
//
//   bun tools/scripts/readme-art.ts           draws them (needs Hanken Grotesk's variable font, or README_ART_FONT)
//   bun tools/scripts/readme-art.ts --check   every image is there, within its size limit, with no live text (the gate)
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const out = join(root, 'docs', 'assets', 'readme')

type Theme = 'dark' | 'light'
const THEMES: readonly Theme[] = ['dark', 'light']

/** Each image's file stem and its size limit in bytes; every stem has a -dark and a -light file. */
const LIMITS: Readonly<Record<string, number>> = { divider: 5 * 1024, features: 30 * 1024, 'features-narrow': 30 * 1024, platforms: 15 * 1024 }

/** The colours, per theme. Page backgrounds are GitHub's (#0d1117, #ffffff); card surfaces sit one step off them. */
const C = {
  dark: {
    gold: '#FFC83D',
    goldOpacity: 0.4,
    card: '#161b22',
    cardBorder: '#2a313c',
    title: '#e6edf3',
    body: '#9198a1',
    chipBorder: '#2a313c',
    chipSurface: '#11151c',
    chipLabel: '#1a2029',
    chipText: '#e6edf3',
    chipIcon: '#9198a1'
  },
  light: {
    // GitHub's attention colour: a darker gold that holds 3:1 (about 4.9:1) on white.
    gold: '#9A6700',
    goldOpacity: 1,
    card: '#f6f8fa',
    cardBorder: '#d1d9e0',
    title: '#1f2328',
    body: '#59636e',
    chipBorder: '#d1d9e0',
    chipSurface: '#f6f8fa',
    chipLabel: '#eef1f4',
    chipText: '#1f2328',
    chipIcon: '#59636e'
  }
} as const

const FEATURES = [
  { title: 'Live timeline', dot: '#5DCAA5', body: 'Every step of the turn as it runs: tools, shells, agents, failures and fixes.' },
  { title: 'Files, sources, to-dos', dot: '#FFC83D', body: "What changed, what Claude read and what's left, one tab each in the pane." },
  { title: 'Budget status line', dot: '#D97757', body: 'Model, repo, context and your 5-hour and weekly limits in two rows.' }
] as const

const PLATFORMS = [
  { icon: 'windows', name: 'Windows' },
  { icon: 'apple', name: 'macOS' },
  { icon: 'linux', name: 'Linux' }
] as const

const n = (v: number): string => String(Math.round(v * 100) / 100)

/** A #rrggbb colour's relative luminance (WCAG). */
const lum = (hex: string): number => {
  const [r = 0, g = 0, bl = 0] = [1, 3, 5]
    .map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))

  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}

/**
 * WCAG contrast of two colours.
 * @param a a #rrggbb colour
 * @param b another
 * @returns the ratio, 1 to 21
 */
export function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [lum(a), lum(b)].toSorted((x, y) => y - x)

  return (hi + 0.05) / (lo + 0.05)
}

/** Every image's path on disk. */
const files = (): string[] => Object.keys(LIMITS).flatMap(stem => THEMES.map(t => join(out, `${stem}-${t}.svg`)))

/**
 * What is wrong with the drawn images: a file missing, over its size limit, or holding live text.
 * @returns one problem per entry; empty when all is well
 */
export function artProblems(): string[] {
  const problems: string[] = []

  for (const [stem, limit] of Object.entries(LIMITS)) {
    for (const theme of THEMES) {
      const name = `${stem}-${theme}.svg`
      const file = join(out, name)

      if (!existsSync(file)) {
        problems.push(`${name} is missing`)
        continue
      }
      const size = statSync(file).size

      if (size > limit) problems.push(`${name} is ${size} bytes, over its ${limit}`)
      if (/<text\b|font-family/.test(readFileSync(file, 'utf8'))) problems.push(`${name} has live text; text must be outlines`)
    }
  }

  return problems
}

if (process.argv[2] === '--check') {
  const problems = artProblems()

  if (contrast(C.light.gold, '#ffffff') < 3) problems.push(`the light divider's gold ${C.light.gold} is under 3:1 on white`)
  if (problems.length > 0) {
    console.error(`readme-art: ${problems.join('; ')}`)
    process.exit(1)
  }
  console.log(`readme-art: ${files().length} images, each within its limit, all text outlined.`)
  process.exit(0)
}

// ─── Drawing ───

const fontkit = await import('fontkit')
const fontDir = join(process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')
const fontFile =
  process.env['README_ART_FONT'] ??
  [join(fontDir, 'HankenGrotesk-VariableFont_wght.ttf'), 'C:/Windows/Fonts/HankenGrotesk-VariableFont_wght.ttf'].find(f => existsSync(f))

if (fontFile === undefined) throw new Error("Hanken Grotesk's variable font is not installed; install it or set README_ART_FONT")
const opened = fontkit.openSync(fontFile)

if (!('getVariation' in opened)) throw new Error(`${fontFile}: a font collection, not one font`)
const base = opened
const weights = new Map<number, typeof base>()
const at = (weight: number): typeof base => {
  const got = weights.get(weight) ?? base.getVariation({ wght: weight })

  weights.set(weight, got)

  return got
}

const OPS: Readonly<Record<string, string>> = { moveTo: 'm', lineTo: 'l', quadraticCurveTo: 'q', bezierCurveTo: 'c', closePath: 'z' }

/** A number to one decimal, as short as it writes: 0.1 px is 0.2 device pixels at 2x. */
const d1 = (v: number): string => {
  const s = String(Math.round(v * 10) / 10)

  return s.replace(/^(-?)0\./, '$1.')
}

/** One image's glyphs: each distinct glyph, at each weight and size, is drawn once in <defs> and placed with <use>. */
class Glyphs {
  private readonly ids = new Map<string, string>()
  private readonly defs: string[] = []

  /**
   * Text as glyphs placed on a baseline.
   * @param s the text
   * @param o the weight, the size in px, the left edge, the baseline, the fill, and the tracking in em
   * @returns the <use> elements, in a group with the fill
   */
  text(s: string, o: { weight: number; size: number; x: number; y: number; fill: string; tracking?: number }): string {
    const font = at(o.weight)
    const k = o.size / font.unitsPerEm
    const run = font.layout(s)
    const uses: string[] = []
    let pen = o.x

    for (const [i, glyph] of run.glyphs.entries()) {
      const pos = run.positions[i]
      const key = `${o.weight}/${o.size}/${glyph.id}`
      let id = this.ids.get(key)

      if (id === undefined && glyph.path.commands.length > 0) {
        id = `g${this.ids.size.toString(36)}`
        this.ids.set(key, id)
        this.defs.push(`<path id="${id}" d="${pathOf(glyph.path.commands, k)}"/>`)
      }
      if (id !== undefined) uses.push(`<use href="#${id}" x="${d1(pen + (pos?.xOffset ?? 0) * k)}" y="${d1(o.y)}"/>`)
      pen += (pos?.xAdvance ?? glyph.advanceWidth) * k + (o.tracking ?? 0) * o.size
    }

    return `<g fill="${o.fill}">${uses.join('')}</g>`
  }

  /** The <defs> that hold every glyph used. */
  get defsElement(): string {
    return this.defs.length === 0 ? '' : `<defs>${this.defs.join('')}</defs>`
  }
}

/**
 * A glyph's outline as relative path data at its origin, in page space (y down), scaled to px. Each point is mapped
 * as it is read: fontkit caches a glyph's path, so it is never transformed in place.
 * @param commands the glyph's path commands, in font units
 * @param k px per font unit
 * @returns the path data
 */
function pathOf(commands: readonly { command: string; args: number[] }[], k: number): string {
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0

  return commands
    .map(c => {
      if (c.command === 'closePath') {
        cx = sx
        cy = sy

        return 'z'
      }
      const pts: string[] = []
      let ex = cx
      let ey = cy

      for (let j = 0; j < c.args.length; j += 2) {
        const x = Math.round((c.args[j] ?? 0) * k * 10) / 10
        const y = Math.round(-(c.args[j + 1] ?? 0) * k * 10) / 10

        pts.push(`${d1(x - cx)} ${d1(y - cy)}`)
        ex = x
        ey = y
      }
      cx = ex
      cy = ey
      if (c.command === 'moveTo') {
        sx = cx
        sy = cy
      }

      return `${OPS[c.command] ?? ''}${pts.join(' ')}`
    })
    .join('')
    .replaceAll(' -', '-')
}

/**
 * The advance width of a line of text.
 * @param s the text
 * @param weight its weight
 * @param size its size in px
 * @param tracking extra space between letters, in em
 * @returns its width in px, without the tracking after the last letter
 */
function widthOf(s: string, weight: number, size: number, tracking = 0): number {
  const font = at(weight)
  const k = size / font.unitsPerEm
  const run = font.layout(s)
  const advance = run.positions.reduce((sum, p) => sum + p.xAdvance * k, 0)

  return advance + Math.max(0, run.glyphs.length - 1) * tracking * size
}
const capOf = (weight: number, size: number): number => (at(weight).capHeight / at(weight).unitsPerEm) * size

/**
 * Words wrapped to a width.
 * @param s the text
 * @param weight its weight
 * @param size its size in px
 * @param max the widest a line may be
 * @returns the lines
 */
function wrap(s: string, weight: number, size: number, max: number): string[] {
  const lines: string[] = []
  let line = ''

  for (const word of s.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`

    if (line !== '' && widthOf(next, weight, size) > max) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line !== '') lines.push(line)

  return lines
}

const svg = (w: number, h: number, body: string, label: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}" role="img" aria-label="${label}">${body}</svg>\n`

/** The README's content width at desktop, in CSS pixels. */
const WIDE = 860

function divider(t: Theme): string {
  const c = C[t]
  const h = 18
  const y = h / 2
  const from = WIDE * 0.2
  const to = WIDE * 0.8
  const mid = WIDE / 2
  const s = 3.5
  const stops = [0, 0.5, 1].map(off => `<stop offset="${off}" stop-color="${c.gold}" stop-opacity="${off === 0.5 ? c.goldOpacity : 0}"/>`).join('')

  return svg(
    WIDE,
    h,
    `<defs><linearGradient id="g" x1="${n(from)}" x2="${n(to)}" y1="0" y2="0" gradientUnits="userSpaceOnUse">${stops}</linearGradient></defs>` +
      `<rect x="${n(from)}" y="${n(y - 0.5)}" width="${n(to - from)}" height="1" fill="url(#g)"/>` +
      `<rect x="${n(mid - s)}" y="${n(y - s)}" width="${n(2 * s)}" height="${n(2 * s)}" transform="rotate(45 ${n(mid)} ${n(y)})" fill="${c.gold}"/>`,
    ''
  )
}

function features(t: Theme, isNarrow: boolean): string {
  const c = C[t]
  const width = isNarrow ? 360 : WIDE
  const gap = isNarrow ? 12 : 16
  const cardW = isNarrow ? width : (width - 2 * gap) / 3
  const pad = 16
  const lineH = 19
  const wrapped = FEATURES.map(f => wrap(f.body, 400, 13, cardW - 2 * pad))
  const cardH = 44 + Math.max(...wrapped.map(l => l.length)) * lineH + 6
  const height = isNarrow ? 3 * cardH + 2 * gap : cardH
  const glyphs = new Glyphs()
  const parts: string[] = []

  for (const [i, f] of FEATURES.entries()) {
    const x = isNarrow ? 0 : i * (cardW + gap)
    const y = isNarrow ? i * (cardH + gap) : 0

    parts.push(
      `<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${n(cardW - 1)}" height="${n(cardH - 1)}" rx="10" fill="${c.card}" stroke="${c.cardBorder}"/>`,
      `<rect x="${n(x + pad)}" y="${n(y + 18)}" width="8" height="8" rx="2" fill="${f.dot}"/>`,
      glyphs.text(f.title, { weight: 600, size: 15, x: x + pad + 16, y: y + 27, fill: c.title }),
      ...(wrapped[i] ?? []).map((line, j) => glyphs.text(line, { weight: 400, size: 13, x: x + pad, y: y + 50 + j * lineH, fill: c.body }))
    )
  }

  return svg(width, height, glyphs.defsElement + parts.join(''), FEATURES.map(f => `${f.title}: ${f.body}`).join(' '))
}

function platforms(t: Theme): string {
  const c = C[t]
  const h = 28
  const pad = 12
  const icon = 12
  const label = 'RUNS ON'
  const labelW = widthOf(label, 700, 10, 0.12) + 2 * pad
  const segments = PLATFORMS.map(p => ({ ...p, w: pad + icon + 6 + widthOf(p.name, 500, 13) + pad }))
  const width = labelW + segments.reduce((sum, p) => sum + p.w, 0)
  const baseline = (size: number, weight: number): number => h / 2 + capOf(weight, size) / 2
  const r = (h - 1) / 2
  const glyphs = new Glyphs()
  const parts: string[] = [
    `<clipPath id="p"><rect x=".5" y=".5" width="${n(width - 1)}" height="${n(h - 1)}" rx="${n(r)}"/></clipPath>`,
    `<g clip-path="url(#p)"><rect width="${n(width)}" height="${h}" fill="${c.chipSurface}"/><rect width="${n(labelW)}" height="${h}" fill="${c.chipLabel}"/></g>`,
    glyphs.text(label, { weight: 700, size: 10, x: pad, y: baseline(10, 700), tracking: 0.12, fill: c.chipIcon })
  ]
  let x = labelW

  for (const p of segments) {
    const src = readFileSync(join(root, 'docs', 'assets', 'icons', `${p.icon}.svg`), 'utf8')
    const d = /<path[^>]* d="([^"]+)"/.exec(src)?.[1]
    const box = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(src)

    if (d === undefined || box === null) throw new Error(`docs/assets/icons/${p.icon}.svg: no path or viewBox`)
    const [, bx = '0', by = '0', bw = '512'] = box

    parts.push(
      `<line x1="${n(x)}" y1="0" x2="${n(x)}" y2="${h}" stroke="${c.chipBorder}"/>`,
      `<path fill="${c.chipIcon}" transform="translate(${n(x + pad)} ${n((h - icon) / 2)}) scale(${n(icon / Number(bw))}) translate(${-Number(bx)} ${-Number(by)})" d="${d}"/>`,
      glyphs.text(p.name, { weight: 500, size: 13, x: x + pad + icon + 6, y: baseline(13, 500), fill: c.chipText })
    )
    x += p.w
  }
  parts.push(`<rect x=".5" y=".5" width="${n(width - 1)}" height="${n(h - 1)}" rx="${n(r)}" fill="none" stroke="${c.chipBorder}"/>`)

  return svg(width, h, glyphs.defsElement + parts.join(''), 'Runs on Windows, macOS and Linux')
}

if (contrast(C.light.gold, '#ffffff') < 3) throw new Error(`the light divider's gold ${C.light.gold} is under 3:1 on white`)
mkdirSync(out, { recursive: true })
for (const t of THEMES) {
  writeFileSync(join(out, `divider-${t}.svg`), divider(t))
  writeFileSync(join(out, `features-${t}.svg`), features(t, false))
  writeFileSync(join(out, `features-narrow-${t}.svg`), features(t, true))
  writeFileSync(join(out, `platforms-${t}.svg`), platforms(t))
}
for (const f of files()) console.log(`wrote ${f.slice(root.length + 1)}: ${statSync(f).size} bytes`)
const problems = artProblems()

if (problems.length > 0) throw new Error(`readme-art: ${problems.join('; ')}`)
