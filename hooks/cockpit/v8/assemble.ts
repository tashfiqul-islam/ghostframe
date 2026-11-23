// The pane, assembled (spec 8, 9.4, 9.5): the step log, the roster, the turn's work and history read into the v8 views,
// each openable row under its id, and the keys the view offers. Pure: cockpit/pane.tsx reads the state and draws this.
import { sourceLabel } from '../../shared/url'
import { decisive as decisiveLines } from '../fallback/events'
import { urlHost } from '../../shared/url'
import type { FlowStamp, LogStep, RosterAgent, StepDetail, StepLog, TurnRecord, TurnWork } from '../../../types'
import { isNarrationAt } from '../../shared/flow'
import { clockTime, count, dayWord, duration, rulerTime, timeRange } from '../../shared/look/format'
import { TOKEN } from '../../shared/look/palette'
import { levelsOf } from '../../shared/look/trace'
import type { Part } from '../../shared/parts'
import type { Line } from '../line'
import { failureCounts, isFailedMark, isOpen, isShipMark } from '../steps/log'
import type { Tab, View } from '../keys/view'
import { foldGroups, groupsOf, paneResult } from './groups'
import type { TimedStep } from './groups'
import { cutRow, drawerRows, framed, headCard, hintRow, rulerRows, tabRows, timelineRows } from './pane'
import type { AgentBar, Group, Head, Stat } from './pane'
import { agentHead, agentsView, allStepsView, countsOf, diffView, filesView, interruptedRow, pinnedHead, sourcesView, todoView } from './views'
import type { StepRow } from './views'

/** What the pane reads to draw (8). */
export type PaneInput = {
  width: number
  rows: number
  now: number
  isFocused: boolean
  isCovered: boolean
  log: StepLog
  roster: readonly RosterAgent[]
  work: TurnWork
  details: readonly StepDetail[]
  flow: readonly FlowStamp[]
  pinned: TurnRecord | undefined
  view: View
  tab: Tab
  isUrlsShown: boolean
  /** The agent whose conversation the engine has in view. */
  viewed: RosterAgent | undefined
  version: string
  /** The Files tab's file under the focus ring and its first hunk (8.5), drawn in place under its row. */
  selectedFile?: { path: string; hunk: readonly string[] } | undefined
  /** The selected file's counts from its own diff (baseline against now), the one its hunk shows: they always agree. */
  diffCounts?: ReadonlyMap<string, { adds: number; dels: number }> | undefined
  /**
   * The turn a rewind left as the last, shown in place of the rewound one (7.1); null when none remains. Absent
   * when no rewind took the shown turn.
   */
  remains?: TurnRecord | null | undefined
  /** A brief note for the hint row (`copied`). */
  note?: string | undefined
}

/** The pane as drawn: its rows, each openable one under its id, and the keys the view offers (key, action). */
export type Pane = { lines: Line[]; keys: [string, string][] }

const plainLines = (rows: readonly (readonly Part[])[]): Line[] => rows.map(parts => ({ parts: [...parts] }))
const SPARK_TOP = 7
const SPARK_MAX = 48

/** The turn a view shows: the pinned one, else the live log's. */
type Shown = {
  turnNo: number
  steps: readonly LogStep[]
  startedAt: number | null
  durationMs: number
  isLive: boolean
  /** The turn ended interrupted: its head says so, never FAILED (8.2). */
  isCut: boolean
  files: TurnWork['files']
  sources: TurnWork['sources']
  cited: TurnWork['cited']
}

// No turn yet (a fresh session): no head card, since there is no turn, state or time to give it (8.3's empty state).
const isBeforeFirstTurn = (shown: Shown): boolean => shown.turnNo === 0 && shown.startedAt === null && shown.steps.length === 0

/** Claude's own title for a cited page, when it wrote one; else the page's host and path. */
const linkTitle = (cited: string | undefined, url: string): string =>
  cited !== undefined && cited.length > 0 && cited !== sourceLabel(url) ? cited : hostPath(url)

/** A URL's host and path, without the scheme or a trailing slash: `example.com/missing-page`. */
const hostPath = (url: string): string =>
  url
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')

