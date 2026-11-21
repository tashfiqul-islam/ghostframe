// Cockpit mock generator: core. Every line is an array of cells {ch, fg, bg}.
// A mock fails the build when any line is not exactly its stated width.

/** one terminal cell: a glyph ('' for the right half of a wide one), a foreground key and a background key */
export type Cell = { readonly ch: string; readonly fg: string; readonly bg: string }
/** one row of cells */
export type Line = Cell[]
/** what m() accepts: markup text, or cells that are already built */
export type Src = string | Line

const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff]
]
const isZero = (cp: number): boolean => (cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x1f3fb && cp <= 0x1f3ff)
const isWide = (cp: number): boolean => WIDE.some(([a, b]) => cp >= a && cp <= b)

/** the code point of the first character; an empty string fails the build */
export function codePoint(ch: string): number {
  const cp = ch.codePointAt(0)
  if (cp === undefined) throw new Error('no code point in an empty string')
  return cp
}

/** xs[i]; an index out of range fails the build */
export function nth<T>(xs: readonly T[], i: number): T {
  const x = xs[i]
  if (x === undefined) throw new Error(`index ${i} out of range: ${xs.length} items`)
  return x
}

/** text -> cells with one fg and bg */
export function cellsOf(text: string, fg = 't', bg = '.'): Line {
  const out: { ch: string; fg: string; bg: string }[] = []
  for (const ch of text) {
    const cp = codePoint(ch)
    if (isZero(cp) && out.length) {
      const prev = out.at(-1)
      // a blank cell is the right half of a wide character: the mark joins the cell before it
      const host = prev?.ch ? prev : out.at(-2)
      if (!host) throw new Error('a zero-width mark with no cell to join: ' + text)
      host.ch += ch
      continue
    }
    out.push({ ch, fg, bg })
    if (isWide(cp)) out.push({ ch: '', fg, bg })
  }
  return out
}

