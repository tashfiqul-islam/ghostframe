// The README's designed images, drawn from the brand's tokens and the brand's SVGs, as SVG under docs/assets/readme/,
// each in a dark and a light version: the banner, the platform chip, the divider, the feature strip (wide, and stacked
// for narrow screens), a band above each numbered section (wide, and narrow without its caption) and the footer card.
//
// Text is turned into outlines here (Hanken Grotesk for the brand's type, JetBrains Mono for the interface's), each
// glyph drawn once and placed with <use>, so an image needs no font. Motion is CSS inside the SVG: every animation
// loops with a still pause, and `prefers-reduced-motion: reduce` stops it on its finished frame (the mascot's eyes on
// amber). No image holds a script or loads anything.
//
//   bun tools/scripts/readme-art.ts           draws them (needs Hanken Grotesk and JetBrains Mono Nerd Font Mono installed)
//   bun tools/scripts/readme-art.ts --check   every image is there, within its size limit, with no live text (the gate)
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Font } from 'fontkit'

const root = join(import.meta.dirname, '..', '..')
const out = join(root, 'docs', 'assets', 'readme')
const brand = join(root, 'docs', 'design', 'brand')

type Theme = 'dark' | 'light'
const THEMES: readonly Theme[] = ['dark', 'light']

/** Each numbered section's band: its anchor's slug, its name, and a caption of three words or fewer. */
const SECTIONS = [
  { slug: 'features', name: 'Features', caption: 'TIMELINE · FILES · STATUS LINE' },
  { slug: 'install', name: 'Install', caption: 'TWO COMMANDS' },
  { slug: 'keys', name: 'Keys', caption: 'PANE KEYBOARD ONLY' },
  { slug: 'how-it-works', name: 'How it works', caption: 'EVENTS · LEDGER · RENDER' },
  { slug: 'where-it-runs', name: 'Where it runs', caption: 'TERMINAL CLI ONLY' },
  { slug: 'faq', name: 'FAQ', caption: 'SEVEN QUESTIONS' },
  { slug: 'docs', name: 'Docs', caption: 'USE · UNDERSTAND · WORK' },
  { slug: 'contributing', name: 'Contributing', caption: 'SETUP · CHECKS · SHIPPING' }
] as const

const KB = 1024

/** Every image, without its -dark/-light suffix, and its size limit in bytes. */
const IMAGES: readonly { stem: string; limit: number }[] = [
  { stem: 'banner', limit: 150 * KB },
  { stem: 'platforms', limit: 15 * KB },
  { stem: 'divider', limit: 5 * KB },
  { stem: 'features', limit: 48 * KB },
  { stem: 'features-narrow', limit: 48 * KB },
  { stem: 'footer', limit: 40 * KB },
  ...SECTIONS.flatMap(s => [
    { stem: `band-${s.slug}`, limit: 16 * KB },
    { stem: `band-${s.slug}-narrow`, limit: 16 * KB }
  ])
]

/** The page colours, per theme. Page backgrounds are GitHub's (#0d1117, #ffffff); cards sit one step off them. */
const C = {
  dark: {
    gold: '#FFC83D',
    onGold: '#0d1117',
    card: '#161b22',
    cardBorder: '#2a313c',
    title: '#e6edf3',
    body: '#9198a1',
    rule: '#3d444d',
    chipBorder: '#2a313c',
    chipSurface: '#11151c',
    chipLabel: '#1a2029',
    chipText: '#e6edf3',
    chipIcon: '#9198a1',
    bannerBg: '#0B0B0E',
    bannerText: '#ECEAF2',
    bannerMuted: '#8C8899',
    bannerGrid: 'rgba(255,255,255,.028)',
    bannerGlow: '#FFC04A',
    bannerGlowOpacity: 0.07
  },
  light: {
    // GitHub's attention colour: a darker gold that holds 3:1 (about 4.9:1) on white.
    gold: '#9A6700',
    onGold: '#ffffff',
    card: '#f6f8fa',
    cardBorder: '#d1d9e0',
    title: '#1f2328',
    body: '#59636e',
    rule: '#d1d9e0',
    chipBorder: '#d1d9e0',
    chipSurface: '#f6f8fa',
    chipLabel: '#eef1f4',
    chipText: '#1f2328',
    chipIcon: '#59636e',
    bannerBg: '#F3F1F7',
    bannerText: '#0B0B0E',
    bannerMuted: '#5F5B69',
    bannerGrid: 'rgba(11,11,14,.035)',
    bannerGlow: '#D9B8C8',
    bannerGlowOpacity: 0.35
  }
} as const

/** The interface's own colours (hooks/shared/look/palette.ts), for the cards' windows: a terminal is dark in both themes. */
const UI = {
  pane: '#0D0E12',
  hairline: '#1E1E26',
  divider: '#2A2A34',
  textBright: '#ECECF1',
  text: '#B2B2BC',
  muted: '#7C7C88',
  dim: '#5E5E6A',
  accent: '#FAB387',
  machine: '#7EC8BE',
  ok: '#96D292',
  err: '#EC84A0',
  warn: '#E8B98A',
  label: '#7A7A86',
  meterOff: '#2A2A34',
  meterQuarter: '#3A3A47',
  tile: { calm: '#17171F', warm: '#1E1A15', hot: '#22161C' },
  edge: { calm: '#2E5A55', warm: '#E8B98A', hot: '#EC84A0' },
  tone: { calm: '#7EC8BE', warm: '#E8B98A', hot: '#EC84A0' },
  // The status line's three eye colours, as the banner's platform line shows them.
  eyes: ['#5BEBA6', '#FAB387', '#D7263D']
} as const

