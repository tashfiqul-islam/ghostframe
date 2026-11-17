// ─── Shell output: engine noise and test summaries ───────────────────────────
// Shared by the step row (its result says `56 pass` / `3 fail`) and the
// [ TESTS ] card. No imports from the rest of the mod, so anything may use it.

// oxlint-disable-next-line eslint/no-control-regex -- ESC (\x1b) is the point: this strips ANSI colour escapes from shell output
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
// Lines the engine adds to a shell's output that say nothing about the command.
const NOISE = /^[ \t]*Shell cwd was reset to [^\n]*(?:\n|$)/gm

/** Output without the engine's own notes (`Shell cwd was reset to …`). */
export const stripNoise = (t: string) => t.replace(NOISE, '')

export const clean = (t: string) => stripNoise(t.replace(ANSI, '').replace(/\r\n?/g, '\n'))

export type TestCounts = { passed: number; failed: number; skipped: number }

const countsIn = (line: string): Partial<Record<'passed' | 'failed' | 'skipped', number>> => {
  const out: Partial<Record<'passed' | 'failed' | 'skipped', number>> = {}

  for (const m of line.matchAll(/(\d+)\s+(passed|pass|failed|fail|errors?|skipped|skip|todo|ignored|pending)\b/gi)) {
    const n = Number(m[1])
    const word = (m[2] ?? '').toLowerCase()
    const key = word.startsWith('pass') ? 'passed' : /^(fail|error)/.test(word) ? 'failed' : 'skipped'

    out[key] = (out[key] ?? 0) + n
  }

  return out
}

const full = (c: Partial<TestCounts>): TestCounts | undefined =>
  c.passed === undefined && c.failed === undefined ? undefined : { passed: c.passed ?? 0, failed: c.failed ?? 0, skipped: c.skipped ?? 0 }

const last = <T>(xs: T[]) => xs[xs.length - 1]

/** A test run's summary counts, from whatever runner printed it; the last summary wins. */
export function parseTests(raw: string): TestCounts | undefined {
  const text = clean(raw)
  const lines = text.split('\n')

  // vitest `Tests  3 failed | 142 passed (145)`, jest `Tests:  1 failed, 9 passed, 10 total`
  const vj = last(lines.filter(l => /^\s*Tests:?\s+\d/.test(l)))

  if (vj !== undefined) return full(countsIn(vj.replace(/\d+\s+total/, '')))

  // pytest `==== 3 failed, 142 passed, 2 skipped in 3.21s ====`
  const py = last(lines.filter(l => /^=+ .*\d+ (passed|failed|error).* in [\d.]+s.*=+\s*$/.test(l)))

  if (py !== undefined) return full(countsIn(py))

  // cargo `test result: ok. 145 passed; 0 failed; 2 ignored; …` (one per crate, summed)
  const cargo = lines.filter(l => l.startsWith('test result: '))

  if (cargo.length > 0) {
    return cargo
      .map(countsIn)
      .reduce<TestCounts>((a, c) => ({ passed: a.passed + (c.passed ?? 0), failed: a.failed + (c.failed ?? 0), skipped: a.skipped + (c.skipped ?? 0) }), {
        passed: 0,
        failed: 0,
        skipped: 0
      })
  }

  // bun `  145 pass` / `  0 fail` / `  2 skip`, playwright `  145 passed (38s)` / `  3 failed`
  const tail: Partial<TestCounts> = {}

  for (const l of lines) {
    const m = /^\s*(\d+)\s+(pass|passed|fail|failed|skip|skipped)\b(?:\s*\([\d.]+m?s\))?\s*$/.exec(l)

    if (m !== null) Object.assign(tail, countsIn(`${m[1]} ${m[2]}`))
  }

  return full(tail)
}
