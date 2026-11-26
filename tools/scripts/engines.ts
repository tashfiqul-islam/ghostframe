// The engine range's checks (docs/decisions/0012-engine-range.md). The range lives in one place, plugin.json's
// `engines["claude-code"]`; the Claude Code version CI pins (ci.yml's CLAUDE_CODE_VERSION) must be inside it.
//
//   bun tools/scripts/engines.ts --check          the pinned version is inside the range (the gate runs this)
//   bun tools/scripts/engines.ts --report <ver>   says whether <ver> is inside, for the weekly canary's summary
//   bun tools/scripts/engines.ts --self-test      the checks catch what they should
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { inRange, parseRange, type Range } from '../../hooks/shared/range'

const root = join(import.meta.dirname, '..', '..')

/**
 * The manifest's range.
 * @param manifest plugin.json's text
 * @returns the range and its text
 */
export function rangeOf(manifest: string): { range: Range; text: string } {
  const m: unknown = JSON.parse(manifest)
  const engines = typeof m === 'object' && m !== null && 'engines' in m ? m.engines : undefined
  const text = typeof engines === 'object' && engines !== null && 'claude-code' in engines ? engines['claude-code'] : undefined

  if (typeof text !== 'string') throw new Error('plugin.json has no engines["claude-code"] range')

  return { range: parseRange(text), text }
}

/**
 * The version CI pins.
 * @param workflow ci.yml's text
 * @returns CLAUDE_CODE_VERSION's value
 */
export function pinnedOf(workflow: string): string {
  const m = /^ {2}CLAUDE_CODE_VERSION: (\S+)$/m.exec(workflow)

  if (m?.[1] === undefined) throw new Error('ci.yml pins no CLAUDE_CODE_VERSION')

  return m[1]
}

/**
 * Where a version sits against the manifest's range, as one line.
 * @param version a Claude Code version
 * @param manifest plugin.json's text
 * @returns whether it is inside, and the line that says so
 */
export function report(version: string, manifest: string): { isInside: boolean; line: string } {
  const { range, text } = rangeOf(manifest)
  const isInside = inRange(version, range)

  return {
    isInside,
    line: isInside
      ? `Claude Code ${version} is inside ghostframe's tested range (${text}).`
      : `Claude Code ${version} is outside ghostframe's tested range (${text}): ghostframe is dormant on it.`
  }
}

const fail = (what: string): never => {
  throw new Error(`engines self-test: ${what}`)
}

function selfTest(): void {
  const manifest = JSON.stringify({ engines: { 'claude-code': '>=2.1.329 <2.2.0' } })

  if (!report('2.1.329', manifest).isInside || report('2.2.0', manifest).isInside) fail('the range is read wrong')
  if (pinnedOf('env:\n  CLAUDE_CODE_VERSION: 2.1.329\n') !== '2.1.329') fail('the pin is read wrong')
  for (const broken of [JSON.stringify({}), JSON.stringify({ engines: { 'claude-code': '^2.1.0' } })]) {
    try {
      rangeOf(broken)
      fail(`a missing or loose range passed: ${broken}`)
    } catch (error: unknown) {
      if (String(error).includes('self-test')) throw error
    }
  }
  console.log('engines self-test: ok')
}

const [mode, version] = process.argv.slice(2)
const manifest = (): string => readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')

if (mode === '--self-test') {
  selfTest()
} else if (mode === '--check') {
  const pinned = pinnedOf(readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8'))
  const { isInside, line } = report(pinned, manifest())

  if (!isInside) {
    console.error(`engines: CI pins Claude Code ${pinned}, outside plugin.json's range. ${line}`)
    process.exit(1)
  }
  console.log(`engines: ${line}`)
} else if (mode === '--report' && version !== undefined) {
  console.log(report(version, manifest()).line)
} else {
  console.error('usage: bun tools/scripts/engines.ts --check | --report <version> | --self-test')
  process.exit(2)
}
