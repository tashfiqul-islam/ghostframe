import { TEST_CMD, changeParts } from './activity'
import { C, fmtDuration, pad, vw } from './grid'
import { clipLabel, sourceLabel } from './research'
import { frameLines } from './states'
import { clean, stripNoise } from './testsummary'
import type { TestCounts } from './testsummary'
import type { Part } from './states'

export { parseTests } from './testsummary'

// ─── Outcome cards (DESIGN.md §5.15, §5.16 under §0.1 r10, r11) ──────────────
// Read from a shell call's own output when it ends (tool.call), stored by its id,
// drawn under its step row by ToolResult. Output we can't read draws no card: the
// step row's own result stands, and ctrl+o has the output.

// ─── Tests ───────────────────────────────────────────────────────────────────

export type TestRun = TestCounts & { id: string; turn?: string | null; runner: string }

/** The runner a command starts, in words (`vitest`, `bun test`, `pytest`). */
export function runnerOf(command: string): string | undefined {
  const m = TEST_CMD.exec(command)

  if (m === null) return undefined

  return (m[1] ?? m[0]).replace(/\s+/g, ' ').replace(/ run /, ' ')
}

/** The previous run of the same runner, before `id`. */
export function previousRun(runs: readonly TestRun[], id: string): TestRun | undefined {
  const i = runs.findIndex(r => r.id === id)

  if (i <= 0) return undefined

  const me = runs[i]

  return runs
    .slice(0, i)
    .toReversed()
    .find(r => r.runner === me?.runner)
}

/** `[ TESTS ]`: big counts, one segmented rail, the change since the last run, runner · time. */
export function testsFrame(width: number, run: TestRun, prev: TestRun | undefined, ms: number | null): Part[][] {
  const inner = width - 4
  const total = run.passed + run.failed + run.skipped
  // Zero counts stay out (`75 passed`, not `75 passed  0 failed  0 skipped`).
  const shown = [
    { n: run.passed, label: 'passed', color: C.textBright },
    { n: run.failed, label: 'failed', color: C.err },
    { n: run.skipped, label: 'skipped', color: C.textBright }
  ].filter((c, i) => c.n > 0 || (i === 0 && total === 0))
  const counts: Part[] = shown.flatMap((c, i) => [
    { t: String(c.n), color: c.color, bold: true },
    { t: ` ${c.label}${i < shown.length - 1 ? '    ' : ''}`, color: C.muted }
  ])
  const share = (n: number) => (total === 0 ? 0 : Math.round((inner * n) / total))
  const red = run.failed > 0 ? Math.max(1, share(run.failed)) : 0
  const green = Math.min(inner - red, share(run.passed))
  const rail: Part[] = [
    { t: '━'.repeat(green), color: C.ok },
    { t: '━'.repeat(red), color: C.err },
    { t: '─'.repeat(Math.max(0, inner - green - red)), color: C.hairline }
  ]
  const same = prev !== undefined && prev.passed === run.passed && prev.failed === run.failed && prev.skipped === run.skipped
  // The change since the runner's last run, only when the counts moved.
  const delta: Part[][] =
    prev === undefined || same
      ? []
      : [
          [
            {
              t: `was ${prev.passed} passed${prev.failed > 0 ? ` · ${prev.failed} failing` : ''}${prev.skipped > 0 ? ` · ${prev.skipped} skipped` : ''}`,
              color: C.dim
            }
          ]
        ]
  const took = ms === null ? '' : fmtDuration(ms)
  const foot: Part[] = [
    { t: run.runner, color: C.muted },
    { t: took.length > 0 ? pad(took, Math.max(0, inner - vw(run.runner)), 'right') : '', color: C.muted }
  ]
  const meta = run.failed > 0 ? { t: `${run.failed} failing`, color: C.err } : { t: 'all passing', color: C.ok }

  return frameLines(width, 'TESTS', meta, [counts, rail, ...delta, foot])
}

// ─── Final evidence: one card per turn ────────────────────────────────────────

type Turned = { id: string; turn: string | null }
type Owned = { id: string; turn?: string | null }

/** The turn a call ran in: its own record's, else its step stamp's. */
const turnIn = (stepList: readonly Turned[]) => (x: Owned) => x.turn ?? stepList.find(s => s.id === x.id)?.turn ?? null

/**
 * The calls whose card a turn shows: its last test run, and its last shipping call
 * (which carries the turn's whole shipping, see `mergeShips`). Earlier runs are their
 * step rows alone. A call whose turn is unknown keeps its own card.
 */
export function cardCalls(stepList: readonly Turned[], runs: readonly Owned[], shipList: readonly Owned[]): Set<string> {
  const turnOf = turnIn(stepList)
  const lastPerTurn = (list: readonly Owned[]) => {
    const out = new Map<string, string>()

    for (const x of list) out.set(turnOf(x) ?? `solo:${x.id}`, x.id)

    return [...out.values()]
  }

  return new Set([...lastPerTurn(runs), ...lastPerTurn(shipList)])
}