function shownOf(i: PaneInput): Shown {
  if (i.pinned === undefined && i.remains === null)
    return { turnNo: 0, steps: [], startedAt: null, durationMs: 0, isLive: false, isCut: false, files: [], sources: [], cited: [] }

  const p = i.pinned ?? i.remains ?? undefined

  if (p !== undefined)
    return {
      turnNo: p.turnNo,
      steps: p.steps,
      startedAt: p.startedAt,
      durationMs: p.durationMs,
      isLive: false,
      isCut: p.last?.state === 'interrupted',
      files: p.files,
      sources: p.sources,
      cited: p.cited
    }

  const log = i.log
  const isLive = log.isTurnRunning
  const durationMs = isLive && log.segmentStart !== null ? Math.max(0, i.now - log.segmentStart) : (log.last?.durationMs ?? 0)

  return {
    turnNo: log.turnNo,
    steps: log.steps,
    startedAt: log.startedAt,
    durationMs,
    isLive,
    isCut: !isLive && log.last?.state === 'interrupted',
    files: i.work.files,
    sources: i.work.sources,
    cited: i.work.cited
  }
}

/** Each step with its start and end on the turn's clock: from its kept detail, else its own clock. */
function timed(steps: readonly LogStep[], details: readonly StepDetail[], startedAt: number | null): TimedStep[] {
  return steps.map(s => {
    const d = details.find(x => x.id === s.id)
    const start = d !== undefined && startedAt !== null ? Math.max(0, d.startAt - startedAt) : s.clock
    const end = s.isRunning ? undefined : d?.ms === null || d?.ms === undefined ? s.clock : start + d.ms

    return { step: s, start, end }
  })
}

/** Claude's working sentences in the turn, each with the index of the first step after it (8.3). */
function sentencesOf(flow: readonly FlowStamp[], steps: readonly LogStep[], turns: ReadonlySet<string>): { text: string; at: number }[] {
  return flow.flatMap((f, i) => {
    if (f.kind !== 'text' || f.turn === null || !turns.has(f.turn) || !isNarrationAt(flow, i)) return []

    const next = flow.slice(i + 1).find(g => g.turn === f.turn && g.kind === 'tool')
    const at = next === undefined ? -1 : steps.findIndex(s => s.id === next.key || s.calls?.includes(next.key) === true)

    return at < 0 ? [] : [{ text: f.key, at }]
  })
}

/** The head card's facts (8.2). */
function headOf(i: PaneInput, shown: Shown): Head {
  const steps = shown.steps
  const counts = failureCounts(steps)
  const asked = steps.some(s => s.isRunning && i.log.asking.includes(s.id))
  const planned = steps.some(s => s.kind === 'plan' && s.subject === 'plan for review')
  // A turn that ended with its background agents still running waits on them (amendment 1, 8.2): it is live until
  // its receipt draws, so its pill is `● LIVE` and its range ends `now`.
  const waiting = i.pinned === undefined && !shown.isCut ? i.roster.filter(a => a.parent === null && a.state === 'running').length : 0
  const isLive = shown.isLive || waiting > 0
  // An interrupted turn is that, whatever its steps said: a failure in it never makes its head FAILED (8.2).
  const state: Head['state'] = isLive
    ? asked
      ? 'needsYou'
      : 'live'
    : shown.isCut
      ? 'interrupted'
      : counts.open.length > 0
        ? 'failed'
        : planned
          ? 'plan'
          : 'done'
  const start = shown.startedAt ?? i.now
  const end = isLive ? undefined : start + shown.durationMs
  const times = steps.map(s => s.clock)
  const buckets = Math.max(1, Math.min(SPARK_MAX, steps.length * 2))
  const failed = new Set(
    steps.flatMap((s, k) => (isOpen(steps, k) ? [Math.min(buckets - 1, Math.floor((s.clock / Math.max(1, shown.durationMs)) * buckets))] : []))
  )
  const launched = steps.filter(s => s.kind === 'agent').reduce((n, s) => n + (s.calls?.length ?? 1), 0)
  const stats: Stat[] = [
    { n: steps.length, word: steps.length === 1 ? 'step' : 'steps' },
    ...(counts.failed.length - counts.open.length > 0 ? [{ n: counts.failed.length - counts.open.length, word: 'fixed' }] : []),
    ...(counts.open.length > 0 ? [{ n: counts.open.length, word: shown.isLive ? 'open' : 'still failing' }] : []),
    ...(asked ? [{ n: 1, word: 'waiting' }] : []),
    ...(steps.some(s => s.state === 'blocked') ? [{ n: steps.filter(s => s.state === 'blocked').length, word: 'blocked' }] : []),
    ...(launched > 0 ? [{ n: launched, word: launched === 1 ? 'agent' : 'agents' }] : []),
    ...(shown.files.length > 0 ? [{ n: shown.files.length, word: shown.files.length === 1 ? 'file' : 'files' }] : [])
  ]
  const summary = shown.isLive
    ? i.log.said.length > 0
      ? i.log.said
      : 'Working'
    : waiting > 0
      ? `Waiting on ${count(waiting, 'agent')}`
      : (i.pinned?.last?.story ?? i.log.last?.story ?? '')

  return {
    state,
    turnNo: shown.turnNo,
    range: timeRange(start, end, dayWord(start, undefined)),
    summary: summary.replace(/[.!?…]+$/, ''),
    spark: steps.length === 0 ? [0] : levelsOf(times, Math.max(1, shown.durationMs), buckets, SPARK_TOP),
    failedBuckets: failed,
    stats,
    duration: duration(shown.durationMs)
  }
}

