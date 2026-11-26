// The engine's tested range, pure (docs/decisions/0012-engine-range.md): read the manifest's
// `engines["claude-code"]` and say whether a Claude Code version is inside it. hooks/shared/engine.ts runs the
// check in the session; tools/scripts/engines.ts checks CI's pin against the same range.

/** A version's release numbers: major, minor, patch. */
type Triple = readonly [number, number, number]

/** A tested range: from `min`, up to but not including `below`. */
export type Range = { min: Triple; below: Triple }

const TRIPLE = /^(\d+)\.(\d+)\.(\d+)$/

const tripleOf = (text: string): Triple | undefined => {
  const m = TRIPLE.exec(text)

  return m === null ? undefined : [Number(m[1]), Number(m[2]), Number(m[3])]
}

const compare = (a: Triple, b: Triple): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * Reads a range written as `>=a.b.c <x.y.z`, the only form ghostframe's manifest uses. Anything else is refused, so a
 * range is never read more loosely than it was written.
 * @param text the manifest's `engines["claude-code"]`
 * @returns the range
 */
export function parseRange(text: string): Range {
  const m = /^>=(\S+) <(\S+)$/.exec(text)
  const min = m === null ? undefined : tripleOf(m[1] ?? '')
  const below = m === null ? undefined : tripleOf(m[2] ?? '')

  if (min === undefined || below === undefined || compare(min, below) >= 0) {
    throw new Error(`engines range "${text}" is not ">=a.b.c <x.y.z" with a floor below its ceiling`)
  }

  return { min, below }
}

/**
 * Whether an engine version is in the range. A development build counts as its release (`2.1.330-dev` is 2.1.330).
 * @param version `$.session.version()`'s `base`, or a version as `claude --version` prints it
 * @param range the tested range
 * @returns true from the floor up to, not including, the ceiling
 */
export function inRange(version: string, range: Range): boolean {
  const v = tripleOf(version.replace(/-.*$/, ''))

  if (v === undefined) throw new Error(`"${version}" is not a Claude Code release version`)

  return compare(v, range.min) >= 0 && compare(v, range.below) < 0
}

/**
 * The range in words, for the notice and /cockpit.
 * @param range the tested range
 * @returns `2.1.329 and later, below 2.2.0`
 */
export const rangeText = (range: Range): string => `${range.min.join('.')} and later, below ${range.below.join('.')}`