/** Every shipping call of `id`'s turn, up to and including it, as one: latest commit, push and PR. */
export function mergeShips(stepList: readonly Turned[], shipList: readonly Ship[], id: string): Ship | undefined {
  const turnOf = turnIn(stepList)
  const upTo = shipList.slice(0, shipList.findIndex(x => x.id === id) + 1)
  const me = upTo[upTo.length - 1]
  const turn = me === undefined ? null : turnOf(me)
  const mine = turn === null ? upTo.filter(x => x.id === id) : upTo.filter(x => turnOf(x) === turn)

  if (mine.length === 0) return undefined

  const last = <K extends 'commit' | 'push' | 'pr'>(k: K) => mine.toReversed().find(x => x[k] !== undefined)?.[k]
  const commit = last('commit')
  const push = last('push')
  const pr = last('pr')

  return { id, ...(commit ? { commit } : {}), ...(push ? { push } : {}), ...(pr ? { pr } : {}) }
}

// ─── Shipped ─────────────────────────────────────────────────────────────────

export type Ship = {
  id: string
  turn?: string | null
  commit?: { sha: string; subject: string; files: number; adds: number; dels: number }
  push?: { from: string; to: string }
  pr?: { n: number; url: string; head?: string; base?: string }
}

const flag = (command: string, names: string[]) => {
  for (const n of names) {
    const m = new RegExp(`(?:^|\\s)${n}(?:\\s+|=)("[^"]*"|'[^']*'|\\S+)`).exec(command)

    if (m?.[1] !== undefined) return m[1].replace(/^["']|["']$/g, '')
  }

  return undefined
}

export const isShipCommand = (command: string) => /\bgit\s+(commit|push)\b|\bgh\s+pr\s+create\b/.test(command)

/** What a shell call shipped, read from its command and output; nothing → undefined. */
export function parseShip(id: string, command: string, raw: string): Ship | undefined {
  const text = clean(raw)
  const ship: Ship = { id }

  if (/\bgit\s+commit\b/.test(command)) {
    const head = /^\[([^\]\s]+)(?: \(root-commit\))? ([0-9a-f]{7,40})\] (.+)$/m.exec(text)
    const stat = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(text)

    if (head !== null) {
      ship.commit = {
        sha: (head[2] ?? '').slice(0, 7),
        subject: (head[3] ?? '').trim(),
        files: Number(stat?.[1] ?? 0),
        adds: Number(stat?.[2] ?? 0),
        dels: Number(stat?.[3] ?? 0)
      }
    }
  }

  if (/\bgit\s+push\b/.test(command)) {
    const m = /^\s*[+*=!-]?\s*(?:[0-9a-f]+\.\.\.?[0-9a-f]+|\[new branch\]|\[new tag\])\s+(\S+)\s+->\s+(\S+)/m.exec(text)

    if (m !== null) ship.push = { from: m[1] ?? '', to: m[2] ?? '' }
  }

  if (/\bgh\s+pr\s+create\b/.test(command)) {
    const m = /(https:\/\/\S+\/pull\/(\d+))/.exec(text)

    if (m !== null) {
      const head = flag(command, ['--head', '-H'])
      const base = flag(command, ['--base', '-B'])

      ship.pr = { n: Number(m[2]), url: m[1] ?? '', ...(head !== undefined ? { head } : {}), ...(base !== undefined ? { base } : {}) }
    }
  }

  return ship.commit || ship.push || ship.pr ? ship : undefined
}

const LABEL_W = 8
const label = (t: string): Part => ({ t: pad(t, LABEL_W), color: C.muted })

/** `[ SHIPPED ]`, meta `PR open` / `pushed` / `committed`; rows labelled in words (r10). */
export function shippedFrame(width: number, ship: Ship): Part[][] {
  const inner = width - 4
  const rows: Part[][] = []

  if (ship.commit !== undefined) {
    const c = ship.commit

    rows.push([label('commit'), { t: c.sha, color: C.accent }, { t: `  ${c.subject}`, color: C.textBright }])

    const change = changeParts(c.adds, c.dels)

    if (change.length > 0 || c.files > 0) {
      rows.push([
        label('change'),
        ...change.flatMap((p, i) => [...(i > 0 ? [{ t: ' ', color: C.text }] : []), { t: p.text, color: p.color }]),
        ...(c.files > 0 ? [{ t: `${change.length > 0 ? ' · ' : ''}${c.files} ${c.files === 1 ? 'file' : 'files'}`, color: C.muted }] : [])
      ])
    }
  }

  if (ship.push !== undefined) {
    rows.push([label('push'), { t: `${ship.push.from} → ${ship.push.to}`, color: C.text }])
  }

  if (ship.pr !== undefined) {
    const p = ship.pr
    const branches = p.head !== undefined || p.base !== undefined ? `  ${p.head ?? 'this branch'} → ${p.base ?? 'default'}` : ''

    rows.push([label('pr'), { t: `#${p.n}`, color: C.textBright }, { t: branches, color: C.text }])
    rows.push([
      { t: ' '.repeat(LABEL_W), color: C.text },
      { t: clipLabel(sourceLabel(p.url), inner - LABEL_W), color: C.muted, href: p.url }
    ])
  }

  const meta = ship.pr !== undefined ? 'PR open' : ship.push !== undefined ? 'pushed' : 'committed'

  return frameLines(width, 'SHIPPED', { t: meta, color: C.ok }, rows)
}

/** A shell call's output as text: stdout and stderr, or the error text the model read. */
export function shellText(output: unknown): string {
  if (typeof output === 'string') return stripNoise(output)

  if (typeof output === 'object' && output !== null) {
    const stdout = 'stdout' in output ? output.stdout : undefined
    const stderr = 'stderr' in output ? output.stderr : undefined

    return stripNoise([stdout, stderr].filter((x): x is string => typeof x === 'string').join('\n'))
  }

  return ''
}