/** The agents a launch group holds (8.3): each as a bar under it, with its running or last sub-step. */
function agentBars(launch: LogStep, roster: readonly RosterAgent[], startedAt: number | null, now: number): AgentBar[] {
  return roster
    .filter(a => launch.calls?.includes(a.call) === true)
    .map(a => {
      const from = startedAt === null ? 0 : a.startedAt - startedAt
      const to = (a.endedAt ?? now) - (startedAt ?? 0)
      const isRunning = a.state === 'running'

      return {
        name: a.name,
        isFailed: a.state === 'failed',
        bar: { from, to, color: TOKEN.agent },
        result: duration((a.endedAt ?? now) - a.startedAt),
        // Nothing under an agent until its first step (8.9): no invented one.
        sub:
          a.kind.length === 0
            ? undefined
            : {
                glyph: isRunning ? 'current' : a.state === 'failed' ? 'failed' : 'ok',
                kind: a.kind,
                subject: a.subject,
                result: isRunning ? 'running' : a.state === 'failed' ? 'stopped' : 'done',
                tone: isRunning ? 'accent' : a.state === 'failed' ? 'err' : 'dim'
              }
      }
    })
}

/** The timeline (8.3), its groups under their ids, folded to fit `room` rows, a drawer under the open one. */
function timeline(i: PaneInput, shown: Shown, room: number): Line[] {
  const steps = shown.steps

  if (steps.length === 0) {
    return plainLines(
      shown.isLive || isBeforeFirstTurn(shown)
        ? [
            [],
            [],
            [{ t: '  Steps, files, sources and agents appear here as Claude works.', color: TOKEN.dim }],
            [{ t: '  The pane follows the live turn. p shows earlier turns', color: TOKEN.dim }]
          ]
        : [[], [{ t: '  No steps in this turn.', color: TOKEN.text }], [{ t: '  The timeline fills when Claude reads, runs or edits.', color: TOKEN.dim }]]
    )
  }

  const turns = new Set<string>([...(i.pinned?.turns ?? []), ...(i.pinned === undefined && i.log.turn !== null ? [i.log.turn] : [])])
  const span = Math.max(1, shown.durationMs)
  const decisive = new Map(
    i.details.flatMap(d =>
      // Fallback's failure rows' own source (13.1): the decisive line, never the engine's `Error: Exit code n`.
      d.isFailed && d.excerpt.length > 0 ? [[d.id, decisiveLines(d.excerpt, [])[0] ?? ''] as const] : []
    )
  )
  const groups = groupsOf(timed(steps, i.details, shown.startedAt), sentencesOf(i.flow, steps, turns), span, decisive).map(g => {
    const launch = steps.find(s => s.id === g.id && s.kind === 'agent') ?? undefined
    const agents = launch === undefined ? [] : agentBars(launch, i.roster, shown.startedAt, i.now)

    return agents.length > 0 ? { ...g, agents } : g
  })
  // Each group's own steps, and the one that decides it (8.4): an open failure, a block, a wait, else its last.
  const members = new Map(
    groups.map((g, k) => [
      g.id ?? '',
      steps.slice(
        steps.findIndex(s => s.id === g.id),
        groups[k + 1] === undefined ? steps.length : steps.findIndex(s => s.id === groups[k + 1]?.id)
      )
    ])
  )
  const decisiveOf = (g: Group) => {
    const own = members.get(g.id ?? '') ?? []

    return (
      own.find(s => isOpen(steps, steps.indexOf(s))) ??
      own.find(s => s.state === 'blocked') ??
      own.find(s => s.isRunning && i.log.asking.includes(s.id)) ??
      own.at(-1)
    )?.id
  }
  const sizes = new Map([...members].map(([id, own]) => [id, own.length]))
  const open = i.view.kind === 'step' && i.view.in === 'fit' ? i.view.id : undefined
  const fitted = foldGroups(groups, Math.max(3, room - (open === undefined ? 0 : 6)), sizes)
  const end = shown.startedAt === null ? undefined : shown.startedAt + span
  const lines: Line[] = plainLines(
    rulerRows(shown.startedAt === null ? '' : rulerTime(shown.startedAt, span), shown.isLive || end === undefined ? 'now' : rulerTime(end, span), i.width)
  )

  const isNowShown = shown.isLive && i.viewed === undefined && headOf(i, shown).state === 'live'

  for (const g of fitted) {
    const id = decisiveOf(g)
    const isOpenHere = open !== undefined && (members.get(g.id ?? '') ?? []).some(s => s.id === open)
    const rows = timelineRows([{ ...g, isSelected: isOpenHere }], span, i.width, isNowShown)

    lines.push(...rows.map((parts, k) => (k === 0 && id !== undefined ? { parts, id: `step:${id}` } : { parts })))
    if (isOpenHere && open !== undefined)
      lines.push(
        ...plainLines(
          drawerOf(
            g,
            steps.find(s => s.id === open),
            i
          )
        )
      )
  }

  return lines
}