const FEATURES = [
  { kind: 'timeline', title: 'Live timeline', dot: '#5DCAA5', body: 'Every step of the turn as it runs: tools, shells, agents, failures and fixes.' },
  { kind: 'files', title: 'Files, sources, to-dos', dot: '#FFC83D', body: "What changed, what Claude read and what's left, one tab each in the pane." },
  { kind: 'budget', title: 'Budget status line', dot: '#D97757', body: 'Model, repo, context and your 5-hour and weekly limits in two rows.' }
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

/** Every image's file name and size limit. */
const files = (): { name: string; limit: number }[] => IMAGES.flatMap(i => THEMES.map(t => ({ name: `${i.stem}-${t}.svg`, limit: i.limit })))

/**
 * What is wrong with one drawn image's text.
 * @param name its file name
 * @param text its text
 * @returns its problems
 */
export function svgProblems(name: string, text: string): string[] {
  const problems: string[] = []

  if (/<text\b|font-family|@font-face/.test(text)) problems.push(`${name} has live text or a font; text must be outlines`)
  if (/<script\b|\bon[a-z]+=/i.test(text)) problems.push(`${name} has a script`)
  if (/(?:href|src)="(?!#)|url\((?!#)|@import/.test(text)) problems.push(`${name} loads something from outside itself`)
  if (/@keyframes/.test(text) && !/@media \(prefers-reduced-motion: reduce\)/.test(text)) problems.push(`${name} animates without a reduced-motion rule`)
  const ids = [...text.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])
  const twice = ids.find((id, i) => ids.indexOf(id) !== i)

  // A repeated id sends a <use> or url() to the wrong element: a glyph that draws a clip path, say.
  if (twice !== undefined) problems.push(`${name} has the id "${twice}" twice`)

  return problems
}

/**
 * What is wrong with the drawn images: a file missing, over its size limit, holding live text, a script or an outside
 * reference, or animating without a reduced-motion rule.
 * @returns one problem per entry; empty when all is well
 */
export function artProblems(): string[] {
  const problems: string[] = []

  for (const { name, limit } of files()) {
    const file = join(out, name)

    if (!existsSync(file)) {
      problems.push(`${name} is missing`)
      continue
    }
    const size = statSync(file).size

    if (size > limit) problems.push(`${name} is ${size} bytes, over its ${limit}`)
    problems.push(...svgProblems(name, readFileSync(file, 'utf8')))
  }

  return problems
}

const fail = (what: string): never => {
  throw new Error(`readme-art self-test: ${what}`)
}

function selfTest(): void {
  const ok = '<svg><style>@keyframes a{}@media (prefers-reduced-motion: reduce){*{animation:none}}</style><use href="#g1"/></svg>'

  if (svgProblems('ok.svg', ok).length > 0) fail('a clean image was refused')
  if (svgProblems('t.svg', '<svg><text>hi</text></svg>').length === 0) fail('live text passed')
  if (svgProblems('s.svg', '<svg><script>x()</script></svg>').length === 0) fail('a script passed')
  if (svgProblems('e.svg', '<svg><image href="https://x.test/a.png"/></svg>').length === 0) fail('an outside image passed')
  if (svgProblems('m.svg', '<svg><style>@keyframes a{}</style></svg>').length === 0) fail('motion without a reduced-motion rule passed')
  if (svgProblems('d.svg', '<svg><clipPath id="p"/><path id="p"/></svg>').length === 0) fail('a repeated id passed')
  console.log('readme-art self-test: ok')
}

if (process.argv[2] === '--self-test') {
  selfTest()
  process.exit(0)
}

if (process.argv[2] === '--check') {
  const problems = artProblems()

  if (contrast(C.light.gold, '#ffffff') < 3) problems.push(`the light gold ${C.light.gold} is under 3:1 on white`)
  if (problems.length > 0) {
    console.error(`readme-art: ${problems.join('; ')}`)
    process.exit(1)
  }
  console.log(`readme-art: ${files().length} images, each within its limit, all text outlined, no scripts or outside files.`)
  process.exit(0)
}

// ─── Fonts and outlines ───

const fontkit = await import('fontkit')
const fontDirs = [join(process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts'), 'C:/Windows/Fonts']

/**
 * An installed font, by file name.
 * @param file the font's file name
 * @returns the font
 */
function fontNamed(file: string): Font {
  const path = fontDirs.map(d => join(d, file)).find(p => existsSync(p))

  if (path === undefined) throw new Error(`${file} is not installed`)
  const font = fontkit.openSync(path)

  if (!('getVariation' in font)) throw new Error(`${file}: a font collection, not one font`)

  return font
}

const hanken = fontNamed('HankenGrotesk-VariableFont_wght.ttf')
const mono: Readonly<Record<number, Font>> = {
  400: fontNamed('JetBrainsMonoNerdFontMono-Regular.ttf'),
  500: fontNamed('JetBrainsMonoNerdFontMono-Medium.ttf'),
  700: fontNamed('JetBrainsMonoNerdFontMono-Bold.ttf')
}
const weights = new Map<number, Font>()

/** Type for text: the brand's sans or the interface's mono, at a weight. */
type Face = { family?: 'sans' | 'mono'; weight: number }

const fontOf = (f: Face): Font => {
  if (f.family === 'mono') {
    const got = mono[f.weight]

    if (got === undefined) throw new Error(`no mono font at weight ${f.weight}`)

    return got
  }
  const got = weights.get(f.weight) ?? hanken.getVariation({ wght: f.weight })

  weights.set(f.weight, got)

  return got
}

const OPS: Readonly<Record<string, string>> = { moveTo: 'm', lineTo: 'l', quadraticCurveTo: 'q', bezierCurveTo: 'c', closePath: 'z' }

/** A number to two decimals, as short as it writes: the precision glyph outlines keep. */
const d2 = (v: number): string => {
  const s = String(Math.round(v * 100) / 100)

  return s.replace(/^(-?)0\./, '$1.')
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
  let buf = ''
  let last = ''
  let lastNumber = ''

  // Written as short as SVG's grammar allows: a repeated command letter is left buf, and no separator goes before a
  // minus sign, or before a leading dot when the number before it already has one.
  const put = (num: string): void => {
    const joins = lastNumber === '' || num.startsWith('-') || (num.startsWith('.') && lastNumber.includes('.'))

    buf += joins ? num : ` ${num}`
    lastNumber = num
  }

  for (const c of commands) {
    if (c.command === 'closePath') {
      buf += 'z'
      last = 'z'
      lastNumber = ''
      cx = sx
      cy = sy
      continue
    }
    const op = OPS[c.command] ?? ''

    // After a moveTo, more pairs would be read as lineTos, so `l` may follow `m` implicitly too.
    if (op !== last && !(op === 'l' && last === 'm')) {
      buf += op
      lastNumber = ''
    }
    last = op === 'm' ? 'm' : op
    for (let j = 0; j < c.args.length; j += 2) {
      // Two decimals at REF px: glyph outlines keep their detail.
      const x = Math.round((c.args[j] ?? 0) * k * 100) / 100
      const y = Math.round(-(c.args[j + 1] ?? 0) * k * 100) / 100

      put(d2(x - cx))
      put(d2(y - cy))
      if (j + 2 >= c.args.length) {
        cx = x
        cy = y
      }
    }
    if (c.command === 'moveTo') {
      sx = cx
      sy = cy
      last = 'm'
    } else if (op === 'l') {
      last = 'l'
    }
  }

  return buf
}

/**
 * The advance width of a line of text.
 * @param s the text
 * @param face its type
 * @param size its size in px
 * @param tracking extra space between letters, in em
 * @returns its width in px, without the tracking after the last letter
 */
function widthOf(s: string, face: Face, size: number, tracking = 0): number {
  const font = fontOf(face)
  const k = size / font.unitsPerEm
  const run = font.layout(s)
  const advance = run.positions.reduce((sum, p) => sum + p.xAdvance * k, 0)

  return advance + Math.max(0, run.glyphs.length - 1) * tracking * size
}

const capOf = (face: Face, size: number): number => (fontOf(face).capHeight / fontOf(face).unitsPerEm) * size

/** How to set a line of text. */
type Set = Face & { size: number; x: number; y: number; fill: string; tracking?: number; anchor?: 'start' | 'middle' | 'end'; cls?: string }

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * The shortest id for the nth glyph: one letter for the first 52, then two. Every glyph's <use> carries it, so a
 * shorter id is a smaller image.
 * @param i the glyph's index
 * @returns its id
 */
const shortId = (i: number): string =>
  i < LETTERS.length ? (LETTERS[i] ?? '') : `${LETTERS[Math.floor(i / LETTERS.length) - 1] ?? ''}${LETTERS[i % LETTERS.length] ?? ''}`

/** The size every glyph is drawn at in <defs>; a line of another size scales its group. */
const REF = 10

/**
 * One image's glyphs: each distinct glyph of each font is drawn once in <defs>, at REF px, and placed with <use>.
 */
class Glyphs {
  private readonly ids = new Map<string, string>()
  private readonly defs: string[] = []

  /**
   * Text as glyphs placed on a baseline.
   * @param s the text
   * @param o the type, size, position, fill, tracking, which end the position is, and a class for motion
   * @returns the <use> elements, in a group with the fill
   */
  text(s: string, o: Set): string {
    const font = fontOf(o)
    const k = o.size / font.unitsPerEm
    const scale = o.size / REF
    const run = font.layout(s)
    const width = widthOf(s, o, o.size, o.tracking)
    const uses: string[] = []
    let pen = o.anchor === 'end' ? o.x - width : o.anchor === 'middle' ? o.x - width / 2 : o.x

    for (const [i, glyph] of run.glyphs.entries()) {
      const pos = run.positions[i]
      const key = `${o.family ?? 'sans'}/${o.weight}/${glyph.id}`
      let id = this.ids.get(key)

      if (id === undefined && glyph.path.commands.length > 0) {
        id = shortId(this.ids.size)
        this.ids.set(key, id)
        this.defs.push(`<path id="${id}" d="${pathOf(glyph.path.commands, REF / font.unitsPerEm)}"/>`)
      }
      if (id !== undefined) uses.push(`<use href="#${id}" x="${d2((pen + (pos?.xOffset ?? 0) * k) / scale)}"/>`)
      pen += (pos?.xAdvance ?? glyph.advanceWidth) * k + (o.tracking ?? 0) * o.size
    }

    // The line's baseline and size are set once on its group, so each glyph carries only its x.
    // Every baseline sits on a whole pixel, so the text's horizontal strokes land on the pixel grid.
    const y = Math.round(o.y)
    const transform = scale === 1 ? `translate(0 ${y})` : `translate(0 ${y}) scale(${Math.round(scale * 10_000) / 10_000})`

    return `<g fill="${o.fill}" transform="${transform}"${o.cls === undefined ? '' : ` class="${o.cls}"`}>${uses.join('')}</g>`
  }

  /** The glyph definitions, to go inside the image's <defs>. */
  get defsContent(): string {
    return this.defs.join('')
  }
}

/**
 * Words wrapped to a width.
 * @param s the text
 * @param face its type
 * @param size its size in px
 * @param max the widest a line may be
 * @returns the lines
 */
function wrap(s: string, face: Face, size: number, max: number): string[] {
  const lines: string[] = []
  let line = ''

  for (const word of s.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`

    if (line !== '' && widthOf(next, face, size) > max) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line !== '') lines.push(line)

  return lines
}

/**
 * An SVG document.
 * @param w its width
 * @param h its height
 * @param o its body, its <defs> content, its style sheet, and its label ('' for a decorative image)
 * @returns the document
 */
function svg(w: number, h: number, o: { body: string; defs?: string; style?: string; label: string }): string {
  const role = o.label === '' ? 'aria-hidden="true"' : `role="img" aria-label="${o.label}"`
  const defs = o.defs === undefined || o.defs === '' ? '' : `<defs>${o.defs}</defs>`
  const style = o.style === undefined ? '' : `<style>${o.style}@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}" ${role}>${style}${defs}${o.body}</svg>\n`
}

/**
 * Keyframes that show an element from one point of the loop to another and hide it the rest of the time, with a short
 * fade at each end. The element's own style is its finished frame, so with reduced motion it simply stays shown.
 * @param name the keyframes' name
 * @param from where in the loop it appears, 0 to 1
 * @param to where it goes again, 0 to 1
 * @returns the keyframes
 */
const pct = (v: number): string => `${n(v * 100)}%`

function shown(name: string, from: number, to = 0.88): string {
  const p = pct

  return `@keyframes ${name}{0%,${p(from)}{opacity:0}${p(Math.min(from + 0.04, to))},${p(to)}{opacity:1}${p(Math.min(to + 0.06, 1))},100%{opacity:0}}`
}

/** The README's content width at desktop, in CSS pixels. */
const WIDE = 860

// ─── The divider ───

/**
 * A gold hairline fading in from both ends, with a rotated-square diamond at its middle.
 * @param c the theme's colours
 * @param x the line's left end
 * @param w its length
 * @param y its height on the page
 * @param id the gradient's id
 * @returns its elements and its gradient
 */
function hairline(c: (typeof C)[Theme], x: number, w: number, y: number, id: string): { body: string; defs: string } {
  const s = 3.5
  // The line fills exactly one pixel row with whole-pixel ends, so it draws as one crisp row.
  const row = Math.floor(y)
  const left = Math.round(x)
  const width = Math.round(w)
  const mid = left + width / 2
  const centre = row + 0.5
  const stops = [0, 0.5, 1].map(off => `<stop offset="${off}" stop-color="${c.gold}" stop-opacity="${off === 0.5 ? 1 : 0}"/>`).join('')

  return {
    defs: `<linearGradient id="${id}" x1="${left}" x2="${left + width}" y1="0" y2="0" gradientUnits="userSpaceOnUse">${stops}</linearGradient>`,
    body:
      `<rect x="${left}" y="${row}" width="${width}" height="1" fill="url(#${id})"/>` +
      `<rect x="${n(mid - s)}" y="${n(centre - s)}" width="${n(2 * s)}" height="${n(2 * s)}" transform="rotate(45 ${n(mid)} ${n(centre)})" fill="${c.gold}"/>`
  }
}

function divider(t: Theme): string {
  const line = hairline(C[t], WIDE * 0.2, WIDE * 0.6, 9, 'h1')

  return svg(WIDE, 18, { defs: line.defs, body: line.body, label: '' })
}

// ─── The feature strip ───

const MONO = { family: 'mono', weight: 400 } as const
const MONO_SIZE = 10.5
const ROW = 15

/**
 * A card's window: the interface's pane in miniature, three dots in its bar.
 * @param x its left edge
 * @param y its top
 * @param w its width
 * @param h its height
 * @returns its frame
 */
function windowFrame(x: number, y: number, w: number, h: number): string {
  const dots = [0, 1, 2].map(i => `<circle cx="${n(x + 9 + i * 7)}" cy="${n(y + 8)}" r="2" fill="${UI.divider}"/>`).join('')

  return (
    `<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${n(w - 1)}" height="${n(h - 1)}" rx="6" fill="${UI.pane}" stroke="${UI.hairline}"/>` +
    `<line x1="${n(x)}" y1="${n(y + 16.5)}" x2="${n(x + w)}" y2="${n(y + 16.5)}" stroke="${UI.hairline}"/>` +
    dots
  )
}

/**
 * The live timeline's window: four steps appearing one after another, the failure and its fix among them.
 * @returns its elements and its keyframes
 */
function timelineWindow(g: Glyphs, x: number, y: number, w: number): { body: string; css: string } {
  const rows = [
    { glyph: '✓', tone: UI.ok, label: 'read src/width.ts', right: [] },
    { glyph: '×', tone: UI.err, label: 'test bun test', right: [{ t: '2 of 3', c: UI.err }] },
    {
      glyph: '✓',
      tone: UI.ok,
      label: 'edit width.ts',
      right: [
        { t: '+2', c: UI.ok },
        { t: '−2', c: UI.err }
      ]
    },
    { glyph: '✓', tone: UI.ok, label: 'test bun test', right: [{ t: '3 pass', c: UI.ok }] }
  ]
  const parts: string[] = []
  const css: string[] = []

  for (const [i, r] of rows.entries()) {
    const by = y + 32 + i * ROW
    let rx = x + w - 10
    const right: string[] = []

    for (const piece of r.right.toReversed()) {
      right.push(g.text(piece.t, { ...MONO, size: MONO_SIZE, x: rx, y: by, fill: piece.c, anchor: 'end' }))
      rx -= widthOf(`${piece.t} `, MONO, MONO_SIZE)
    }
    css.push(shown(`t${i}`, 0.08 + i * 0.14), `.t${i}{animation:t${i} 7s infinite}`)
    parts.push(
      `<g class="t${i}">`,
      g.text(r.glyph, { ...MONO, size: MONO_SIZE, x: x + 10, y: by, fill: r.tone }),
      g.text(r.label, { ...MONO, size: MONO_SIZE, x: x + 24, y: by, fill: UI.text }),
      ...right,
      '</g>'
    )
  }

  return { body: parts.join(''), css: css.join('') }
}

/**
 * The files, sources and to-dos window: the pane's tab line, two changed files and a to-do that ticks.
 * @returns its elements and its keyframes
 */
function filesWindow(g: Glyphs, x: number, y: number, w: number): { body: string; css: string } {
  const tabs = [
    { t: 'FILES 2', active: true },
    { t: 'SOURCES 1', active: false },
    { t: 'TODO 3', active: false }
  ]
  const parts: string[] = []
  let tx = x + 10
  const ty = y + 30

  for (const tab of tabs) {
    const tw = widthOf(tab.t, MONO, 9, 0.08)

    parts.push(g.text(tab.t, { ...MONO, size: 9, x: tx, y: ty, fill: tab.active ? UI.textBright : UI.muted, tracking: 0.08 }))
    if (tab.active) parts.push(`<rect x="${n(tx)}" y="${n(ty + 3)}" width="${n(tw)}" height="1.5" fill="${UI.accent}"/>`)
    tx += tw + 12
  }
  const fileRow = (path: string, plus: string, minus: string, by: number): string => {
    const minusX = x + w - 10

    return (
      g.text('■', { ...MONO, size: MONO_SIZE, x: x + 10, y: by, fill: UI.machine }) +
      g.text(path, { ...MONO, size: MONO_SIZE, x: x + 24, y: by, fill: UI.text }) +
      g.text(minus, { ...MONO, size: MONO_SIZE, x: minusX, y: by, fill: UI.err, anchor: 'end' }) +
      g.text(plus, { ...MONO, size: MONO_SIZE, x: minusX - widthOf(`${minus} `, MONO, MONO_SIZE), y: by, fill: UI.ok, anchor: 'end' })
    )
  }
  const todoY = y + 30 + 3 * ROW

  parts.push(
    `<g class="f0">${fileRow('src/width.ts', '+2', '−2', y + 30 + ROW)}</g>`,
    `<g class="f1">${fileRow('src/width.test.ts', '+3', '−1', y + 30 + 2 * ROW)}</g>`,
    '<g class="f2">',
    g.text('○', { ...MONO, size: MONO_SIZE, x: x + 10, y: todoY, fill: UI.dim, cls: 'open' }),
    g.text('✓', { ...MONO, size: MONO_SIZE, x: x + 10, y: todoY, fill: UI.ok, cls: 'done' }),
    g.text('run the tests again', { ...MONO, size: MONO_SIZE, x: x + 24, y: todoY, fill: UI.text }),
    '</g>'
  )
  // The finished frame shows the to-do done; in the loop it starts open and ticks a little after it appears.
  const css = [
    shown('f0', 0.08),
    shown('f1', 0.2),
    shown('f2', 0.32),
    '@keyframes open{0%,55%{opacity:1}60%,100%{opacity:0}}@keyframes done{0%,55%{opacity:0}60%,100%{opacity:1}}',
    '.f0{animation:f0 7s infinite}.f1{animation:f1 7s infinite}.f2{animation:f2 7s infinite}',
    '.open{opacity:0;animation:open 7s infinite}.done{animation:done 7s infinite}'
  ]

  return { body: parts.join(''), css: css.join('') }
}

/**
 * The budget status line's window: three meters filling, one cell at a time, in their threshold colours.
 * @returns its elements and its keyframes
 */
function budgetWindow(g: Glyphs, x: number, y: number, w: number): { body: string; css: string } {
  const meters = [
    { label: 'CONTEXT', p: 23, tone: 'calm' },
    { label: '5-HOUR', p: 68, tone: 'warm' },
    { label: 'WEEK', p: 88, tone: 'hot' }
  ] as const
  const cells = 20
  const labelW = 52
  const pctW = 30
  const meterW = w - 20 - labelW - pctW
  const step = meterW / cells
  const parts: string[] = []

  for (const [i, m] of meters.entries()) {
    const top = y + 21 + i * 18
    const lit = Math.round((m.p / 100) * cells)

    parts.push(
      `<rect x="${n(x + 6)}" y="${n(top)}" width="${n(w - 12)}" height="15" rx="2" fill="${UI.tile[m.tone]}"/>`,
      `<rect x="${n(x + 6)}" y="${n(top)}" width="2" height="15" fill="${UI.edge[m.tone]}"/>`,
      g.text(m.label, { ...MONO, size: 9, x: x + 12, y: top + 10.5, fill: UI.label, tracking: 0.08 }),
      g.text(`${m.p}%`, { ...MONO, size: MONO_SIZE, x: x + w - 10, y: top + 11, fill: UI.textBright, anchor: 'end', cls: 'pct' })
    )
    // The unlit cells, the quieter blocks at 25, 50 and 75 among them, as two paths; the lit ones one by one, to light in turn.
    // Whole-pixel cells, so their edges draw crisp.
    const cellW = Math.max(2, Math.round(step * 0.62))
    const cellAt = (c: number): string => `M${Math.round(x + 10 + labelW + c * step)} ${top + 4}h${cellW}v7h${-cellW}z`
    const isQuarter = (c: number): boolean => c === cells / 4 || c === cells / 2 || c === (3 * cells) / 4
    const all = Array.from({ length: cells }, (_, c) => c)

    parts.push(
      `<path fill="${UI.meterOff}" d="${all
        .filter(c => !isQuarter(c))
        .map(cellAt)
        .join('')}"/>`,
      `<path fill="${UI.meterQuarter}" d="${all.filter(isQuarter).map(cellAt).join('')}"/>`,
      ...all.slice(0, lit).map(c => `<path class="lit c${c}" fill="${UI.tone[m.tone]}" d="${cellAt(c)}"/>`)
    )
  }
  // Each cell lights a little after the one before it, so the meters fill from the left; the numbers come in last.
  const css = [
    '@keyframes lit{0%{opacity:0}6%,82%{opacity:1}90%,100%{opacity:0}}',
    // One rule animates every lit cell; each cell's own rule only sets its delay.
    '.lit{animation:lit 7s infinite backwards}',
    ...Array.from({ length: cells }, (_, c) => `.c${c}{animation-delay:${n(0.3 + c * 0.09).replace(/^0\./, '.')}s}`),
    shown('pct', 0.42),
    '.pct{animation:pct 7s infinite}'
  ]

  return { body: parts.join(''), css: css.join('') }
}

const WINDOWS = { timeline: timelineWindow, files: filesWindow, budget: budgetWindow } as const

function features(t: Theme, isNarrow: boolean): string {
  const c = C[t]
  const width = isNarrow ? BAND_NARROW : WIDE
  const gap = isNarrow ? 12 : 16
  const cardW = isNarrow ? width : (width - 2 * gap) / 3
  const pad = 14
  const winH = 84
  const lineH = 19
  const body = { weight: 400, size: 13 } as const
  const wrapped = FEATURES.map(f => wrap(f.body, body, body.size, cardW - 2 * pad))
  const cardH = pad + winH + 30 + Math.max(...wrapped.map(l => l.length)) * lineH + 8
  const height = isNarrow ? 3 * cardH + 2 * gap : cardH
  const g = new Glyphs()
  const parts: string[] = []
  const css: string[] = []

  for (const [i, f] of FEATURES.entries()) {
    const x = isNarrow ? 0 : i * (cardW + gap)
    const y = isNarrow ? i * (cardH + gap) : 0
    const win = WINDOWS[f.kind](g, x + pad, y + pad, cardW - 2 * pad)
    const titleY = y + pad + winH + 24

    css.push(win.css)
    parts.push(
      `<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${n(cardW - 1)}" height="${n(cardH - 1)}" rx="10" fill="${c.card}" stroke="${c.cardBorder}"/>`,
      windowFrame(x + pad, y + pad, cardW - 2 * pad, winH),
      win.body,
      `<rect x="${n(x + pad)}" y="${n(titleY - 9)}" width="8" height="8" rx="2" fill="${f.dot}"/>`,
      g.text(f.title, { weight: 600, size: 15, x: x + pad + 16, y: titleY, fill: c.title }),
      ...(wrapped[i] ?? []).map((line, j) => g.text(line, { ...body, x: x + pad, y: titleY + 22 + j * lineH, fill: c.body }))
    )
  }

  return svg(width, height, {
    defs: g.defsContent,
    style: [...new Set(css)].join(''),
    body: parts.join(''),
    label: FEATURES.map(f => `${f.title}: ${f.body}`).join(' ')
  })
}

// ─── The platform chip ───

function platforms(t: Theme): string {
  const c = C[t]
  const h = 28
  const pad = 12
  const icon = 12
  const label = 'RUNS ON'
  const labelFace = { weight: 700 } as const
  const nameFace = { weight: 500 } as const
  // Whole-pixel segment widths, so every divider falls on the pixel grid.
  const labelW = Math.ceil(widthOf(label, labelFace, 10, 0.12) + 2 * pad)
  const segments = PLATFORMS.map(p => ({ ...p, w: Math.ceil(pad + icon + 6 + widthOf(p.name, nameFace, 13) + pad) }))
  const width = labelW + segments.reduce((sum, p) => sum + p.w, 0)
  const baseline = (face: Face, size: number): number => h / 2 + capOf(face, size) / 2
  const r = (h - 1) / 2
  const g = new Glyphs()
  const parts: string[] = [
    `<g clip-path="url(#c1)"><rect width="${n(width)}" height="${h}" fill="${c.chipSurface}"/><rect width="${n(labelW)}" height="${h}" fill="${c.chipLabel}"/></g>`,
    g.text(label, { ...labelFace, size: 10, x: pad, y: baseline(labelFace, 10), tracking: 0.12, fill: c.chipIcon })
  ]
  let x = labelW

  for (const p of segments) {
    const src = readFileSync(join(root, 'docs', 'assets', 'icons', `${p.icon}.svg`), 'utf8')
    const d = /<path[^>]* d="([^"]+)"/.exec(src)?.[1]
    const box = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(src)

    if (d === undefined || box === null) throw new Error(`docs/assets/icons/${p.icon}.svg: no path or viewBox`)
    const [, bx = '0', by = '0', bw = '512'] = box

    parts.push(
      `<line x1="${x + 0.5}" y1="0" x2="${x + 0.5}" y2="${h}" stroke="${c.chipBorder}"/>`,
      `<path fill="${c.chipIcon}" transform="translate(${x + pad} ${(h - icon) / 2}) scale(${n(icon / Number(bw))}) translate(${-Number(bx)} ${-Number(by)})" d="${d}"/>`,
      g.text(p.name, { ...nameFace, size: 13, x: x + pad + icon + 6, y: baseline(nameFace, 13), fill: c.chipText })
    )
    x += p.w
  }
  parts.push(`<rect x=".5" y=".5" width="${n(width - 1)}" height="${n(h - 1)}" rx="${n(r)}" fill="none" stroke="${c.chipBorder}"/>`)

  return svg(width, h, {
    defs: `<clipPath id="c1"><rect x=".5" y=".5" width="${n(width - 1)}" height="${n(h - 1)}" rx="${n(r)}"/></clipPath>${g.defsContent}`,
    body: parts.join(''),
    label: 'Runs on Windows, macOS and Linux'
  })
}

// ─── The brand's mascot and mark, with eyes that cycle ───

/** The three eye states, as the brand's SVGs are named and id-prefixed. */
const EYES = [
  { file: 'green', prefix: 'gfg', cls: 'eg' },
  { file: 'amber', prefix: 'gfa', cls: 'ea' },
  { file: 'red', prefix: 'gfr', cls: 'er' }
] as const

/**
 * The eyes' 9 s cycle: green, amber, red, each held about two seconds and crossfaded over one. Amber is the still
 * frame: with reduced motion, or before the style applies, only the amber layer shows.
 */
const EYE_CSS =
  '.eg,.er{opacity:0}' +
  '@keyframes eg{0%,22.2%{opacity:1}33.3%,88.9%{opacity:0}100%{opacity:1}}' +
  '@keyframes ea{0%,22.2%{opacity:0}33.3%,55.6%{opacity:1}66.7%,100%{opacity:0}}' +
  '@keyframes er{0%,55.6%{opacity:0}66.7%,88.9%{opacity:1}100%{opacity:0}}' +
  '.eg{animation:eg 9s infinite}.ea{animation:ea 9s infinite}.er{animation:er 9s infinite}'

/**
 * A brand SVG (the mascot or the small mark) with its eyes in three layers that crossfade. The shapes are the brand's
 * own, unchanged: the amber file is the body, and each eye state's gradients come from its own file. The C2PA
 * metadata the brand files carry is left out.
 * @param kind which brand image: `mascot` or `mark-small`
 * @param id a prefix for its ids, unique in the image that embeds it
 * @returns its viewBox and its content
 */
function cyclingEyes(kind: 'mascot' | 'mark-small', id: string): { viewBox: string; content: string } {
  const read = (file: string): string =>
    readFileSync(join(brand, `ghostframe-${kind}-${file}.svg`), 'utf8')
      .replace(/<metadata[\s\S]*?<\/metadata>/, '')
      .replace(/ xmlns:c2pa="[^"]*"/, '')
  const amber = read('amber')
  const viewBox = /viewBox="([^"]+)"/.exec(amber)?.[1]
  const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(amber)?.[1]

  if (viewBox === undefined || inner === undefined) throw new Error(`ghostframe-${kind}-amber.svg: no viewBox or content`)
  const body = inner.replaceAll('gfa-', `${id}-`).replaceAll(/\s*\n\s*/g, '')
  const eyePath = new RegExp(`<path d="[^"]+" fill="url\\(#${id}-eyeG\\)"[^>]*/>`).exec(body)?.[0]
  const glow = new RegExp(`<rect[^>]*fill="url\\(#${id}-ambG\\)"[^>]*/>`).exec(body)?.[0]

  if (eyePath === undefined || glow === undefined) throw new Error(`ghostframe-${kind}-amber.svg: no eye path or eye glow`)
  const gradients: string[] = []
  const layer = (el: string): string =>
    EYES.map(e => `<g class="${e.cls}">${el.replace(`#${id}-eyeG`, `#${id}-${e.cls}-eyeG`).replace(`#${id}-ambG`, `#${id}-${e.cls}-ambG`)}</g>`).join('')

  for (const e of EYES) {
    const src = read(e.file).replaceAll(/\s*\n\s*/g, '')

    for (const name of ['eyeG', 'ambG']) {
      const grad = new RegExp(`<(linear|radial)Gradient id="${e.prefix}-${name}"[\\s\\S]*?</\\1Gradient>`).exec(src)?.[0]

      if (grad === undefined) throw new Error(`ghostframe-${kind}-${e.file}.svg: no ${name}`)
      gradients.push(grad.replace(`id="${e.prefix}-${name}"`, `id="${id}-${e.cls}-${name}"`))
    }
  }

  return {
    viewBox,
    content: body
      .replace('<defs>', `<defs>${gradients.join('')}`)
      .replace(eyePath, layer(eyePath))
      .replace(glow, layer(glow))
  }
}

