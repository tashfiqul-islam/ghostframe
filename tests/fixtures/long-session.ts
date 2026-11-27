// The long session the benchmarks replay (docs/development/performance.md), generated, not recorded: 50 typed turns
// that draw 1,000 transcript rows of every kind (prose, tables, code, figures, lists, tool rows, agent rows), 300 tool
// calls and 5 background agents. The same shape as tests/fixtures/live.ts, so tests/support/live.ts replays it.
// Deterministic: the same rows every run.
import type { LiveAgent, LiveEvent, LiveTurn } from './live'

export const TURN_COUNT = 50
/** Per turn: 1 prompt row, 6 tool rows and 13 blocks; 1,000 rows over the session. */
export const CALLS_PER_TURN = 6
export const BLOCKS_PER_TURN = 13
/** A background agent is launched in every tenth turn. */
export const AGENT_TURNS: readonly number[] = [10, 20, 30, 40, 50]

const pad = (n: number): string => String(n).padStart(3, '0')

const prose = (n: number, i: number): string =>
  `Turn ${n}, step ${i}: the width check reads \`src/width.ts\` and counts **grapheme clusters**, not UTF-16 code units. ` +
  `The runner pinned in [the CI file](https://example.com/ci/${n}) used an older ICU, so a skin-tone modifier split into two cells. ` +
  `Next, the fix keeps the cache keyed by the string and the width, which also stops the redraw from measuring twice.\n\n` +
  `A second paragraph, so the reply wraps across rows at every width: the cockpit pane takes its share and the left keeps the rest.`

const table = (n: number, i: number): string =>
  [
    '| file | adds | dels | result |',
    '| --- | ---: | ---: | --- |',
    ...Array.from({ length: 6 }, (_, r) => `| src/module-${n}-${i}-${r}.ts | ${(n * 7 + r * 3) % 90} | ${(n + r) % 17} | ${r % 3 === 0 ? 'fails' : 'passes'} |`)
  ].join('\n')

const code = (n: number, i: number): string =>
  [
    '```ts',
    `// module ${n}, block ${i}`,
    ...Array.from({ length: 18 }, (_, r) => `export const value${r} = (s: string): number => [...new Intl.Segmenter().segment(s)].length + ${n * r}`),
    '```'
  ].join('\n')

const figure = (n: number, i: number): string => {
  const row = (r: string): string => `|${` ${r}`.padEnd(50)}|`
  const title = ` [ STEPS ${n}.${i} ] `
  const l = Math.floor((50 - title.length) / 2)

  return [
    '```',
    `+${'-'.repeat(l)}${title}${'-'.repeat(50 - l - title.length)}+`,
    row(''),
    ...['1  read the failing test', '│', '2  pin the runner', '│', '3  run the tests again'].map(row),
    row(''),
    `+${'-'.repeat(50)}+`,
    '```'
  ].join('\n')
}

const list = (n: number, i: number): string =>
  [
    `## What changed in turn ${n}, part ${i}`,
    '',
    ...Array.from({ length: 5 }, (_, r) => `- item ${r}: \`src/part-${r}.ts\` now measures once`),
    '',
    '1. first',
    '2. second'
  ].join('\n')

const KINDS = [prose, table, code, figure, list] as const

const text = (n: number, i: number): string => (KINDS[i % KINDS.length] ?? prose)(n, i)

/** One tool call of a turn, cycling through the kinds a session makes. */
function call(n: number, c: number, at: number): LiveEvent {
  const id = `toolu_${pad(n)}_${c}`
  const kind = c % 6

  if (AGENT_TURNS.includes(n) && c === 0) {
    const description = `review module ${n}`

    return {
      k: 'call',
      at,
      ms: 1_200,
      id,
      tool: 'Agent',
      input: { description, prompt: `Review src/module-${n}.ts for width bugs`, subagent_type: 'general-purpose', run_in_background: true },
      text: `Async agent launched: ${description}`
    }
  }
  if (kind === 0) return { k: 'call', at, ms: 4_000, id, tool: 'Bash', input: { command: `bun test width-${n}` }, text: ` ${12 + c} pass\n 0 fail\n` }
  if (kind === 1) return { k: 'call', at, ms: 300, id, tool: 'Read', input: { file_path: `src/module-${n}.ts` }, text: 'export const x = 1\n'.repeat(40) }
  if (kind === 2) {
    return {
      k: 'call',
      at,
      ms: 500,
      id,
      tool: 'Edit',
      input: { file_path: `src/module-${n}.ts`, old_string: 'a', new_string: 'b' },
      text: 'ok',
      result: { structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }] }
    }
  }
  if (kind === 3) return { k: 'call', at, ms: 200, id, tool: 'Grep', input: { pattern: 'width', path: 'src' }, text: `src/module-${n}.ts:3: width` }
  if (kind === 4)
    return { k: 'call', at, ms: 2_000, id, tool: 'WebFetch', input: { url: `https://example.com/doc/${n}`, prompt: 'summarise' }, text: 'A page.' }

  return { k: 'call', at, ms: 3_000, id, tool: 'Bash', input: { command: `git status --short` }, text: ` M src/module-${n}.ts\n` }
}

function turn(n: number): LiveTurn {
  const at = n * 120_000
  const events: LiveEvent[] = []
  let t = at + 2_000
  let b = 0

  // Blocks and calls interleave: two blocks, a call, and so on; the turn's answer is its last block.
  for (let c = 0; c < CALLS_PER_TURN; c++) {
    for (let k = 0; k < 2; k++) events.push({ k: 'text', at: (t += 1_500), text: text(n, b++) })
    events.push(call(n, c, (t += 500)))
    t += 5_000
  }
  while (b < BLOCKS_PER_TURN) events.push({ k: 'text', at: (t += 1_500), text: text(n, b++) })
  events.push({ k: 'end', at: (t += 500), durationMs: t - at })

  return { prompt: `turn ${n}: fix the width check in src/module-${n}.ts and run the tests`, at, row: `row-${pad(n)}`, events }
}

export const TURNS: Record<number, LiveTurn> = Object.fromEntries(Array.from({ length: TURN_COUNT }, (_, i) => [i + 1, turn(i + 1)]))

export const AGENTS: LiveAgent[] = AGENT_TURNS.map(n => ({
  agentId: `agent-${pad(n)}`,
  meta: { description: `review module ${n}`, agentType: 'general-purpose' },
  steps: []
}))