/** The drawer under an opened group (8.4): its decisive step's kind and command, exit, lines and keys. */
function drawerOf(g: Group, step: LogStep | undefined, i: PaneInput): Part[][] {
  const d = step === undefined ? undefined : i.details.find(x => x.id === step.id)

  if (step === undefined) return []

  if (g.glyph === 'waiting')
    return drawerRows(
      { kind: step.kind, command: step.subject, said: [step.kind === 'ask' ? 'Answer in the card on the left.' : 'Answer in the dialog on the left.'] },
      i.width
    )

  // The decisive lines (8.4): what names the failure, at most 3; none for a step that passed.
  const lines =
    d?.isFailed === true
      ? d.excerpt
          .filter(l => /expect|error|fail/i.test(l))
          .slice(0, 3)
          .map(l => ({ glyph: 'failed' as const, name: l.trim(), said: '' }))
      : []

  return drawerRows(
    {
      kind: step.kind,
      // The step's own subject (13.4): cleaned as the timeline shows it, never the raw command.
      command: step.subject,
      exit: d?.isFailed === true ? (d.exit !== undefined ? `exit ${d.exit}` : /^exit \d+$/.test(step.result) ? step.result : 'failed') : 'done',
      lines,
      keys: [
        ['c', 'copy output'],
        ['enter', 'full output']
      ]
    },
    i.width
  )
}

/** A step as the every-step view draws it (8.11). */
function stepRowOf(s: LogStep, d: StepDetail | undefined, isShown: boolean): StepRow {
  const glyph: StepRow['glyph'] = s.isRunning
    ? 'current'
    : s.state === 'blocked'
      ? 'blocked'
      : isFailedMark(s)
        ? 'failed'
        : s.kind === 'agent'
          ? 'agent'
          : isShipMark(s)
            ? 'shipped'
            : 'ok'

  return {
    glyph,
    kind: s.kind,
    subject: s.subject,
    result: s.isRunning ? 'running' : paneResult(s.result),
    tone: s.isRunning ? 'accent' : isFailedMark(s) ? 'err' : 'dim',
    ms: d?.ms ?? undefined,
    isSelected: isShown,
    output:
      isShown && d !== undefined
        ? {
            head: [d.isFailed ? 'failed' : 'exit 0', ...(d.ms === null ? [] : [duration(d.ms)])].join(' · '),
            lines: d.excerpt,
            trimmed: d.lines > d.excerpt.length
          }
        : undefined
  }
}