// ─── The banner ───

function banner(t: Theme): string {
  const c = C[t]
  // The hero's layout was drawn at 1600 x 420; it is set here at the README column's width, so GitHub draws it at 1:1.
  const K = BAND_WIDE / 1600
  const k = (v: number): number => v * K
  const w = BAND_WIDE
  const h = Math.round(k(420))
  const g = new Glyphs()
  const mascot = cyclingEyes('mascot', 'm')
  const wordmark = readFileSync(join(brand, `ghostframe-wordmark-${t === 'dark' ? 'white' : 'black'}.svg`), 'utf8').replace(/<metadata[\s\S]*?<\/metadata>/, '')
  const wordBox = /viewBox="([^"]+)"/.exec(wordmark)?.[1]
  const wordPath = /<path[^>]*\/>/.exec(wordmark)?.[0]

  if (wordBox === undefined || wordPath === undefined) throw new Error('the wordmark SVG has no viewBox or path')
  const [, , vw = 4905, vh = 921] = wordBox.split(' ').map(Number)
  const wordW = k(654)
  const tagFace = { weight: 700 } as const
  const tagline = 'The cockpit for Claude Code.'
  const tagSize = 40 * (k(463) / widthOf(tagline, tagFace, 40))
  const plat = 'CLAUDE CODE PLUGIN  ·  WINDOWS  ·  MACOS  ·  LINUX'
  const platSize = k(13.5)
  const platX = Math.round(k(530))
  const platTracking = (k(528) - widthOf(plat, MONO, platSize)) / (platSize * (fontOf(MONO).layout(plat).glyphs.length - 1))
  // Whole-pixel squares, so their edges draw crisp.
  const squares = UI.eyes
    .map((col, i) => `<rect x="${Math.round(k(474)) + i * 10}" y="${Math.round(k(315))}" width="6" height="6" rx="1" fill="${col}"/>`)
    .join('')

  return svg(w, h, {
    style: EYE_CSS,
    defs:
      `<clipPath id="card"><rect width="${w}" height="${h}" rx="15"/></clipPath>` +
      // A 20px grid, its 1px lines on half-pixel centres so each fills one pixel row or column.
      `<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 .5H.5V20" fill="none" stroke="${c.bannerGrid}"/></pattern>` +
      `<radialGradient id="glow" cx="${n(k(241))}" cy="${n(k(205))}" r="${n(k(250))}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.bannerGlow}" stop-opacity="${c.bannerGlowOpacity}"/><stop offset="1" stop-color="${c.bannerGlow}" stop-opacity="0"/></radialGradient>`,
    body:
      `<g clip-path="url(#card)"><rect width="${w}" height="${h}" fill="${c.bannerBg}"/><rect width="${w}" height="${h}" fill="url(#grid)"/><rect width="${w}" height="${h}" fill="url(#glow)"/></g>` +
      `<svg x="${Math.round(k(99))}" y="${Math.round(k(34))}" width="${n(k(284))}" height="${n(k(352))}" viewBox="${mascot.viewBox}">${mascot.content}</svg>` +
      `<svg x="${Math.round(k(472))}" y="${Math.round(k(88))}" width="${n(wordW)}" height="${n((wordW * vh) / vw)}" viewBox="${wordBox}">${wordPath}</svg>` +
      g.text(tagline, { ...tagFace, size: tagSize, x: Math.round(k(474)), y: k(274), fill: c.bannerText }) +
      squares +
      g.text(plat, { ...MONO, size: platSize, x: platX, y: k(325), fill: c.bannerMuted, tracking: platTracking }),
    label: 'ghostframe, the cockpit for Claude Code'
  }).replace('<defs>', `<defs>${g.defsContent}`)
}

