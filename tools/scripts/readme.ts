// Checks of README.md's shape.
//
// - Its ASCII boxes stay square. Inside a fenced code block, every line from the block's top rule (the first line
//   starting `+--`) on that starts with `+--` or `|` must be exactly as wide as that rule, in terminal cells, so every
//   right-hand border sits in one column.
// - release-please's block (`x-release-please-start-version` to `x-release-please-end`) holds the release badge alone,
//   its alt text on one line and its address on the next: release-please rewrites the first version on each line in
//   the block, so both are rewritten and nothing else is.
// - Decorative images (the banner, dividers, feature strip, section bands and footer) sit in a <picture> and inside no
//   link, so GitHub does not turn them into links to the raw file.
// - Each section band is its section's heading, an <h3> after an `<a name>` anchor, and no visible heading repeats it.
//
//   bun tools/scripts/readme.ts --check       README.md passes both (the gate runs this)
//   bun tools/scripts/readme.ts --self-test   the checks catch what they should
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { widthOf } from '../../hooks/shared/look/width'

const root = join(import.meta.dirname, '..', '..')

/**
 * The box lines whose width differs from their block's top rule.
 * @param markdown a Markdown file's text
 * @returns one problem per ragged line, `line <n>: <w> cells, the top rule is <r>`; empty when every box is square
 */