/** The keys each view offers (9.5, the screens' hint rows). */
function keysOf(i: PaneInput): [string, string][] {
  if (i.viewed !== undefined)
    return [
      ['m', 'back to main'],
      ['tab', 'move'],
      ['enter', 'open step']
    ]
  if (i.view.kind === 'diff')
    return [
      ['b', 'back'],
      ['c', 'copy'],
      ['↑↓', 'scroll'],
      ['n', 'next file']
    ]
  if (i.view.kind === 'all' || (i.view.kind === 'step' && i.view.in === 'all'))
    return [
      ['s', 'fit'],
      ['enter', 'output'],
      ['c', 'copy'],
      ['p n', 'turns']
    ]
  if (i.pinned !== undefined && i.tab === 'timeline')
    return [
      ['l', 'live'],
      ['p', 'previous'],
      ['n', 'next'],
      ['s', 'all']
    ]

  const byTab: Record<Tab, [string, string][]> = {
    timeline: [
      ['tab', 'move'],
      ['enter', 'open'],
      ['1–5', 'tabs']
    ],
    files: [
      ['enter', 'diff'],
      ['c', 'copy path'],
      ['1', 'timeline']
    ],
    sources: [
      ['enter', 'copy url'],
      ['u', i.isUrlsShown ? 'hide urls' : 'show urls'],
      ['c', 'copy'],
      ['1', 'timeline']
    ],
    todo: [
      ['1', 'timeline'],
      ['1–5', 'other tabs']
    ],
    agents: [
      ['enter', 'open conversation'],
      ['tab', 'move'],
      ['1', 'timeline']
    ]
  }

  return byTab[i.tab]
}

/**
 * The pane (8): the tabs, the view of the tab shown (or every step, a diff, an agent's timeline), the
 * hint row with the wordmark last.
 * @param i what the pane reads
 * @returns the rows and the keys
 */