// ─── The section bands ───

/**
 * The README column's width on github.com, measured (h3 content width): 1012px in a 1440px-wide desktop window,
 * 324px on a 390px phone. Each band's viewBox is that wide, so GitHub draws it at 1:1, one SVG pixel to one CSS pixel.
 */
const BAND_WIDE = 1012
const BAND_NARROW = 324
/** A band's room: transparent space above its bar and below it, so every section starts with the same gap. */
const BAND_ABOVE = 40
const BAND_BELOW = 18
/** The bar's height; its top and bottom edges sit on whole pixels. */
const BAR_H = 52
/** Every cut leans like "/" at exactly 18°: across BAR_H that is 16.9px, kept exact so the angle holds. */
const SLANT = BAR_H * Math.tan((18 * Math.PI) / 180)
/** The slit of page between segments: 3px on a 34px bar, scaled to this one. */
const SLIT = (3 * BAR_H) / 34
/** A segment's padding: 14px on a 40px bar, scaled to this one. */
const SEG_PAD = 18

/** The band's colours, per theme; the gold segment is the eyes' gold in both. */
const BAND = {
  dark: { path: '#1a2029', git: '#151a21', caption: '#141920', muted: '#6e7681', bright: '#f0f3f6', green: '#5DCAA5', capText: '#6e7681' },
  light: { path: '#e8ebef', git: '#eef0f3', caption: '#eef0f3', muted: '#818b98', bright: '#1f2328', green: '#1a7f37', capText: '#818b98' }
} as const
const NUMBER_FACE = { family: 'mono', weight: 700 } as const
const SIZE = { number: 22, path: 19, icon: 18, git: 16, caption: 12.5 } as const