export function raggedRows(markdown: string): string[] {
  const problems: string[] = []
  let isInBlock = false
  let rule: number | undefined

  for (const [i, line] of markdown.split('\n').entries()) {
    if (/^(```|~~~)/.test(line)) {
      isInBlock = !isInBlock
      rule = undefined
      continue
    }
    if (!isInBlock) continue
    if (rule === undefined) {
      if (line.startsWith('+--')) rule = widthOf(line)
      continue
    }
    if (!/^(\+--|\|)/.test(line)) continue
    const width = widthOf(line)

    if (width !== rule) problems.push(`line ${i + 1}: ${width} cells, the top rule is ${rule}`)
  }

  return problems
}

const START = '<!-- x-release-please-start-version -->'
const END = '<!-- x-release-please-end -->'
const SEMVER = /\d+\.\d+\.\d+/g

/**
 * What is wrong with the release-please block. release-please rewrites the first version on each line inside the
 * block, so the block must hold the release badge and nothing else, split so that each of its two versions (the alt
 * text's and the badge address's) is the only version on its line.
 * @param markdown a Markdown file's text
 * @returns the problem, or undefined when the block is the release badge alone, its two versions the same
 */
export function markerProblem(markdown: string): string | undefined {
  const lines = markdown.split('\n')
  const marked = lines.flatMap((line, i) => (line.includes('x-release-please') ? [i] : []))
  const [start, end] = marked

  if (start === undefined || end === undefined) return 'README.md has no x-release-please block'
  if (marked.length !== 2 || lines[start]?.trim() !== START || lines[end]?.trim() !== END) {
    return `the x-release-please markers must be one ${START} line and one ${END} line (lines ${marked.map(i => i + 1).join(', ')})`
  }
  const inside = lines.slice(start + 1, end)
  const [altLine = '', srcLine = ''] = inside
  const alt = /^\s*<a href="[^"]+\/releases"><img alt="Release v(\d+\.\d+\.\d+)"$/.exec(altLine)
  // A hyphen after the version would be read as part of it (a pre-release), so the address is shields' query form.
  const src = /^\s*src="https:\/\/img\.shields\.io\/static\/v1\?label=release&message=v(\d+\.\d+\.\d+)&[^"\s-]*"><\/a>$/.exec(srcLine)

  if (inside.length !== 2 || alt === null || src === null) {
    return `lines ${start + 2} to ${end} hold more than the release badge, its alt text on one line and its address on the next`
  }
  if (inside.some(line => (line.match(SEMVER) ?? []).length !== 1)) return 'a line in the release-please block holds more than one version'
  if (alt[1] !== src[1]) return `the release badge's alt text says v${alt[1]} and its address v${src[1]}`

  return undefined
}

/** The designed images that are decoration: the banner, the dividers, the feature strip, the section bands, the footer. */
const DECORATIVE = /docs\/assets\/readme\/(?:banner|divider|features|band-|footer)/

/**
 * Where a decorative image would become a link. GitHub wraps a bare <img> in a link to the raw file, but not one inside
 * a <picture>, so each decorative image must be in a <picture> and inside no link of its own.
 * @param markdown a Markdown file's text
 * @returns one problem per misplaced image
 */
export function linkProblems(markdown: string): string[] {
  const problems: string[] = []
  const pictures = [...markdown.matchAll(/<picture>[\s\S]*?<\/picture>/g)]
  const inPicture = (at: number): boolean => pictures.some(m => at >= m.index && at < m.index + m[0].length)

  for (const img of markdown.matchAll(/<img\b[^>]*>/g)) {
    if (DECORATIVE.test(img[0]) && !inPicture(img.index))
      problems.push(`a decorative image outside a <picture>, which GitHub would link: ${img[0].slice(0, 80)}`)
  }
  for (const pic of pictures) {
    if (!DECORATIVE.test(pic[0])) continue
    const before = markdown.slice(0, pic.index)
    const open = before.lastIndexOf('<a ')
    const href = open >= 0 && /^<a [^>]*href=/.test(before.slice(open)) && !before.slice(open).includes('</a>')

    if (href) problems.push(`a decorative image inside a link: ${pic[0].slice(0, 80)}`)
  }

  return problems
}

/**
 * What is wrong with the section headings. Each band is its section's heading: an <h3> holding only the band's
 * <picture>, its <img> alt text the section's name, right after an `<a name>` anchor for the section's links. No
 * visible text heading repeats a section's name.
 * @param markdown a Markdown file's text
 * @returns one problem per section that breaks the rule
 */
export function headingProblems(markdown: string): string[] {
  const problems: string[] = []
  const lines = markdown.split('\n')

  for (const [i, line] of lines.entries()) {
    // The band is named by its <img>'s own src (the wide, light file); the <source>s before it are other files.
    const band = /<img [^>]*src="docs\/assets\/readme\/band-([a-z-]+)-light\.svg"/.exec(line)?.[1]

    if (band === undefined) continue
    const name = /<img alt="([^"]*)"/.exec(line)?.[1] ?? ''
    const level = /<(h[1-6])>/.exec(line)?.[1]

    // GitHub draws a full-width rule under an h1 or h2: a second line under the band's own divider.
    if (level === 'h1' || level === 'h2') {
      problems.push(`line ${i + 1}: the ${band} band is in an <${level}>, which draws GitHub's rule under it; use <h3>`)
    } else if (!/^<h3><picture>.*<\/picture><\/h3>$/.test(line)) {
      problems.push(`line ${i + 1}: the ${band} band is not an <h3> holding only its picture`)
    }
    if (name === '') problems.push(`line ${i + 1}: the ${band} band's alt text is empty; it must name the section`)
    if (lines[i - 1] !== `<a name="${band}"></a>`) problems.push(`line ${i + 1}: the ${band} band has no <a name="${band}"></a> just before it`)
    const repeat = lines.findIndex(l => new RegExp(`^(#{1,6} |<h[1-6]>)${name.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</h[1-6]>)?\\s*$`).test(l))

    if (name !== '' && repeat >= 0) problems.push(`line ${repeat + 1}: a visible "${name}" heading repeats the ${band} band`)
  }

  return problems
}

const fail = (what: string): never => {
  throw new Error(`readme self-test: ${what}`)
}

/** A band heading as the README writes it, with all four sources, the narrow ones first. */
const bandOf = (slug: string, alt: string, wrap = (p: string): string => `<h3>${p}</h3>`): string => {
  const src = (f: string): string => `<source srcset="docs/assets/readme/band-${slug}-${f}.svg">`
  const picture = `<picture>${src('narrow-dark')}${src('narrow-light')}${src('dark')}<img alt="${alt}" src="docs/assets/readme/band-${slug}-light.svg"></picture>`

  return `<a name="${slug}"></a>\n${wrap(picture)}\n`
}

const fence = (body: string): string => `text\n\`\`\`text\n${body}\n\`\`\`\ntext\n`

const altOf = (v: string): string => `  <a href="https://github.com/o/r/releases"><img alt="Release v${v}"`
const srcOf = (v: string): string => `    src="https://img.shields.io/static/v1?label=release&message=v${v}&color=FFC83D"></a>`
const block = (inner: string[]): string => ['x', `  ${START}`, ...inner, `  ${END}`, 'y'].join('\n')

function selfTest(): void {
  const square = '+--- [ A ] ---+\n|             |\n| a      b    |\n+-------------+'

  if (raggedRows(fence(square)).length > 0) fail('a square box was refused')
  if (raggedRows(fence(square.replace('| a      b    |', '| a      b     |'))).length !== 1) fail('a wide row passed')
  if (raggedRows(fence(square.replace('| a      b    |', '| a      b   |'))).length !== 1) fail('a narrow row passed')
  if (raggedRows(fence(square.replace('+-------------+', '+--------------+'))).length !== 1) fail('a long bottom rule passed')
  if (raggedRows(fence(square.replace('| a      b    |', '| a      —    |'))).length > 0) fail('an em dash was not one cell')
  if (raggedRows(`| a | b |\n|---|---|\n${fence(square)}`).length > 0) fail('a table outside a code block was checked')
  if (raggedRows(fence('| no rule above |\n| so not a box |')).length > 0) fail('pipes without a top rule were checked')
  if (raggedRows(`${fence(square)}${fence('+-----+\n|     |\n+-----+')}`).length > 0) fail('a second box kept the first rule')

  if (markerProblem(block([altOf('1.0.0'), srcOf('1.0.0')])) !== undefined) fail('the release badge alone in its block was refused')
  if (markerProblem('no marker here') === undefined) fail('a README without the block passed')
  if (markerProblem(block([altOf('1.0.0'), srcOf('1.0.1')])) === undefined) fail('an alt text and an address that disagree passed')
  if (markerProblem(block([altOf('1.0.0'), '    src="https://img.shields.io/badge/release-v1.0.0-FFC83D"></a>'])) === undefined) {
    fail('a hyphen after the version, which release-please would read as a pre-release, passed')
  }
  if (markerProblem(block([`${altOf('1.0.0')} src="https://img.shields.io/badge/release-v1.0.0-FFC83D"></a>`])) === undefined) {
    fail('both versions on one line passed')
  }
  if (markerProblem(block([altOf('1.0.0'), srcOf('1.0.0'), '  Claude Code 2.1.329'])) === undefined) fail('a third line in the block passed')
  if (markerProblem(`${block([altOf('1.0.0'), srcOf('1.0.0')])}\n<code>v1.0.0</code> <!-- x-release-please-version -->`) === undefined) {
    fail('an inline marker beside the block passed')
  }

  const divider = '<picture><source srcset="docs/assets/readme/divider-dark.svg"><img alt="" src="docs/assets/readme/divider-light.svg"></picture>'

  if (linkProblems(`<p>${divider}</p>`).length > 0) fail('a divider in a <picture> was refused')
  if (linkProblems('<p><img alt="" src="docs/assets/readme/divider-light.svg"></p>').length === 0) fail('a bare decorative <img> passed')
  if (linkProblems(`<a href="#x">${divider}</a>`).length === 0) fail('a decorative image inside a link passed')
  if (linkProblems('<a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-30363d"></a>').length > 0) {
    fail('a badge with its link was refused')
  }

  if (headingProblems(bandOf('install', 'Install')).length > 0) fail('a band heading was refused')
  if (headingProblems(`${bandOf('install', 'Install')}\n## Install\n`).length === 0) fail('a visible heading repeating the band passed')
  if (headingProblems(bandOf('install', '')).length === 0) fail('a band heading with no name passed')
  if (headingProblems(bandOf('install', 'Install', p => `<p>${p}</p>`)).length === 0) fail('a band outside a heading passed')
  if (headingProblems(bandOf('install', 'Install').replace('<a name="install"></a>\n', '')).length === 0) fail('a band without its anchor passed')
  if (headingProblems(bandOf('install', 'Install', p => `<h2>${p}</h2>`)).length === 0) fail('a band in an <h2> passed')
  if (headingProblems(bandOf('install', 'Install', p => `<h1>${p}</h1>`)).length === 0) fail('a band in an <h1> passed')
  console.log('readme self-test: ok')
}

const [mode] = process.argv.slice(2)

if (mode === '--self-test') {
  selfTest()
} else if (mode === '--check') {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const problems = raggedRows(readme).map(p => `ragged box, ${p}`)
  const marker = markerProblem(readme)

  if (marker !== undefined) problems.push(marker)
  problems.push(...linkProblems(readme), ...headingProblems(readme))
  if (problems.length > 0) {
    console.error(`readme: README.md:\n${problems.map(p => `  ${p}`).join('\n')}`)
    process.exit(1)
  }
  console.log('readme: boxes square, the release-please block the release badge alone, decorative images unlinked, one heading per section.')
} else {
  console.error('usage: bun tools/scripts/readme.ts --check | --self-test')
  process.exit(2)
}