export function assemblePane(i: PaneInput): Pane {
  const shown = shownOf(i)
  const work = i.work
  const done = work.todo.filter(t => t.state === 'completed').length
  const tabs = tabRows(i.viewed !== undefined ? 'agents' : i.tab, {
    files: shown.files.length,
    sources: shown.sources.length,
    todo: work.todo.length === 0 ? undefined : { done, total: work.todo.length },
    agents: i.roster.filter(a => a.parent === null).length
  })
  const keys = i.isFocused ? keysOf(i) : []
  const hint = hintRow(keys, i.version, i.width, i.note)
  const top = plainLines([...tabs, []])
  let body: Line[]

  if (i.view.kind === 'diff') {
    const diff = i.view
    const file = shown.files.find(f => f.path === diff.path)

    // The counts and the hunks come from one diff (8.6); a file with none keeps its steps' tally.
    body = plainLines(
      diffView(
        diff.path,
        diff.patch,
        diff.patch.some(l => l.startsWith('@@')) ? countsOf(diff.patch) : { adds: file?.adds ?? 0, dels: file?.dels ?? 0 },
        shown.turnNo,
        i.width
      )
    )
  } else if (i.viewed !== undefined) {
    const a = i.viewed
    const steps = a.log ?? []
    const head = agentHead(a.name, `${a.state} · ${duration((a.endedAt ?? i.now) - a.startedAt)}`, a.steps, 0, shown.turnNo, i.width)
    const ownLog: PaneInput = {
      ...i,
      pinned: undefined,
      log: { ...i.log, steps, startedAt: a.startedAt, segmentStart: a.startedAt, isTurnRunning: a.state === 'running' },
      viewed: a
    }

    body = [
      ...plainLines([...head, []]),
      ...timeline(ownLog, { ...shownOf(ownLog), steps, startedAt: a.startedAt, isLive: a.state === 'running' }, i.rows - 12)
    ]
  } else if (i.view.kind === 'all' || (i.view.kind === 'step' && i.view.in === 'all')) {
    const open = i.view.kind === 'step' ? i.view.id : undefined
    const rows = shown.steps.map(s =>
      stepRowOf(
        s,
        i.details.find(d => d.id === s.id),
        s.id === open
      )
    )
    const lines = allStepsView(shown.turnNo, shown.steps.length, failureCounts(shown.steps).failed.length, rows, 0, i.width)

    // The head, a blank row, then one row per step (and its output under the open one), each under its id.
    body = [...plainLines(lines.slice(0, 2))]
    let at = 2

    for (const s of rows) {
      const own = s.isSelected === true && s.output !== undefined ? 4 + s.output.lines.length + (s.output.trimmed ? 1 : 0) : 1
      const id = shown.steps[rows.indexOf(s)]?.id

      body.push(...lines.slice(at, at + own).map((parts, k) => (k === 0 && id !== undefined ? { parts, id: `step:${id}` } : { parts })))
      at += own
    }
  } else if (i.tab === 'files') {
    const files = shown.files
    const hunkOf = (path: string) => (i.selectedFile?.path === path && i.selectedFile.hunk.length > 0 ? i.selectedFile.hunk : undefined)
    // A file's counts are its diff's (8.5), the hunks' own; when the diff and the turn's steps disagree, something
    // outside the steps changed the file too, and the baseline line says so.
    const countOf = (f: (typeof files)[number]) => i.diffCounts?.get(f.path) ?? { adds: f.adds, dels: f.dels }
    const isOutside = files.some(f => {
      const c = i.diffCounts?.get(f.path)

      return c !== undefined && (c.adds !== f.adds || c.dels !== f.dels)
    })
    const rows = filesView(
      files.map(f => ({
        path: f.path,
        adds: countOf(f).adds,
        dels: countOf(f).dels,
        isAgent: f.isAgent === true,
        isSelected: i.selectedFile?.path === f.path,
        hunk: hunkOf(f.path)
      })),
      shown.turnNo,
      i.width,
      isOutside
    )
    // Each file's row opens it; the rows of a hunk open in place under it are plain.
    const ids = files.flatMap(f => [`file:${f.path}`, ...Array.from({ length: hunkHeight(hunkOf(f.path)) }, () => undefined)])

    body = [
      ...plainLines(rows.slice(0, 5)),
      ...rows.slice(5, 5 + ids.length).map((parts, k) => {
        const id = ids[k]

        return id === undefined ? { parts } : { parts, id }
      }),
      ...plainLines(rows.slice(5 + ids.length))
    ]
  } else if (i.tab === 'sources') {
    const cited = shown.cited.map(c => c.url)
    const pages = [...shown.sources].toSorted((a, b) => rank(cited, a.url) - rank(cited, b.url))
    const rows = sourcesView(
      pages.map(p => ({
        n: cited.includes(p.url) ? cited.indexOf(p.url) + 1 : undefined,
        // A fetch names an absolute URL; one the parser cannot read is shown as Claude wrote it.
        host: urlHost(p.url) ?? p.url,
        // A page with no title of its own takes the one the answer's link gave it.
        // The fetch's own title (8.7), else Claude's own link text for it, else the page's host and path; never the
        // label the transcript makes up for a bare URL (`bun.sh · test`).
        title: p.title.length > 0 ? p.title : linkTitle(shown.cited.find(c => c.url === p.url)?.title, p.url),
        status: p.status,
        url: p.url
      })),
      i.isUrlsShown,
      i.width
    )
    const per = i.isUrlsShown ? 2 : 1

    body = [
      ...plainLines(rows.slice(0, 5)),
      ...rows.slice(5).map((parts, k) => (k % per === 0 ? { parts, id: `source:${pages[k / per]?.url ?? ''}` } : { parts }))
    ]
  } else if (i.tab === 'todo') {
    body = plainLines(
      todoView(
        work.todo.map(t => ({ text: t.text, state: t.state === 'completed' ? 'done' : t.state === 'in_progress' ? 'current' : 'open' })),
        shown.turnNo,
        i.width
      )
    )
  } else if (i.tab === 'agents') {
    const mains = i.roster.filter(a => a.parent === null)
    const first = mains[0]
    // Together (8.9): one launch step holds them all (one message's calls, which can stream seconds apart), or they
    // started within 2 s of each other.
    const launches = [...i.log.steps, ...(i.log.prev?.steps ?? [])].filter(s => s.kind === 'agent')
    const isOneLaunch = launches.some(s => mains.every(a => (s.calls ?? [s.id]).includes(a.call)))
    const together = first !== undefined && (isOneLaunch || mains.every(a => Math.abs(a.startedAt - first.startedAt) < 2_000))
    const rows = agentsView(
      mains.map(a => {
        const isRunning = a.state === 'running'
        const open = (a.log ?? []).filter((_, k, all) => isOpen(all, k)).length

        return {
          name: a.name,
          isFailed: a.state === 'failed',
          isRunning,
          open,
          steps: a.steps,
          ms: (a.endedAt ?? i.now) - a.startedAt,
          // Nothing under an agent until its first step (8.9).
          step:
            a.kind.length === 0
              ? undefined
              : {
                  glyph: isRunning ? 'current' : a.state === 'failed' ? 'failed' : 'ok',
                  kind: a.kind,
                  subject: a.subject,
                  state: isRunning ? 'running' : a.state === 'failed' ? 'stopped' : 'done',
                  tone: isRunning ? 'accent' : a.state === 'failed' ? 'err' : 'dim'
                }
        }
      }),
      together && first !== undefined ? clockTime(first.startedAt) : '',
      i.width
    )

    // Each agent draws a blank row, its own row (which opens it) and its step row, when it has a step yet (8.9).
    const ids = mains.flatMap(a => [undefined, `agent:${a.id}`, ...(a.kind.length > 0 ? [undefined] : [])])

    body = [
      ...plainLines(rows.slice(0, 4)),
      ...rows.slice(4).map((parts, k) => {
        const id = ids[k]

        return id === undefined ? { parts } : { parts, id }
      })
    ]
  } else {
    const head = isBeforeFirstTurn(shown)
      ? []
      : i.pinned !== undefined
        ? pinnedHead(
            {
              turnNo: i.log.turnNo,
              state: i.log.isTurnRunning ? 'live' : i.log.last?.state === 'failed' ? 'failed' : 'done',
              said: i.log.isTurnRunning ? `running · ${count(i.log.steps.length, 'step')}` : (i.log.last?.story ?? ''),
              time: duration(i.log.isTurnRunning && i.log.segmentStart !== null ? i.now - i.log.segmentStart : (i.log.last?.durationMs ?? 0))
            },
            { turnNo: shown.turnNo, range: headOf(i, shown).range, summary: headOf(i, shown).summary },
            i.width
          )
        : headCard(headOf(i, shown), i.width)
    // The turn before the live one, interrupted (screen 06): one line above the ruler, as long as this turn is shown.
    const cut = i.pinned === undefined && i.viewed === undefined ? i.log.cut : undefined
    const cutRows =
      cut === undefined
        ? []
        : [
            interruptedRow(
              cut.turnNo,
              `after ${count(cut.steps, 'step')}${cut.files > 0 ? ` · ${count(cut.files, 'file')} changed` : ''}`,
              cut.startedAt === null ? '' : clockTime(cut.startedAt),
              i.width
            ),
            []
          ]

    body = [...plainLines([...head, [], ...cutRows]), ...timeline(i, shown, i.rows - 3 - head.length - 4 - cutRows.length)]
  }

  const lines = [...top, ...body]
  const hintLine = { parts: hint }
  // The engine scrolls a view taller than the pane (a diff, every step); the fitted views fill it, the hint row last.
  const filled = framed(
    lines.map(l => l.parts),
    hintLine.parts,
    Math.max(i.rows, lines.length + 1)
  )

  return {
    // No row is wider than the pane: a wider one wraps in the engine, its tail on the next row at column 0.
    lines: filled.map((parts, k): Line => {
      const id = lines[k]?.id
      const row = cutRow(parts, i.width)

      return id === undefined ? { parts: row } : { parts: row, id }
    }),
    keys
  }
}

/**
 * A patch's first hunk (8.5): its `@@` header and the rows up to the next one.
 * @param patch the file's unified rows
 * @returns the hunk, or none when the patch has no header
 */
export function firstHunk(patch: readonly string[]): string[] {
  const from = patch.findIndex(l => l.startsWith('@@'))

  if (from < 0) return []

  const next = patch.findIndex((l, k) => k > from && l.startsWith('@@'))

  return patch.slice(from, next < 0 ? patch.length : next)
}

/** How many rows a hunk open in place takes (8.5): the drawer's edges, its header row and one row per line. */
const hunkHeight = (hunk: readonly string[] | undefined) => (hunk === undefined ? 0 : hunk.length + 2)

/** A cited page's place: cited pages first, in the answer's order (8.7). */
const rank = (cited: readonly string[], url: string) => (cited.includes(url) ? cited.indexOf(url) : cited.length)