/**
 * One segment of the bar. A left end on the slant (or straight, for the first segment) and a right end on the slant
 * (or straight, for the last).
 * @param x where its left end meets the bar's bottom
 * @param right where its right end meets the bar's bottom
 * @param o which of its ends are straight, and its fill
 * @returns the segment's path
 */
function segment(x: number, right: number, o: { isLeftStraight: boolean; isRightStraight: boolean; fill: string }): string {
  const top = BAND_ABOVE
  const bottom = BAND_ABOVE + BAR_H
  const topLeft = o.isLeftStraight ? x : x + SLANT
  const topRight = o.isRightStraight ? right : right + SLANT

  return `<path fill="${o.fill}" d="M${n(x)} ${bottom}L${n(topLeft)} ${top}L${n(topRight)} ${top}L${n(right)} ${bottom}Z"/>`
}

/** GitHub's Octicons git-branch (16px, MIT), from docs/assets/icons/git-branch.svg: its path, unchanged. */
const branchPath = (): string => {
  const d = /<path d="([^"]+)"/.exec(readFileSync(join(root, 'docs', 'assets', 'icons', 'git-branch.svg'), 'utf8'))?.[1]

  if (d === undefined) throw new Error('docs/assets/icons/git-branch.svg: no path')

  return d
}

