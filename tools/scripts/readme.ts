// Two checks of README.md's shape.
//
// - Its ASCII boxes stay square. Inside a fenced code block, every line from the block's top rule (the first line
//   starting `+--`) on that starts with `+--` or `|` must be exactly as wide as that rule, in terminal cells, so every
//   right-hand border sits in one column.
// - release-please's `x-release-please-version` marker sits on one line, and that line holds only the version
//   (`<code>v1.2.3</code>` and the marker), so the marker can never rewrite another number.
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

const MARKER = '<!-- x-release-please-version -->'

/**
 * What is wrong with the release-please marker's line.
 * @param markdown a Markdown file's text
 * @returns the problem, or undefined when exactly one line has the marker and it holds only the version
 */
export function markerProblem(markdown: string): string | undefined {
  const lines = markdown.split('\n').flatMap((line, i) => (line.includes('x-release-please-version') ? [{ line, at: i + 1 }] : []))
  const [only] = lines

  if (only === undefined) return 'no line has the x-release-please-version marker'
  if (lines.length > 1) return `the x-release-please-version marker is on ${lines.length} lines (${lines.map(l => l.at).join(', ')})`
  if (!/^\s*<code>v\d+\.\d+\.\d+<\/code>\s*<!-- x-release-please-version -->\s*$/.test(only.line)) {
    return `line ${only.at} holds more than the version and its marker: ${only.line.trim()}`
  }

  return undefined
}

const fail = (what: string): never => {
  throw new Error(`readme self-test: ${what}`)
}

const fence = (body: string): string => `text\n\`\`\`text\n${body}\n\`\`\`\ntext\n`

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

  if (markerProblem(`a\n  <code>v1.0.0</code> ${MARKER}\nb`) !== undefined) fail('a version alone with its marker was refused')
  if (markerProblem('no marker here') === undefined) fail('a README without the marker passed')
  if (markerProblem(`<code>v1.0.0</code> ${MARKER}\n<code>v1.0.0</code> ${MARKER}`) === undefined) fail('two marker lines passed')
  if (markerProblem(`<code>v1.0.0</code> · Claude Code 2.1.329 ${MARKER}`) === undefined) fail('a second number on the marker line passed')
  if (markerProblem(`<a href="x"><code>v1.0.0</code></a> ${MARKER}`) === undefined) fail('markup around the version passed')
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
  if (problems.length > 0) {
    console.error(`readme: README.md:\n${problems.map(p => `  ${p}`).join('\n')}`)
    process.exit(1)
  }
  console.log('readme: every box in README.md is square, and the version marker holds only the version.')
} else {
  console.error('usage: bun tools/scripts/readme.ts --check | --self-test')
  process.exit(2)
}
