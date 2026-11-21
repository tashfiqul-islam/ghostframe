// A reply's citations: each block's runs and the sources it cites, numbered through the turn, and memos of both.
import type { FlowStamp } from '../../types'
import { remember } from '../shared/held'
import { splitBlocks } from './blocks/split'
import type { Block } from './blocks/split'
import { parseInline } from './prose'
import type { Run } from './prose'
import { parseCited } from './research/cites'
import type { sourcesCites } from './research/cites'
import type { Numbering } from './research/cites'
import { numberTable } from './table/parse'

/**
 * The sources a turn's text blocks cited before index `before` (all of them when
 * omitted), in first-cited order: what numbers the next block's markers continue from.
 * A Sources list naming one again keeps its own title.
 */
export const turnCites = (list: readonly FlowStamp[], turn: string | null, before = list.length) => {
  const out: { url: string; title: string; listed?: boolean; marked?: boolean }[] = []

  for (const f of list.slice(0, before)) {
    if (f.turn !== turn || f.kind !== 'text') continue

    for (const c of f.cites ?? []) {
      const at = out.findIndex(x => x.url === c.url)
      const had = out[at]

      if (had === undefined) out.push({ ...c })
      else out[at] = { ...had, ...(c.listed === true ? { title: c.title, listed: true } : {}), ...(c.marked === true ? { marked: true } : {}) }
    }
  }

  return out
}

type Cites = ReturnType<typeof sourcesCites>
export type Prepared = { title?: string | undefined; items: { depth: number; marker: string; runs: Run[]; cites: Cites }[]; cites: Cites }

/**
 * Sources cited earlier in the turn, as `noteFlow` stored them: first-cited order.
 * `listed`: named in a Sources list. `marked`: a drawn block carries its marker.
 */
type TurnCite = { url: string; title: string; listed?: boolean; marked?: boolean }

/**
 * One pass over a reply's blocks: each block's runs and the sources it cites, numbered
 * through the turn (`earlier`: what the turn's earlier messages cited, in order), and
 * every source the turn cites so far (by number; a Sources list's title wins).
 * The reply draws from it and the close rule counts from it, so the two always agree.
 * Only blocks the mod draws itself cite anything: a block left to the engine (a table or
 * paragraph we can't parse) never numbers a source, so it can't leave a footnote behind.
 */