/**
 * A section's header: one full-width bar of four segments, every cut on one 18° slant with a slit of page between
 * them. The gold number, whose left edge is straight. The path `~/ghostframe/<folder>`. The git branch as a prompt
 * shows it (wide only). The caption (wide only), running to a straight right end. The narrow version keeps the number
 * and the path, the path running to the full width and ending straight. The bar is the section's divider too, and the
 * space above and below it is part of the image.
 */
function band(t: Theme, s: (typeof SECTIONS)[number], isNarrow: boolean): string {
  const b = BAND[t]
  const w = isNarrow ? BAND_NARROW : BAND_WIDE
  const h = BAND_ABOVE + BAR_H + BAND_BELOW
  const mid = BAND_ABOVE + BAR_H / 2
  const g = new Glyphs()
  const number = String(SECTIONS.indexOf(s) + 1).padStart(2, '0')
  // Each line's cap height is centred on the bar's middle, its baseline on a whole pixel: one centre line for all.
  const baseline = (face: Face, size: number): number => Math.round(mid + capOf(face, size) / 2)
  const parts: string[] = []
  // The gold segment: straight at the left, its content between that edge and its right cut at mid-height.
  const numberW = widthOf(number, NUMBER_FACE, SIZE.number)
  const goldRight = 2 * SEG_PAD + numberW - SLANT / 2

  parts.push(
    segment(0, goldRight, { isLeftStraight: true, isRightStraight: false, fill: 'url(#gold)' }),
    g.text(number, { ...NUMBER_FACE, size: SIZE.number, x: SEG_PAD, y: baseline(NUMBER_FACE, SIZE.number), fill: '#151000' })
  )
  // Each later segment starts a slit after the last one's cut; its content sits between its two cuts at mid-height,
  // which lean SLANT / 2 right of where they meet the bar's bottom.
  let x = goldRight + SLIT
  const seg = (contentW: number, fill: string, isLast: boolean): number => {
    const start = x
    const right = isLast ? w : x + contentW + 2 * SEG_PAD

    parts.push(segment(start, right, { isLeftStraight: false, isRightStraight: isLast, fill }))
    x = right + SLIT

    return start + SLANT / 2 + SEG_PAD
  }
  const folder = s.slug
  const folderW = widthOf(folder, MONO, SIZE.path)
  // Where the whole path cannot fit (a narrow band), its middle goes: `~/…/install`. It never wraps or overflows.
  const pathStart = x + SLANT / 2 + SEG_PAD
  const fits = (prefix: string): boolean => pathStart + widthOf(prefix, MONO, SIZE.path) + folderW <= w - SEG_PAD
  const repoPath = fits('~/ghostframe/') ? '~/ghostframe/' : '~/…/'

  if (!fits(repoPath)) throw new Error(`the ${s.slug} band's path does not fit its ${w}px, even shortened`)
  const rootW = widthOf(repoPath, MONO, SIZE.path)
  const pathX = seg(rootW + folderW, b.path, isNarrow)
  parts.push(
    g.text(repoPath, { ...MONO, size: SIZE.path, x: pathX, y: baseline(MONO, SIZE.path), fill: b.muted }),
    g.text(folder, { ...MONO, size: SIZE.path, x: pathX + rootW, y: baseline(MONO, SIZE.path), fill: b.bright })
  )
  if (!isNarrow) {
    const gap = 8
    const label = 'main ✓'
    const gitX = seg(SIZE.icon + gap + widthOf(label, MONO, SIZE.git), b.git, false)

    // The icon's 16px box scaled to SIZE.icon, set on whole pixels and centred on the bar's middle.
    parts.push(
      `<path fill="${b.green}" transform="translate(${Math.round(gitX)} ${Math.round(mid - SIZE.icon / 2)}) scale(${n(SIZE.icon / 16)})" d="${branchPath()}"/>`,
      g.text(label, { ...MONO, size: SIZE.git, x: Math.round(gitX) + SIZE.icon + gap, y: baseline(MONO, SIZE.git), fill: b.green })
    )
    seg(0, b.caption, true)
    parts.push(
      g.text(s.caption, { ...MONO, size: SIZE.caption, x: w - SEG_PAD, y: baseline(MONO, SIZE.caption), fill: b.capText, tracking: 0.14, anchor: 'end' })
    )
  }
  return svg(w, h, {
    defs:
      '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF3C9"/><stop offset=".5" stop-color="#FFC83D"/><stop offset="1" stop-color="#FFA21A"/></linearGradient>' +
      g.defsContent,
    body: parts.join(''),
    // The band is the section's heading: the README's <img> carries the section's name as its alt text.
    label: s.name
  })
}