/** markup: {x|text} sets fg x; {xk|text} sets fg x on bg k. Capital fg = bold. */
export function m(src: Src, fg = 't', bg = '.'): Line {
  if (Array.isArray(src)) return src
  const out: Line = []
  let i = 0
  let plain = ''
  const flush = (): void => {
    if (plain) {
      out.push(...cellsOf(plain, fg, bg))
      plain = ''
    }
  }
  while (i < src.length) {
    const mt = /^\{([a-zA-Z])([.szk]?)\|/.exec(src.slice(i, i + 4))
    if (mt) {
      const mfg = mt[1]
      if (mfg === undefined) throw new Error('markup without a colour: ' + src) // the pattern always captures one
      const end = src.indexOf('}', i)
      if (end < 0) throw new Error('unclosed markup: ' + src)
      flush()
      out.push(...cellsOf(src.slice(i + mt[0].length, end), mfg, mt[2] || bg))
      i = end + 1
    } else {
      plain += src.charAt(i)
      i += 1
    }
  }
  flush()
  return out
}

/** light Markdown: `code` -> chip, **bold**, superscript marks -> link colour */
export function md(src: string, fg = 't', bg = '.'): Line {
  const bold = fg.toUpperCase()
  const s = src
    .replace(/`([^`]+)`/g, (_: string, c: string) => `{bk|${c}}`)
    .replace(/\*\*([^*]+)\*\*/g, (_: string, c: string) => `{${bold}|${c}}`)
    .replace(/([¹²³⁴⁵⁶⁷⁸⁹⁰]+)/g, (_: string, c: string) => `{l|${c}}`)
  return m(s, fg, bg)
}

export const sp = (n: number, bg = '.'): Line => cellsOf(' '.repeat(Math.max(0, n)), 't', bg)
export const cat = (...parts: readonly Src[]): Line => parts.flatMap(p => m(p))
export const len = (cells: Src): number => m(cells).length

/** cut to w cells with an ellipsis, or pad with blanks */
export function fit(src: Src, w: number, bg = '.'): Line {
  const cells = m(src)
  if (cells.length === w) return cells
  if (cells.length < w) return [...cells, ...sp(w - cells.length, bg)]
  if (w <= 0) return []
  let cut = cells.slice(0, w - 1)
  while (cut.at(-1)?.ch === ' ') cut = cut.slice(0, -1)
  const end = cut.at(-1)
  if (end && end.ch !== '' && cells[cut.length]?.ch === '') cut = cut.slice(0, -1)
  const last = cut.at(-1) ?? { fg: 't', bg }
  const res = [...cut, { ch: '…', fg: last.fg, bg: last.bg }]
  return [...res, ...sp(w - res.length, bg)]
}

/** middle cut for paths: keep the head segment and the file name */
export function midcut(text: string, w: number): string {
  if (Array.from(text).length <= w) return text
  const tail = text.slice(text.lastIndexOf('/') + 1)
  const head = w - tail.length - 2
  if (head < 2)
    return (
      '…' +
      Array.from(text)
        .slice(-(w - 1))
        .join('')
    )
  return text.slice(0, head) + '…/' + tail
}

/** left part cut to make room, right part ends on the last cell */
export function lr(left: Src, right: Src, w: number, bg = '.'): Line {
  const r = m(right)
  if (!r.length) return fit(left, w, bg)
  const l = fit(left, w - r.length - 1, bg)
  return [...l, ...sp(1, bg), ...r]
}

export function setBg(cells: Line, bg: string, from: number = 0, to: number = cells.length): Line {
  return cells.map((c, i) => (i >= from && i < to && c.bg === '.' ? { ...c, bg } : c))
}

/** the options of a rule; every field has a default */
export type RuleOpts = { ch?: string; label?: string; meta?: string; labelFg?: string; metaFg?: string; ruleFg?: string; state?: string }

/** a rule with an optional [ LABEL ] and right-hand meta; solid for turns, dotted for frames */
export function rule(w: number, { ch = '┄', label = '', meta = '', labelFg = 'm', metaFg = 'm', ruleFg = 'h', state = '' }: RuleOpts = {}): Line {
  let left = cat(`{${ruleFg}|${ch}}`)
  if (label) left = cat(left, ' {d|[} ', m(label, labelFg), ' {d|]} ')
  else if (state) left = cat(left, ' ', m(state), ' ')
  // a meta that does not fit loses its last field, then the next: the first field is the one that matters
  let parts = typeof meta === 'string' && meta ? meta.split(' · ') : []
  let right = meta ? cat(' ', m(meta, metaFg)) : []
  while (parts.length > 1 && w - left.length - right.length < 1) {
    parts = parts.slice(0, -1)
    right = cat(' ', m(parts.join(' · '), metaFg))
  }
  const fill = w - left.length - right.length
  if (fill < 1) return fit(cat(left, right), w)
  return [...left, ...cellsOf(ch.repeat(fill), ruleFg), ...right]
}

/** word wrap on blanks; never splits a chip or a word */
export function wrap(src: Src, w: number): Line[] {
  const cells = m(src)
  const words: Line[] = []
  let cur: Line = []
  for (const c of cells) {
    if (c.ch === ' ' && c.bg === '.') {
      words.push(cur)
      cur = []
    } else cur.push(c)
  }
  words.push(cur)
  const lines: Line[] = []
  let line: Line = []
  for (const word of words) {
    if (line.length && line.length + 1 + word.length > w) {
      lines.push(line)
      line = []
    }
    if (line.length) line.push(...sp(1))
    line.push(...word)
  }
  lines.push(line)
  return lines
}

// ---------------------------------------------------------------- time
export function dur(sec: number): string {
  if (sec < 1) return `${sec.toFixed(1)}s`
  if (sec < 60) return `${Math.floor(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${String(Math.floor(sec % 60)).padStart(2, '0')}s`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(sec / 86400)}d ${String(Math.floor((sec % 86400) / 3600)).padStart(2, '0')}h`
}
export const count = (n: number): string =>
  n < 1000 ? String(n) : n < 1e6 ? `${(n / 1000).toFixed(n < 1e4 ? 1 : n < 1e5 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`

// ---------------------------------------------------------------- transcript kit
/** a cited source in an answer: [mark, host, title, url] */
export type SourceRef = readonly [mark: string, host: string, title: string, url: string]

/** the transcript builders of one frame width F */
export type Transcript = {
  readonly F: number
  readonly prose: number
  blank: () => Line
  raw: (src: Src, fg?: string) => Line
  turn: (n: number, clock: string, extra?: string) => Line
  prompt: (text: string, o?: { chips?: boolean }) => Line[]
  you: (text: string, right?: string) => Line
  p: (text: string, o?: { lead?: boolean; fg?: string; inset?: number; w?: number }) => Line[]
  h: (text: string, level?: number) => Line[]
  list: (items: readonly string[], o?: { ordered?: boolean; inset?: number }) => Line[]
  quote: (text: string) => Line[]
  frameTop: (label: string, meta?: string, o?: RuleOpts) => Line
  frameEnd: () => Line
  frame: (label: string, meta: string, lines: readonly Src[], o?: RuleOpts) => Line[]
  code: (lang: string, meta: string, lines: readonly string[], o?: { diff?: boolean }) => Line[]
  table: (
    head: readonly string[],
    rows: readonly (readonly string[])[],
    o?: { align?: readonly string[]; zebra?: boolean; cap?: number; fgs?: readonly string[] }
  ) => Line[]
  exc: (glyph: string, fg: string, state: string, text: string, clock?: string, details?: readonly string[]) => Line[]
  notice: (text: string, clock?: string) => Line
  capsule: (text: string, time: string) => Line
  receipt: (state: string, fields: string, time: string, o?: { fg?: string }) => Line
  beat: (text: string, time?: string) => Line[]
  xstep: (kind: string, subj: string, res: string, time: string, resFg?: string) => Line
  xthought: (text: string, time: string) => Line
  sources: (label: string, items: readonly SourceRef[]) => Line[]
}

/** builders for the left half; every line is F cells wide */
export function transcript(F: number): Transcript {
  const prose = Math.min(F - 2, 88)
  const T: Transcript = {
    F,
    prose,
    blank: () => sp(F),
    raw: (src, fg = 't') => fit(m(src, fg), F),
    turn: (n, clock, extra = '') => rule(F, { ch: '─', label: `TURN ${n}${extra ? ' · ' + extra : ''}`, labelFg: 'b', meta: clock, metaFg: 'm' }),
    prompt: (text, { chips = true } = {}) => {
      const body = chips ? text.replace(/(@[\w./-]+)/g, '{bk|$1}') : text
      return wrap(m(body, 'b'), F - 2).map(l => setBg(fit(cat('{a|▍} ', l), F), 's'))
    },
    you: (text, right = '') => lr(cat('{a|▍} ', m(text, 'm')), right ? m(right, 'd') : '', F),
    /** paragraphs; the first sentence of a lead paragraph is bright */
    p: (text, { lead = false, fg = 't', inset = 2, w = prose } = {}) => {
      let src = md(text, fg)
      if (lead) {
        let end = src.findIndex((c, i) => (c.ch === '.' || c.ch === ':') && (i + 1 === src.length || src[i + 1]?.ch === ' '))
        if (end < 0) end = src.length - 1
        src = src.map((c, i) => (i <= end && c.fg === fg ? { ...c, fg: 'b' } : c))
      }
      return wrap(src, w - (inset - 2)).map(l => fit(cat(sp(inset), l), F))
    },
    h: (text, level = 2) => [fit(cat(sp(2), m(text, level <= 2 ? 'B' : 'T')), F)],
    list: (items, { ordered = false, inset = 2 } = {}) =>
      items.flatMap((it, i) => {
        const mark = ordered ? `${i + 1}.` : '-'
        const lines = wrap(md(it), prose - (inset - 2) - mark.length - 1)
        return lines.map((l, j) => fit(cat(sp(inset), j === 0 ? mark : ' '.repeat(mark.length), ' ', l), F))
      }),
    quote: text => wrap(md(text, 'm'), prose - 2).map(l => fit(cat(sp(2), '{m|▏} ', l), F)),
    frameTop: (label, meta = '', o = {}) => rule(F, { label, meta, ...o }),
    frameEnd: () => rule(F),
    frame: (label, meta, lines, o = {}) => [T.frameTop(label, meta, o), ...lines.map(l => fit(cat(sp(2), m(l)), F)), T.frameEnd()],
    code: (lang, meta, lines, { diff = false } = {}) => [
      T.frameTop(lang, meta),
      ...lines.map(l => {
        const fg = diff
          ? l.startsWith('+')
            ? 'g'
            : l.startsWith('-')
              ? 'r'
              : 't'
          : l.trimStart().startsWith('//') || l.trimStart().startsWith('#')
            ? 'm'
            : 't'
        return setBg(fit(cat(sp(2), cellsOf(l, fg)), F), 's', 2)
      }),
      T.frameEnd()
    ],
    table: (head, rows, { align = [], zebra = true, cap = 40, fgs = [] } = {}) => {
      const cols = head.map((h, i) => Math.min(cap, Math.max(len(m(h)), ...rows.map(r => len(md(r[i] ?? ''))))))
      const cell = (v: string | undefined, i: number, fg: string): Line => {
        const c = fit(md(v ?? '', fg), nth(cols, i))
        if (align[i] !== 'r') return c
        const used = md(v ?? '', fg).length
        return used >= nth(cols, i) ? c : [...sp(nth(cols, i) - used), ...md(v ?? '', fg)]
      }
      const line = (r: readonly string[], fg: string, bg?: string): Line => {
        const body = r.flatMap((v, i) => {
          const own = fgs[i]
          return [...cell(v, i, own && fg !== 'm' ? own : fg), ...sp(i < r.length - 1 ? 3 : 0)]
        })
        const l = fit(cat(sp(2), body), F)
        return bg ? setBg(l, bg, 2, F) : l
      }
      return [line(head, 'm'), fit(cat(sp(2), cellsOf('─'.repeat(F - 2), 'H')), F), ...rows.map((r, i) => line(r, 't', zebra && i % 2 === 1 ? 'z' : ''))]
    },
    /** exception or event row, drawn once */
    exc: (glyph, fg, state, text, clock = '', details = []) => [
      lr(cat(`{${fg}|${glyph}} `, state ? `{${fg.toUpperCase()}|${state}} {m|·} ` : '', m(text)), clock ? m(clock, 'd') : '', F),
      ...details.map(d => fit(cat(sp(4), m(d, 'm')), F))
    ],
    notice: (text, clock = '') => lr(cat('{m|●} ', m(text, 'm')), clock ? m(clock, 'd') : '', F),
    /** fallback capsule: all the work of a segment in one row */
    capsule: (text, time) => {
      // narrow frames drop kinds from the right (folding them into +n); the exception story is never cut
      const KIND = /^(\d+) [a-z]+( \+(\d+))?$/
      const fields = text.split(' · ')
      const kindAt = (i: number): RegExpExecArray => {
        const f = fields[i]
        const mt = f === undefined ? null : KIND.exec(f)
        if (!mt) throw new Error(`capsule: field ${i} is not a kind: ${text}`)
        return mt
      }
      const clock = F >= 59 ? time : ''
      const room = F - 2 - (clock ? clock.length + 1 : 0)
      const maxKinds = F >= 72 ? 3 : 2
      for (;;) {
        const idx = fields.map((f, i) => (KIND.test(f) && !/ steps?$| agents$/.test(f.replace(/ \+\d+$/, '')) ? i : -1)).filter(i => i > 0)
        if (len(m(fields.join(' · '))) <= room && idx.length <= maxKinds) break
        const last = idx.at(-1)
        if (last === undefined) break
        const mt = kindAt(last)
        const gone = Number(mt[1]) + Number(mt[3] ?? 0)
        if (idx.length === 1) fields.splice(last, 1)
        else {
          fields.splice(last, 1)
          const p = nth(idx, idx.length - 2)
          const pm = kindAt(p)
          fields[p] = pm.input.replace(/ \+\d+$/, '') + ' +' + (gone + Number(pm[3] ?? 0))
        }
      }
      return lr(cat('{H|│} ', m(fields.join(' · '), 'm')), clock ? m(clock, 'd') : '', F)
    },
    /** receipt: the closing rule of a turn */
    receipt: (state, fields, time, { fg = 'm' } = {}) => {
      const st = m(state, fg)
      const right = cat(fields ? m(fields + ' · ', 'm') : '', m(time, 't'))
      const left = cat('{h|─} ', st, ' ')
      const fill = F - left.length - right.length - 1
      return fill < 1 ? lr(left, right, F) : [...left, ...cellsOf('─'.repeat(fill), 'h'), ...sp(1), ...right]
    },
    /** unfolded view (ctrl+o): a sentence Claude said, and the steps under it */
    beat: (text, time = '') => {
      const ls = wrap(m(text, 'm'), F - 11)
      return ls.map((l, i) => lr(cat('{H|│} ', l), i === 0 && time ? m(time, 'd') : '', F))
    },
    xstep: (kind, subj, res, time, resFg = 'm') =>
      lr(cat('{H|│}   ', cellsOf(kind.padEnd(8), 'm'), ' ', m(subj)), cat(m(res, resFg), sp(3), cellsOf(time.padStart(6), 'd')), F),
    xthought: (text, time) => lr(cat('{H|│}   {d|∴ thought} ', m(text, 'm')), m(time, 'd'), F),
    sources: (label, items) => [
      T.frameTop(label, String(items.length)),
      ...items.flatMap(([mark, host, title, url]) => [fit(cat(sp(2), `{l|${mark}} {c|${host}}  `, m(title)), F), fit(cat(sp(4), cellsOf(url, 'l')), F)]),
      T.frameEnd()
    ]
  }
  return T
}

// ---------------------------------------------------------------- pane kit
/** the glyph a step row starts with */
export type Mark = 'you' | 'fail' | 'pass' | 'block' | 'need' | 'commit' | 'out' | 'run' | 'think' | 'say'
const MARK = {
  you: ['▍', 'a'],
  fail: ['✕', 'r'],
  pass: ['✓', 'g'],
  block: ['⊘', 'w'],
  need: ['!', 'w'],
  commit: ['±', 't'],
  out: ['↗', 't'],
  run: ['▸', 'b'],
  think: ['∴', 'd'],
  say: ['│', 'H']
} as const satisfies Record<Mark, readonly [string, string]>

/** one row of STEPS: a tool step, or a sentence Claude said (say) */
export type Step = { time?: string; kind?: string; subj?: string; res?: string; mark?: Mark | ''; resFg?: string; say?: string; open?: boolean }
type AgentBase = { name: string; steps: number; time: string; nested?: boolean }
/** one row of AGENTS: running (no state) carries what it is doing; done and failed carry their result */
export type Agent =
  | (AgentBase & { state?: undefined; kind: string; subj: string })
  | (AgentBase & { state: 'done'; subj: string })
  | (AgentBase & { state: 'failed'; subj: string })
/** one to-do: [state, text]; 'x' done, '>' current, ' ' open */
export type Todo = readonly [state: 'x' | '>' | ' ', text: string]
/** one changed file: [path, tag, lines added, lines removed] */
export type FileRow = readonly [path: string, tag: string, add: number, del: number]
/** one source read: [mark, host, title, HTTP status, url] */
export type SourceRow = readonly [mark: string, host: string, title: string, status?: string, url?: string]
/** the NOW section: what runs, or what needs the user */
export type Now = { needs?: string; say?: string; kind?: string; subj?: string; el?: string }
/** the LAST section: how the last turn ended */
export type Last = { state: string; fg?: string; story?: string; time: string; next?: string | undefined }

/** the pane builders of one body width P */
export type PaneKit = {
  readonly P: number
  sec: (label: string, meta?: string, o?: RuleOpts) => Line
  blank: () => Line
  text: (src: Src, fg?: string) => Line
  step: (s: Step) => Line
  agent: (a: Agent) => Line
  todo: (t: Todo) => Line
  file: (f: FileRow) => Line
  source: (s: SourceRow) => Line
  now: (n: Now) => Line[]
  last: (l: Last) => Line[]
}

/** builders for the pane; every line is P cells wide */
export function paneKit(P: number): PaneKit {
  const wide = P >= 56
  const K: PaneKit = {
    P,
    sec: (label, meta = '', o = {}) => rule(P, { label, meta, ...o }),
    blank: () => sp(P),
    text: (src, fg = 'm') => fit(cat(sp(2), m(src, fg)), P),
    step: s => {
      if (s.say) return fit(cat('{H|│} ', m(s.say, 'm')), P)
      const [g, gf] = s.mark ? MARK[s.mark] : [' ', 't']
      const resFg =
        s.resFg ??
        (s.mark === 'fail'
          ? 'R'
          : s.mark === 'pass'
            ? 'g'
            : s.mark === 'block' || s.mark === 'need'
              ? 'W'
              : s.mark === 'commit' || s.mark === 'out'
                ? 't'
                : 'm')
      const showRes = s.res && (wide || s.mark)
      const res = showRes && s.res ? fit(m(s.res, resFg), Math.min(len(m(s.res)), P >= 72 ? 16 : P >= 56 ? 14 : 12)) : []
      const time = cellsOf((s.time ?? '').padStart(7), s.mark === 'run' ? 'm' : 'd')
      const right = res.length ? cat(res, sp(2), time) : time
      const left = cat(`{${gf}|${g}} `, cellsOf((s.kind ?? '').padEnd(8), 'm'), ' ', m(s.subj ?? '', s.mark === 'run' ? 'b' : 't'))
      return lr(left, right, P)
    },
    agent: a => {
      const nameW = P >= 72 ? 22 : P >= 56 ? 18 : 16
      const done = a.state === 'done'
      const failed = a.state === 'failed'
      const glyph = failed ? '{r|✕}' : `{${done ? 'd' : 'v'}|◇}`
      const name = fit(cellsOf(a.name, done ? 'm' : failed ? 't' : 'v'), nameW - (a.nested ? 2 : 0))
      const mid =
        a.state === 'failed'
          ? cat('{R|failed} ', wide ? m(a.subj, 'm') : '')
          : a.state === 'done'
            ? cat('{d|done}   ', wide ? m(a.subj, 'd') : '')
            : cat(cellsOf(a.kind.padEnd(7), 'm'), wide ? cat(' ', m(a.subj, 't')) : '')
      const right = cellsOf(`${String(a.steps).padStart(3)} · ${a.time.padStart(7)}`, 'd')
      return lr(cat(a.nested ? '  ' : '', glyph, ' ', name, ' ', mid), right, P)
    },
    todo: t => {
      const [st, text] = t
      if (st === '>') return fit(cat('{a|▸} {b|[>]} ', m(text, 'b')), P)
      return fit(cat(sp(2), st === 'x' ? '{m|[x]} ' : '{t|[ ]} ', m(text, st === 'x' ? 'm' : 't')), P)
    },
    file: f => {
      const [path, tag, add, del] = f
      const right = cat(
        m(tag.padStart(7), 'm'),
        ' ',
        m((add ? '+' + String(add) : '').padStart(5), 'g'),
        ' ',
        m((del ? '−' + String(del) : '').padStart(5), 'r')
      )
      return lr(cat(sp(2), cellsOf(midcut(path, P - 2 - right.length - 1), 't')), right, P)
    },
    source: s => {
      const [mark, host, title, httpStatus = '200'] = s
      const right = m(httpStatus, httpStatus.startsWith('2') ? 'd' : 'R')
      return lr(cat(sp(2), mark === '·' ? '{d|·}' : `{l|${mark}}`, ' ', `{c|${host}}`, wide ? cat('  ', m(title, 't')) : ''), right, P)
    },
    now: n => {
      if (n.needs)
        return [
          fit(cat('{w|!} {W|needs you} {m|·} ', m(n.needs)), P),
          lr(cat(sp(2), cellsOf((n.kind ?? '').padEnd(8), 'm'), ' ', m(n.subj ?? '', 'b')), m((n.el ?? '').padStart(7), 'w'), P)
        ]
      return [
        fit(cat('{b|▸} ', m(n.say ?? '', 't')), P),
        lr(cat(sp(2), cellsOf((n.kind ?? '').padEnd(8), 'm'), ' ', m(n.subj ?? '', 'b')), m((n.el ?? '').padStart(7), 'm'), P)
      ]
    },
    last: l => [
      lr(cat(sp(2), m(l.state, l.fg ?? 'm'), l.story ? cat(' {m|·} ', m(l.story, 't')) : ''), m(l.time.padStart(7), 't'), P),
      ...(l.next ? [fit(cat(sp(2), m(l.next, 'm')), P)] : [])
    ]
  }
  return K
}

const kinds = (steps: readonly Step[], top: number): string => {
  const by = new Map<string, number>()
  for (const s of steps) if (s.kind) by.set(s.kind, (by.get(s.kind) ?? 0) + 1)
  const sorted = [...by.entries()].toSorted((a, b) => b[1] - a[1])
  const shown = sorted.slice(0, top).map(([k, n]) => `${n} ${k}`)
  const rest = sorted.slice(top).reduce((n, [, c]) => n + c, 0)
  return shown.join(' · ') + (rest ? ` +${rest}` : '')
}
export const byKind: (steps: readonly Step[], top: number) => string = kinds

/** the LAST head of an idle pane */
export type Idle = Last & { meta: string }
/** the NOW head of a running pane */
export type NowHead = Now & { meta: string }
/** everything a pane shows: a LAST or a NOW head, then the sections */
export type PaneModel = {
  pin?: number
  steps?: readonly Step[]
  agents?: readonly Agent[]
  todos?: readonly Todo[]
  files?: readonly FileRow[]
  sources?: readonly SourceRow[]
  stepsMeta?: string
  stepsTurn?: number
  empty?: string
} & ({ idle: Idle; now?: never } | { now: NowHead; idle?: never })

/** how far each lower section of the pane has collapsed */
type Levels = {
  gap: number
  sources: 'full' | 'label' | 'none'
  files: 'full' | 'label' | 'none'
  todo: 'full' | 'one' | 'label' | 'none'
  agents: 'full' | 'running' | 'label' | 'none'
}
/** one rung of the collapse ladder: a section and its next level */
type Rung = { [K in keyof Levels]: readonly [K, Levels[K]] }[keyof Levels]

/**
 * The fitted layout of spec E.37: the head is fixed, the lower sections are allocated first,
 * STEPS takes the rest as a window. Returns exactly R lines of P cells.
 */
export function fitPane(P: number, R: number, M: PaneModel): Line[] {
  const K = paneKit(P)
  const pinTag = M.pin ? ` · TURN ${M.pin}` : ''
  const head = M.idle ? [K.sec('LAST', M.idle.meta), ...K.last(M.idle)] : [K.sec('NOW', M.now.meta, M.now.needs ? { labelFg: 'W' } : {}), ...K.now(M.now)]
  const steps = M.steps ?? []
  const tall = R >= 40
  const cap = { todo: tall ? 5 : 3, files: tall ? 6 : 4, sources: tall ? 4 : 3 }
  const lv: Levels = { gap: R >= 24 ? 1 : 0, sources: 'full', files: 'full', todo: 'full', agents: 'full' }
  const order: readonly Rung[] = [
    ['gap', 0],
    ['sources', 'label'],
    ['files', 'label'],
    ['todo', 'one'],
    ['agents', 'running'],
    ['agents', 'label'],
    ['todo', 'label'],
    ['sources', 'none'],
    ['files', 'none'],
    ['todo', 'none'],
    ['agents', 'none']
  ]
  const setLevel = <L extends keyof Levels>(k: L, v: Levels[L]): void => {
    lv[k] = v
  }
  const build = (): Line[][] => {
    const out: Line[][] = []
    const ag = M.agents ?? []
    if (ag.length && lv.agents !== 'none') {
      const running = ag.filter(a => a.state !== 'done' && a.state !== 'failed' && !a.nested).length
      const nested = ag.filter(a => a.nested).length
      const done = ag.filter(a => a.state === 'done').length
      const failed = ag.filter(a => a.state === 'failed').length
      const meta = [failed && `{r|${failed} failed}`, running && `${running} running`, done && `${done} done`, nested && `${nested} nested`]
        .filter(Boolean)
        .join(' · ')
      const rows = lv.agents === 'label' ? [] : lv.agents === 'running' ? ag.filter(a => a.state !== 'done') : ag
      // the cap counts top-level agents; a nested agent rides with its parent
      const tops = rows.filter(a => !a.nested)
      const lastTop = tops[Math.min(tops.length, 7) - 1]
      let end = lastTop === undefined ? 0 : rows.indexOf(lastTop) + 1
      while (rows[end]?.nested) end += 1
      const shown = rows.slice(0, end).map(K.agent)
      if (tops.length > 7) shown.push(K.text(`… ${tops.length - 7} more`, 'd'))
      out.push([K.sec('AGENTS', meta), ...shown])
    }
    const td = M.todos ?? []
    if (td.length && lv.todo !== 'none') {
      const doneN = td.filter(t => t[0] === 'x').length
      const cur = Math.max(
        0,
        td.findIndex(t => t[0] === '>')
      )
      let rows = lv.todo === 'label' ? [] : lv.todo === 'one' ? [nth(td, cur)] : td
      const allDone = doneN === td.length
      if (rows.length > cap.todo) {
        const from = Math.min(Math.max(0, cur - 1), td.length - cap.todo)
        rows = td.slice(from, from + cap.todo)
      }
      out.push([
        K.sec('TODO', `${doneN} of ${td.length}`),
        ...(allDone ? (lv.todo === 'label' ? [] : [K.text(`all ${td.length} done`, 'm')]) : rows.map(K.todo))
      ])
    }
    const fl = M.files ?? []
    if (fl.length && lv.files !== 'none') {
      const add = fl.reduce((n, f) => n + f[2], 0)
      const del = fl.reduce((n, f) => n + f[3], 0)
      const keep = fl.length > cap.files ? cap.files - 1 : cap.files
      const rows = lv.files === 'label' ? [] : fl.slice(0, keep).map(K.file)
      if (lv.files !== 'label' && fl.length > cap.files) {
        const rest = fl.slice(keep)
        rows.push(K.text(`… ${rest.length} more files · +${rest.reduce((n, f) => n + f[2], 0)} −${rest.reduce((n, f) => n + f[3], 0)}`, 'd'))
      }
      out.push([K.sec('FILES' + pinTag, `${fl.length} changed · {g|+${add}}${del ? ` {r|−${del}}` : ''}`), ...rows])
    }
    const so = M.sources ?? []
    if (so.length && lv.sources !== 'none') {
      const cited = so.filter(s => s[0] !== '·').length
      const keepS = so.length > cap.sources ? cap.sources - 1 : cap.sources
      const rows = lv.sources === 'label' ? [] : so.slice(0, keepS).map(K.source)
      if (lv.sources !== 'label' && so.length > cap.sources) rows.push(K.text(`… ${so.length - keepS} more`, 'd'))
      out.push([K.sec('SOURCES' + pinTag, `${so.length} read · ${cited} cited`), ...rows])
    }
    return out
  }
  let lower = build()
  const fixed = (): number => head.length + lower.reduce((n, s) => n + s.length + lv.gap, 0) + lv.gap + 1
  const need = Math.min(R >= 24 ? 6 : 3, Math.max(1, steps.length + (steps.length > 6 ? 1 : 0)))
  for (const [k, v] of order) {
    if (R - fixed() >= need) break
    setLevel(k, v)
    lower = build()
  }
  const room = Math.max(0, R - fixed())
  let rows: Line[]
  if (!steps.length) rows = room > 0 ? [K.text(M.empty ?? 'no steps yet', 'd')] : []
  else if (steps.length <= room) rows = steps.map(K.step)
  else if (room <= 0) rows = []
  else {
    const pinnedMax = room >= 8 ? 3 : room >= 5 ? 1 : 0
    let tailN = room - 1
    let hidden = steps.slice(0, steps.length - tailN)
    const pinned = hidden.filter(s => s.open).slice(-pinnedMax)
    tailN -= pinned.length
    hidden = steps.slice(0, steps.length - tailN)
    const quiet = hidden.filter(s => !pinned.includes(s) && !s.say)
    rows = [
      K.text(`… ${quiet.length} earlier · ${kinds(quiet, P >= 56 ? 3 : 2)}`, 'd'),
      ...pinned.map(K.step),
      ...steps.slice(steps.length - tailN).map(K.step)
    ]
  }
  const failN = steps.filter(s => s.mark === 'fail').length
  const n = steps.filter(s => !s.say).length
  const stepMeta = M.stepsMeta ?? `${n} step${n === 1 ? '' : 's'}${failN ? ` · {r|${failN} failed}` : ''}`
  const stepSec = [
    K.sec('STEPS' + (M.pin ? `${pinTag} · PINNED` : M.stepsTurn ? ` · TURN ${M.stepsTurn}` : ''), stepMeta, M.pin ? { labelFg: 'b' } : {}),
    ...rows
  ]
  while (stepSec.length < room + 1) stepSec.push(K.blank())
  const out = [...head]
  for (const s of [stepSec, ...lower]) {
    for (let i = 0; i < lv.gap; i += 1) out.push(K.blank())
    out.push(...s)
  }
  while (out.length < R) out.push(K.blank())
  if (out.length > R) throw new Error(`pane overflow: ${out.length} > ${R} at P=${P}`)
  return out
}

// ---------------------------------------------------------------- chrome
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
export const spin = (i = 2): string => SPIN.charAt(i % 10)
const meter = (pct: number, n: number): string => {
  const f = pct > 0 ? Math.max(1, Math.round((pct / 100) * n)) : 0
  return '▰'.repeat(f) + '▱'.repeat(n - f)
}
const mfg = (pct: number): string => (pct >= 95 ? 'r' : pct >= 80 ? 'w' : 't')
// stand-ins for the status line script's own Nerd Font icons (private use area, 1 cell each)
export const ICON = { model: '', repo: '', branch: '', diff: '', ctx: '', five: '', week: '' }
const I = (k: keyof typeof ICON): string => `{d|${ICON[k]}} `

/** what the status line shows; every field has a default */
export type StatusState = {
  model: string
  effort: string
  mode: string
  modeFg: string
  repo: string
  branch: string
  dirty: number
  add: string
  del: string
  ctx: number
  five: number
  fiveLeft: string
  week: number
  weekDay: string
}

export function status(C: number, o: Partial<StatusState> = {}): Line[] {
  const s: StatusState = {
    model: 'Opus 5.5',
    effort: 'medium',
    mode: 'auto',
    modeFg: 'W',
    repo: 'ghostframe',
    branch: 'fix/ci-bun-pin',
    dirty: 3,
    add: '25',
    del: '2',
    ctx: 19,
    five: 2,
    fiveLeft: '4h 40m left',
    week: 35,
    weekDay: 'Mon',
    ...o
  }
  const eff = C >= 120 || s.mode.length <= 6 ? `{m|· ${s.effort} ·}` : '{m|·}'
  let a: Line
  let b: Line
  if (C >= 120) {
    const g = [34, 60] as const
    a = cat(
      sp(2),
      fit(cat(I('model'), `{b|${s.model}} ${eff} {${s.modeFg}|${s.mode}}`), g[0]),
      fit(cat(I('repo'), `{t|${s.repo}} {m|·} `, I('branch'), `{t|${s.branch}} {m|· ${s.dirty} uncommitted}`), g[1]),
      I('diff'),
      `{g|+${s.add}} {r|−${s.del}} {m|lines}`
    )
    b = cat(
      sp(2),
      fit(cat(I('ctx'), `{m|context} {${mfg(s.ctx)}|${meter(s.ctx, 10)}} {t|${s.ctx}%}`), g[0]),
      fit(cat(I('five'), `{m|5 hours} {${mfg(s.five)}|${meter(s.five, 10)}} {t|${s.five}%} {m|· ${s.fiveLeft}}`), g[1]),
      I('week'),
      `{m|week} {${mfg(s.week)}|${meter(s.week, 10)}} {t|${s.week}%} {m|· ${s.weekDay}}`
    )
  } else if (C >= 80) {
    const g = [30, 42] as const
    a = cat(
      sp(2),
      fit(cat(I('model'), `{b|${s.model}} ${eff} {${s.modeFg}|${s.mode}}`), g[0]),
      fit(cat(I('repo'), `{t|${s.repo}} {m|·} `, I('branch'), `{t|${s.branch}}`), g[1]),
      I('diff'),
      `{g|+${s.add}} {r|−${s.del}}`
    )
    b = cat(
      sp(2),
      fit(cat(I('ctx'), `{m|context} {${mfg(s.ctx)}|${meter(s.ctx, 8)}} {t|${s.ctx}%}`), g[0]),
      fit(cat(I('five'), `{m|5h} {${mfg(s.five)}|${meter(s.five, 8)}} {t|${s.five}%} {m|· ${s.fiveLeft.replace(' left', '')}}`), g[1]),
      I('week'),
      `{m|week} {t|${s.week}%}`
    )
  } else {
    a = cat(sp(2), fit(cat(I('model'), `{b|${s.model}} {m|·} {${s.modeFg}|${s.mode}}`), 22), I('repo'), `{t|${s.repo}} {m|·} `, I('branch'), `{t|${s.branch}}`)
    b = cat(sp(2), I('ctx'), `{m|context} {t|${s.ctx}%}  {m|·}  `, I('five'), `{m|5h} {t|${s.five}%}  {m|·}  `, I('week'), `{m|week} {t|${s.week}%}`)
  }
  return [fit(a, C), fit(b, C)]
}

export const HINT = {
  auto: '{W|auto} {m|· a classifier decides · shift+tab to change · esc to stop}',
  autoIdle: '{W|auto} {m|· a classifier decides · shift+tab to change}',
  default: '{m|default · shift+tab to change · ? for shortcuts}',
  plan: '{b|plan} {m|· reads only · shift+tab to change}',
  accept: '{t|accept edits} {m|· shift+tab to change · esc to stop}',
  pane: '{b|pane} {m|· arrows scroll · tab moves · enter opens · esc returns to the prompt}'
}

/** the bottom of a screen: the prompt box (or a dialog in its place), the hint and the status line */
export type ChromeOpts = { input?: string; hint?: string; st?: Partial<StatusState>; noStatus?: boolean; dialog?: readonly Src[] | null }

/** prompt box, hint line and the 2-row status line; full terminal width */
export function chrome(C: number, { input = '', hint = HINT.auto, st = {}, noStatus = false, dialog: dlg = null }: ChromeOpts = {}): Line[] {
  if (dlg) return [...dlg.map(l => fit(l, C)), ...(noStatus ? [] : status(C, st))]
  const box = [cellsOf('─'.repeat(C), 'h'), fit(cat('{m|>} ', m(input, 'b'), '{a|█}'), C), cellsOf('─'.repeat(C), 'h')]
  return [...box, fit(cat(sp(2), m(hint)), C), ...(noStatus ? [] : status(C, st))]
}

/** a docked pane: P body cells, drawn from a model M or given as ready lines */
export type Pane = { P: number; M?: PaneModel | undefined; lines?: Line[] | undefined; focus?: boolean; title?: string }
/** a full screen of C × R cells */
export type ScreenOpts = {
  C: number
  R: number
  F: number
  left: readonly Src[]
  pane?: Pane | null
  live?: readonly Src[]
  bottom?: ChromeOpts
  top?: boolean
  close?: boolean
}

/**
 * A full screen. left: transcript lines (F wide). pane: {P, M} docks a pane of P body cells
 * behind a 2-cell engine chrome. live: rows of the live area (drawn under the transcript).
 */
export function screen({ C, R, left, pane = null, live = [], bottom = {}, top = false, close = true }: ScreenOpts): Line[] {
  const ch = chrome(C, bottom)
  const bodyR = R - ch.length
  const leftW = pane ? C - pane.P - 2 : C
  const liveRows = live.map(l => fit(l, leftW))
  const tRows = bodyR - liveRows.length - (liveRows.length ? 1 : 0)
  let view = left.map(l => fit(l, leftW))
  if (view.length > tRows) view = top ? view.slice(0, tRows) : view.slice(view.length - tRows)
  while (view.length < tRows) view.push(sp(leftW))
  const leftCol = [...view, ...(liveRows.length ? [sp(leftW)] : []), ...liveRows]
  let rows = leftCol
  if (pane) {
    let body = pane.lines
    if (!body) {
      if (!pane.M) throw new Error('a pane needs lines or a model')
      body = fitPane(pane.P, bodyR - 1, pane.M)
    }
    const mark = pane.focus ? '{b|pane} {d|[×]}' : '{d|[×]}'
    const paneRows = [lr(pane.title ? m(pane.title, 'm') : '', close ? mark : '', pane.P), ...body]
    if (paneRows.length !== bodyR) throw new Error(`pane rows ${paneRows.length} != ${bodyR}`)
    rows = leftCol.map((l, i) => [...l, ...cellsOf('│', pane.focus ? 'H' : 'h'), ...sp(1), ...nth(paneRows, i)])
  }
  return [...rows, ...ch]
}

// ---------------------------------------------------------------- registry and emit
/** a registered mock: its width, its lines, and whether it prints paint and bg blocks */
export type MockRecord = { readonly w: number; readonly lines: readonly Line[]; readonly hero: boolean }
export const mocks: Map<string, MockRecord> = new Map()
/** register a mock; hero mocks print paint and bg blocks */
export function mock(name: string, w: number, lines: readonly Src[], { hero = false }: { hero?: boolean } = {}): void {
  if (mocks.has(name)) throw new Error('duplicate mock ' + name)
  const fixed = lines.map(l => m(l))
  fixed.forEach((l, i) => {
    if (l.length !== w) throw new Error(`${name}: line ${i} is ${l.length} cells, expected ${w}: "${l.map(c => c.ch).join('')}"`)
  })
  mocks.set(name, { w, lines: fixed, hero })
}
export const textOf = (l: Line): string => l.map(c => c.ch).join('')
const paintOf = (l: Line): string => l.map(c => (c.ch === '' ? c.fg : c.ch === ' ' ? ' ' : c.fg)).join('')
const bgOf = (l: Line): string => l.map(c => c.bg).join('')
export function render(name: string): string {
  const k = mocks.get(name)
  if (!k) throw new Error('unknown mock ' + name)
  const block = (lang: string, f: (l: Line) => string): string => '```' + lang + '\n' + k.lines.map(f).join('\n') + '\n```'
  return k.hero ? [block('text', textOf), block('paint', paintOf), block('bg', bgOf)].join('\n') : block('text', textOf)
}

/** the engine's dialog in its target look (E.15, E.16): it takes the place of the prompt box */
export function dialog(
  C: number,
  label: string,
  meta: string,
  head: readonly string[],
  options: readonly string[],
  { sel = 0, note = '', foot = 'enter to choose · 1 to 9 pick · esc to deny' }: { sel?: number; note?: string; foot?: string } = {}
): Line[] {
  const w = Math.min(C - 1, 120)
  return [
    rule(w, { label, meta }),
    ...head.map(h => fit(cat(sp(2), m(h, 'b')), w)),
    ...(note ? [fit(cat(sp(2), m(note, 'm')), w)] : []),
    sp(w),
    ...options.map((o, i) =>
      i === sel
        ? setBg(fit(cat(sp(2), '{a|▸} ', m(`${i + 1}  ${o}`, 'b')), w), 'k', 4, 4 + len(m(`${i + 1}  ${o}`)))
        : fit(cat(sp(4), m(`${i + 1}  ${o}`, 't')), w)
    ),
    rule(w),
    fit(cat(sp(2), m(foot, 'm')), w)
  ]
}
/** place text fragments at fixed columns: at(w, [[col, markup], ...]) */
export function at(w: number, parts: readonly (readonly [number, string])[]): Line {
  const line: Line = []
  for (const [col, src] of parts) {
    if (line.length > col) throw new Error('at(): overlap at ' + col)
    line.push(...sp(col - line.length), ...m(src, 'd'))
  }
  return fit(line, w)
}