export function citationsOf(blocks: readonly Block[], earlier: readonly TurnCite[] = []) {
  const numbering: Numbering = new Map()
  const byNumber = new Map<number, Cites[number] & { listed?: boolean; marked?: boolean }>()
  const touched = new Set<number>()
  const note = (c: Cites[number], how: { listed?: boolean; marked?: boolean }, mine = true) => {
    const had = byNumber.get(c.n)
    const listed = how.listed === true || had?.listed === true
    const marked = how.marked === true || had?.marked === true
    // A Sources list's title wins over a link's text.
    const title = had === undefined || (how.listed === true && had.listed !== true) ? c.title : had.title

    if (mine) touched.add(c.n)
    byNumber.set(c.n, { n: c.n, url: c.url, title, ...(listed ? { listed } : {}), ...(marked ? { marked } : {}) })
  }

  // Sources a Sources list names but no drawn marker cites: in the frame, without a number.
  const listedOnly = new Map<string, TurnCite>()

  for (const c of earlier) {
    // Only a marker takes a number (§0.2: every number in the frame is on screen).
    if (c.marked !== true) {
      listedOnly.set(c.url, c)
      continue
    }
    if (!numbering.has(c.url)) numbering.set(c.url, numbering.size + 1)
    note({ n: numbering.get(c.url) ?? 0, url: c.url, title: c.title }, c, false)
  }

  // Numbers the turn's earlier messages already gave (and framed, in a web turn).
  const earlierNumbers = numbering.size
  const cited = new Map<Block, { runs?: Run[]; cites: Cites; byTitle: boolean; unmarked?: TurnCite[] }>()
  const lists = new Map<Block, Prepared>()
  // Tables with links: renumbered through the turn, and the sources they cite.
  const tables = new Map<Block, { block: Extract<Block, { kind: 'table' }>; cites: Cites }>()

  for (const b of blocks) {
    if (b.kind === 'cited') {
      const c = parseCited(b.text, numbering)

      if (c !== undefined) cited.set(b, { ...c, byTitle: false })
      for (const x of c?.cites ?? []) note(x, { marked: true })
    } else if (b.kind === 'table') {
      // A partial table's complete rows number first: they are the prefix of the whole.
      const whole = numberTable(b.table, numbering)
      const settled = b.settled === undefined ? undefined : numberTable(b.settled, new Map(numbering)).table

      if (whole.cites.length > 0) {
        tables.set(b, { block: { ...b, table: whole.table, ...(settled !== undefined ? { settled } : {}) }, cites: whole.cites })
        for (const x of whole.cites) note(x, { marked: true })
      }
    } else if (b.kind === 'list') {
      const cites: Cites = []
      const items = b.items.map(it => {
        // The streaming last item: plain text, marks dropped, until it parses.
        if (it.loose === true) return { ...it, runs: [{ t: it.text.replace(/[*_`[\]<>]/g, ''), s: 'plain' as const }], cites: [] }

        const c = parseCited(it.text, numbering)

        for (const x of c?.cites ?? []) {
          if (!cites.some(y => y.n === x.n)) cites.push(x)
          note(x, { marked: true })
        }

        return { ...it, runs: c?.runs ?? parseInline(it.text) ?? [{ t: it.text, s: 'plain' as const }], cites: c?.cites ?? [] }
      })

      lists.set(b, { title: b.title, items, cites })
    }
  }

  // Sources lists last: numbers follow the markers in reading order, wherever the list
  // sits; an item no marker cites keeps no number.
  const ownListed: TurnCite[] = []

  for (const b of blocks) {
    if (b.kind !== 'sources') continue

    const cites: Cites = []
    const unmarked: TurnCite[] = []

    for (const it of b.items) {
      const n = numbering.get(it.url)

      if (n === undefined) {
        const entry = { url: it.url, title: it.title, listed: true }

        if (!listedOnly.has(it.url)) listedOnly.set(it.url, entry)
        if (!ownListed.some(x => x.url === it.url)) ownListed.push(entry)
        if (!unmarked.some(x => x.url === it.url)) unmarked.push(entry)
      } else if (!cites.some(c => c.n === n)) {
        cites.push({ n, url: it.url, title: it.title })
        note({ n, url: it.url, title: it.title }, { listed: true })
      }
    }

    cited.set(b, { cites, byTitle: true, unmarked })
  }

  // A source an earlier list named and this message marks: numbered now, not listed-only.
  for (const url of numbering.keys()) listedOnly.delete(url)

  const sorted = [...byNumber.values()].toSorted((a, b) => a.n - b.n)
  const sources = sorted.map(({ n, url, title }) => ({ n, url, title }))
  // Every source this message cites, for its flow stamp (flags kept).
  const own: TurnCite[] = [...sorted.filter(c => touched.has(c.n)).map(({ n: _, ...c }) => c), ...ownListed.filter(c => listedOnly.has(c.url))]
  // Every source the turn has cited or listed so far, flags merged.
  const all: TurnCite[] = [...sorted.map(({ n: _, ...c }) => c), ...listedOnly.values()]

  // What this message adds to the turn: its frame, in a web turn. A source an earlier
  // message already numbered or listed is in that message's frame, not again here.
  const mine = sources.filter(c => touched.has(c.n) && c.n > earlierNumbers)
  const mineListed = ownListed.filter(c => listedOnly.has(c.url) && !earlier.some(x => x.url === c.url))

  return { cited, lists, tables, sources, own, all, mine, mineListed, listsHere: ownListed.length > 0 }
}

// A reply redraws on every state change; its blocks and citations change only with its
// text and what the turn cited above it. Held per text and per request, bounded.
const MEMO_MAX = 200
const blockMemo = new Map<string, Block[]>()
const citeMemo = new Map<string, { blocks: readonly Block[]; out: ReturnType<typeof citationsOf> }>()

export function blocksOf(text: string): Block[] {
  const blocks = blockMemo.get(text) ?? splitBlocks(text)

  remember(blockMemo, text, blocks, MEMO_MAX)

  return blocks
}

// Keyed by the request and what came before; the blocks themselves (one text's, by
// identity) must match too, since the result's maps are keyed by block.
export function citationsFor(request: string, blocks: readonly Block[], earlier: readonly TurnCite[]) {
  const key = `${request}␟${JSON.stringify(earlier)}`
  const had = citeMemo.get(key)
  const out = had !== undefined && had.blocks === blocks ? had.out : citationsOf(blocks, earlier)

  remember(citeMemo, key, { blocks, out }, MEMO_MAX)

  return out
}