// ─── The footer card ───

function footer(t: Theme): string {
  const c = C[t]
  const w = 520
  const h = 196
  const g = new Glyphs()
  const mark = cyclingEyes('mark-small', 'k')
  const line = hairline(c, w * 0.2, w * 0.6, 138, 'h1')
  const tagFace = { weight: 500 } as const

  return svg(w, h, {
    style: EYE_CSS,
    defs: line.defs,
    body:
      `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="12" fill="${c.card}" stroke="${c.cardBorder}"/>` +
      `<svg x="${w / 2 - 28}" y="24" width="56" height="56" viewBox="${mark.viewBox}">${mark.content}</svg>` +
      g.text('ghostframe haunts your terminal, never your code.', { ...tagFace, size: 16, x: w / 2, y: 114, fill: c.title, anchor: 'middle' }) +
      line.body +
      g.text('BUILT IN DHAKA · MIT', { ...MONO, size: 9.5, x: w / 2, y: 170, fill: c.body, tracking: 0.18, anchor: 'middle' }),
    label: 'ghostframe haunts your terminal, never your code.'
  }).replace('<defs>', `<defs>${g.defsContent}`)
}

// ─── Draw them all ───

if (contrast(C.light.gold, '#ffffff') < 3) throw new Error(`the light gold ${C.light.gold} is under 3:1 on white`)
mkdirSync(out, { recursive: true })
for (const t of THEMES) {
  writeFileSync(join(out, `banner-${t}.svg`), banner(t))
  writeFileSync(join(out, `platforms-${t}.svg`), platforms(t))
  writeFileSync(join(out, `divider-${t}.svg`), divider(t))
  writeFileSync(join(out, `features-${t}.svg`), features(t, false))
  writeFileSync(join(out, `features-narrow-${t}.svg`), features(t, true))
  writeFileSync(join(out, `footer-${t}.svg`), footer(t))
  for (const s of SECTIONS) {
    writeFileSync(join(out, `band-${s.slug}-${t}.svg`), band(t, s, false))
    writeFileSync(join(out, `band-${s.slug}-narrow-${t}.svg`), band(t, s, true))
  }
}
for (const { name } of files()) console.log(`wrote docs/assets/readme/${name}: ${statSync(join(out, name)).size} bytes`)
const problems = artProblems()

if (problems.length > 0) throw new Error(`readme-art: ${problems.join('; ')}`)
