// Cockpit mock generator: core. Every line is an array of cells {ch, fg, bg}.
// A mock fails the build when any line is not exactly its stated width.

const WIDE = [[0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1faff]];
const isZero = (cp) => (cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x1f3fb && cp <= 0x1f3ff);
const isWide = (cp) => WIDE.some(([a, b]) => cp >= a && cp <= b);

/** text -> cells with one fg and bg */
export function cellsOf(text, fg = 't', bg = '.') {
  const out = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (isZero(cp) && out.length) { (out[out.length - 1].ch ? out[out.length - 1] : out[out.length - 2]).ch += ch; continue; }
    out.push({ ch, fg, bg });
    if (isWide(cp)) out.push({ ch: '', fg, bg });
  }
  return out;
}

/** markup: {x|text} sets fg x; {xk|text} sets fg x on bg k. Capital fg = bold. */
export function m(src, fg = 't', bg = '.') {
  if (Array.isArray(src)) return src;
  const out = [];
  let i = 0;
  let plain = '';
  const flush = () => { if (plain) { out.push(...cellsOf(plain, fg, bg)); plain = ''; } };
  while (i < src.length) {
    const mt = /^\{([a-zA-Z])([.szk]?)\|/.exec(src.slice(i, i + 4));
    if (mt) {
      const end = src.indexOf('}', i);
      if (end < 0) throw new Error('unclosed markup: ' + src);
      flush();
      out.push(...cellsOf(src.slice(i + mt[0].length, end), mt[1], mt[2] || bg));
      i = end + 1;
    } else { plain += src[i]; i += 1; }
  }
  flush();
  return out;
}

/** light Markdown: `code` -> chip, **bold**, superscript marks -> link colour */
export function md(src, fg = 't', bg = '.') {
  const bold = fg.toUpperCase();
  const s = src
    .replace(/`([^`]+)`/g, (_, c) => `{bk|${c}}`)
    .replace(/\*\*([^*]+)\*\*/g, (_, c) => `{${bold}|${c}}`)
    .replace(/([¹²³⁴⁵⁶⁷⁸⁹⁰]+)/g, (_, c) => `{l|${c}}`);
  return m(s, fg, bg);
}

export const sp = (n, bg = '.') => cellsOf(' '.repeat(Math.max(0, n)), 't', bg);
export const cat = (...parts) => parts.flatMap((p) => m(p));
export const len = (cells) => m(cells).length;

/** cut to w cells with an ellipsis, or pad with blanks */
export function fit(src, w, bg = '.') {
  const cells = m(src);
  if (cells.length === w) return cells;
  if (cells.length < w) return [...cells, ...sp(w - cells.length, bg)];
  if (w <= 0) return [];
  let cut = cells.slice(0, w - 1);
  while (cut.length && cut[cut.length - 1].ch === ' ') cut = cut.slice(0, -1);
  if (cut.length && cut[cut.length - 1].ch !== '' && cells[cut.length]?.ch === '') cut = cut.slice(0, -1);
  const last = cut[cut.length - 1] ?? { fg: 't', bg };
  const res = [...cut, { ch: '…', fg: last.fg, bg: last.bg }];
  return [...res, ...sp(w - res.length, bg)];
}

/** middle cut for paths: keep the head segment and the file name */
export function midcut(text, w) {
  if ([...text].length <= w) return text;
  const tail = text.slice(text.lastIndexOf('/') + 1);
  const head = w - tail.length - 2;
  if (head < 2) return '…' + [...text].slice(-(w - 1)).join('');
  return text.slice(0, head) + '…/' + tail;
}

/** left part cut to make room, right part ends on the last cell */
export function lr(left, right, w, bg = '.') {
  const r = m(right);
  if (!r.length) return fit(left, w, bg);
  const l = fit(left, w - r.length - 1, bg);
  return [...l, ...sp(1, bg), ...r];
}

export function setBg(cells, bg, from = 0, to = cells.length) {
  return cells.map((c, i) => (i >= from && i < to && c.bg === '.' ? { ...c, bg } : c));
}

/** a rule with an optional [ LABEL ] and right-hand meta; solid for turns, dotted for frames */
export function rule(w, { ch = '┄', label = '', meta = '', labelFg = 'm', metaFg = 'm', ruleFg = 'h', state = '' } = {}) {
  let left = cat(`{${ruleFg}|${ch}}`);
  if (label) left = cat(left, ' {d|[} ', m(label, labelFg), ' {d|]} ');
  else if (state) left = cat(left, ' ', m(state), ' ');
  // a meta that does not fit loses its last field, then the next: the first field is the one that matters
  let parts = typeof meta === 'string' && meta ? meta.split(' · ') : [];
  let right = meta ? cat(' ', m(meta, metaFg)) : [];
  while (parts.length > 1 && w - left.length - right.length < 1) { parts = parts.slice(0, -1); right = cat(' ', m(parts.join(' · '), metaFg)); }
  const fill = w - left.length - right.length;
  if (fill < 1) return fit(cat(left, right), w);
  return [...left, ...cellsOf(ch.repeat(fill), ruleFg), ...right];
}

/** word wrap on blanks; never splits a chip or a word */
export function wrap(src, w) {
  const cells = m(src);
  const words = [];
  let cur = [];
  for (const c of cells) {
    if (c.ch === ' ' && c.bg === '.') { words.push(cur); cur = []; } else cur.push(c);
  }
  words.push(cur);
  const lines = [];
  let line = [];
  for (const word of words) {
    if (line.length && line.length + 1 + word.length > w) { lines.push(line); line = []; }
    if (line.length) line.push(...sp(1));
    line.push(...word);
  }
  lines.push(line);
  return lines;
}

// ---------------------------------------------------------------- time
export function dur(sec) {
  if (sec < 1) return `${sec.toFixed(1)}s`;
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${String(Math.floor(sec % 60)).padStart(2, '0')}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`;
  return `${Math.floor(sec / 86400)}d ${String(Math.floor((sec % 86400) / 3600)).padStart(2, '0')}h`;
}
export const count = (n) => (n < 1000 ? String(n) : n < 1e6 ? `${(n / 1000).toFixed(n < 1e4 ? 1 : n < 1e5 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`);

// ---------------------------------------------------------------- transcript kit
/** builders for the left half; every line is F cells wide */
export function transcript(F) {
  const prose = Math.min(F - 2, 88);
  const T = { F, prose };
  T.blank = () => sp(F);
  T.raw = (src, fg = 't') => fit(m(src, fg), F);
  T.turn = (n, clock, extra = '') => rule(F, { ch: '─', label: `TURN ${n}${extra ? ' · ' + extra : ''}`, labelFg: 'b', meta: clock, metaFg: 'm' });
  T.prompt = (text, { chips = true } = {}) => {
    const body = chips ? text.replace(/(@[\w./-]+)/g, '{bk|$1}') : text;
    return wrap(m(body, 'b'), F - 2).map((l) => setBg(fit(cat('{a|▍} ', l), F), 's'));
  };
  T.you = (text, right = '') => lr(cat('{a|▍} ', m(text, 'm')), right ? m(right, 'd') : '', F);
  /** paragraphs; the first sentence of a lead paragraph is bright */
  T.p = (text, { lead = false, fg = 't', inset = 2, w = prose } = {}) => {
    let src = md(text, fg);
    if (lead) {
      let end = src.findIndex((c, i) => (c.ch === '.' || c.ch === ':') && (i + 1 === src.length || src[i + 1].ch === ' '));
      if (end < 0) end = src.length - 1;
      src = src.map((c, i) => (i <= end && c.fg === fg ? { ...c, fg: 'b' } : c));
    }
    return wrap(src, w - (inset - 2)).map((l) => fit(cat(sp(inset), l), F));
  };
  T.h = (text, level = 2) => [fit(cat(sp(2), m(text, level <= 2 ? 'B' : 'T')), F)];
  T.list = (items, { ordered = false, inset = 2 } = {}) =>
    items.flatMap((it, i) => {
      const mark = ordered ? `${i + 1}.` : '-';
      const lines = wrap(md(it), prose - (inset - 2) - mark.length - 1);
      return lines.map((l, j) => fit(cat(sp(inset), j === 0 ? mark : ' '.repeat(mark.length), ' ', l), F));
    });
  T.quote = (text) => wrap(md(text, 'm'), prose - 2).map((l) => fit(cat(sp(2), '{m|▏} ', l), F));
  T.frameTop = (label, meta = '', o = {}) => rule(F, { label, meta, ...o });
  T.frameEnd = () => rule(F);
  T.frame = (label, meta, lines, o = {}) => [T.frameTop(label, meta, o), ...lines.map((l) => fit(cat(sp(2), m(l)), F)), T.frameEnd()];
  T.code = (lang, meta, lines, { diff = false } = {}) => [
    T.frameTop(lang, meta),
    ...lines.map((l) => {
      const fg = diff ? (l.startsWith('+') ? 'g' : l.startsWith('-') ? 'r' : 't') : l.trimStart().startsWith('//') || l.trimStart().startsWith('#') ? 'm' : 't';
      return setBg(fit(cat(sp(2), cellsOf(l, fg)), F), 's', 2);
    }),
    T.frameEnd(),
  ];
  T.table = (head, rows, { align = [], zebra = true, cap = 40, fgs = [] } = {}) => {
    const cols = head.map((h, i) => Math.min(cap, Math.max(len(m(h)), ...rows.map((r) => len(md(String(r[i] ?? '')))))));
    const cell = (v, i, fg) => {
      const c = fit(md(String(v ?? ''), fg), cols[i]);
      if (align[i] !== 'r') return c;
      const used = md(String(v ?? ''), fg).length;
      return used >= cols[i] ? c : [...sp(cols[i] - used), ...md(String(v ?? ''), fg)];
    };
    const line = (r, fg, bg) => {
      const body = r.flatMap((v, i) => [...cell(v, i, fgs[i] && fg !== 'm' ? fgs[i] : fg), ...sp(i < r.length - 1 ? 3 : 0)]);
      const l = fit(cat(sp(2), body), F);
      return bg ? setBg(l, bg, 2, F) : l;
    };
    return [line(head, 'm'), fit(cat(sp(2), cellsOf('─'.repeat(F - 2), 'H')), F), ...rows.map((r, i) => line(r, 't', zebra && i % 2 === 1 ? 'z' : ''))];
  };
  /** exception or event row, drawn once */
  T.exc = (glyph, fg, state, text, clock = '', details = []) => [
    lr(cat(`{${fg}|${glyph}} `, state ? `{${fg.toUpperCase()}|${state}} {m|·} ` : '', m(text)), clock ? m(clock, 'd') : '', F),
    ...details.map((d) => fit(cat(sp(4), m(d, 'm')), F)),
  ];
  T.notice = (text, clock = '') => lr(cat('{m|●} ', m(text, 'm')), clock ? m(clock, 'd') : '', F);
  /** fallback capsule: all the work of a segment in one row */
  T.capsule = (text, time) => {
    // narrow frames drop kinds from the right (folding them into +n); the exception story is never cut
    const KIND = /^(\d+) [a-z]+( \+(\d+))?$/;
    let fields = text.split(' · ');
    const clock = F >= 59 ? time : '';
    const room = F - 2 - (clock ? clock.length + 1 : 0);
    const maxKinds = F >= 72 ? 3 : 2;
    for (;;) {
      const idx = fields.map((f, i) => (KIND.test(f) && !/ steps?$| agents$/.test(f.replace(/ \+\d+$/, '')) ? i : -1)).filter((i) => i > 0);
      if (len(m(fields.join(' · '))) <= room && idx.length <= maxKinds) break;
      if (!idx.length) break;
      const last = idx[idx.length - 1];
      const mt = KIND.exec(fields[last]);
      const gone = Number(mt[1]) + Number(mt[3] ?? 0);
      if (idx.length === 1) fields.splice(last, 1);
      else { fields.splice(last, 1); const p = idx[idx.length - 2]; const pm = KIND.exec(fields[p]); fields[p] = fields[p].replace(/ \+\d+$/, '') + ' +' + (gone + Number(pm[3] ?? 0)); }
    }
    return lr(cat('{H|│} ', m(fields.join(' · '), 'm')), clock ? m(clock, 'd') : '', F);
  };
  /** receipt: the closing rule of a turn */
  T.receipt = (state, fields, time, { fg = 'm' } = {}) => {
    const st = m(state, fg);
    const right = cat(fields ? m(fields + ' · ', 'm') : '', m(time, 't'));
    const left = cat('{h|─} ', st, ' ');
    const fill = F - left.length - right.length - 1;
    return fill < 1 ? lr(left, right, F) : [...left, ...cellsOf('─'.repeat(fill), 'h'), ...sp(1), ...right];
  };
  /** unfolded view (ctrl+o): a sentence Claude said, and the steps under it */
  T.beat = (text, time = '') => { const ls = wrap(m(text, 'm'), F - 11); return ls.map((l, i) => lr(cat('{H|│} ', l), i === 0 && time ? m(time, 'd') : '', F)); };
  T.xstep = (kind, subj, res, time, resFg = 'm') => lr(cat('{H|│}   ', cellsOf(kind.padEnd(8), 'm'), ' ', m(subj)), cat(m(res, resFg), sp(3), cellsOf(time.padStart(6), 'd')), F);
  T.xthought = (text, time) => lr(cat('{H|│}   {d|∴ thought} ', m(text, 'm')), m(time, 'd'), F);
  T.sources = (label, items) => [
    T.frameTop(label, String(items.length)),
    ...items.flatMap(([mark, host, title, url]) => [
      fit(cat(sp(2), `{l|${mark}} {c|${host}}  `, m(title)), F),
      fit(cat(sp(4), cellsOf(url, 'l')), F),
    ]),
    T.frameEnd(),
  ];
  return T;
}

// ---------------------------------------------------------------- pane kit
const MARK = { you: ['▍', 'a'], fail: ['✕', 'r'], pass: ['✓', 'g'], block: ['⊘', 'w'], need: ['!', 'w'], commit: ['±', 't'], out: ['↗', 't'], run: ['▸', 'b'], think: ['∴', 'd'], say: ['│', 'H'] };

/** builders for the pane; every line is P cells wide */
export function paneKit(P) {
  const K = { P };
  const wide = P >= 56;
  K.sec = (label, meta = '', o = {}) => rule(P, { label, meta, ...o });
  K.blank = () => sp(P);
  K.text = (src, fg = 'm') => fit(cat(sp(2), m(src, fg)), P);
  K.step = (s) => {
    if (s.say) return fit(cat('{H|│} ', m(s.say, 'm')), P);
    const [g, gf] = s.mark ? MARK[s.mark] : [' ', 't'];
    const resFg = s.resFg ?? (s.mark === 'fail' ? 'R' : s.mark === 'pass' ? 'g' : s.mark === 'block' || s.mark === 'need' ? 'W' : s.mark === 'commit' || s.mark === 'out' ? 't' : 'm');
    const showRes = s.res && (wide || s.mark);
    const res = showRes ? fit(m(s.res, resFg), Math.min(len(m(s.res)), P >= 72 ? 16 : P >= 56 ? 14 : 12)) : [];
    const time = cellsOf((s.time ?? '').padStart(7), s.mark === 'run' ? 'm' : 'd');
    const right = res.length ? cat(res, sp(2), time) : time;
    const left = cat(`{${gf}|${g}} `, cellsOf((s.kind ?? '').padEnd(8), 'm'), ' ', m(s.subj ?? '', s.mark === 'run' ? 'b' : 't'));
    return lr(left, right, P);
  };
  K.agent = (a) => {
    const nameW = P >= 72 ? 22 : P >= 56 ? 18 : 16;
    const done = a.state === 'done';
    const failed = a.state === 'failed';
    const glyph = failed ? '{r|✕}' : `{${done ? 'd' : 'v'}|◇}`;
    const name = fit(cellsOf(a.name, done ? 'm' : failed ? 't' : 'v'), nameW - (a.nested ? 2 : 0));
    const mid = failed ? cat('{R|failed} ', wide ? m(a.subj ?? '', 'm') : '') : done ? cat('{d|done}   ', wide ? m(a.subj ?? '', 'd') : '') : cat(cellsOf((a.kind ?? '').padEnd(7), 'm'), wide ? cat(' ', m(a.subj ?? '', 't')) : '');
    const right = cellsOf(`${String(a.steps).padStart(3)} · ${a.time.padStart(7)}`, 'd');
    return lr(cat(a.nested ? '  ' : '', glyph, ' ', name, ' ', mid), right, P);
  };
  K.todo = (t) => {
    const [st, text] = t;
    if (st === '>') return fit(cat('{a|▸} {b|[>]} ', m(text, 'b')), P);
    return fit(cat(sp(2), st === 'x' ? '{m|[x]} ' : '{t|[ ]} ', m(text, st === 'x' ? 'm' : 't')), P);
  };
  K.file = (f) => {
    const [path, tag, add, del] = f;
    const right = cat(m((tag ?? '').padStart(7), 'm'), ' ', m((add ? '+' + add : '').padStart(5), 'g'), ' ', m((del ? '−' + del : '').padStart(5), 'r'));
    return lr(cat(sp(2), cellsOf(midcut(path, P - 2 - right.length - 1), 't')), right, P);
  };
  K.source = (s) => {
    const [mark, host, title, status = '200'] = s;
    const right = m(status, status.startsWith('2') ? 'd' : 'R');
    return lr(cat(sp(2), mark === '·' ? '{d|·}' : `{l|${mark}}`, ' ', `{c|${host}}`, wide ? cat('  ', m(title, 't')) : ''), right, P);
  };
  K.now = (n) => {
    if (n.needs) return [fit(cat('{w|!} {W|needs you} {m|·} ', m(n.needs)), P), lr(cat(sp(2), cellsOf((n.kind ?? '').padEnd(8), 'm'), ' ', m(n.subj ?? '', 'b')), m((n.el ?? '').padStart(7), 'w'), P)];
    return [fit(cat('{b|▸} ', m(n.say ?? '', 't')), P), lr(cat(sp(2), cellsOf((n.kind ?? '').padEnd(8), 'm'), ' ', m(n.subj ?? '', 'b')), m((n.el ?? '').padStart(7), 'm'), P)];
  };
  K.last = (l) => [lr(cat(sp(2), m(l.state, l.fg ?? 'm'), l.story ? cat(' {m|·} ', m(l.story, 't')) : ''), m(l.time.padStart(7), 't'), P), ...(l.next ? [fit(cat(sp(2), m(l.next, 'm')), P)] : [])];
  return K;
}

const kinds = (steps, top) => {
  const by = new Map();
  for (const s of steps) if (s.kind) by.set(s.kind, (by.get(s.kind) ?? 0) + 1);
  const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, top).map(([k, n]) => `${n} ${k}`);
  const rest = sorted.slice(top).reduce((n, [, c]) => n + c, 0);
  return shown.join(' · ') + (rest ? ` +${rest}` : '');
};
export const byKind = kinds;

/**
 * The fitted layout of spec E.37: the head is fixed, the lower sections are allocated first,
 * STEPS takes the rest as a window. Returns exactly R lines of P cells.
 */
export function fitPane(P, R, M) {
  const K = paneKit(P);
  const pinTag = M.pin ? ` · TURN ${M.pin}` : '';
  const head = M.idle
    ? [K.sec('LAST', M.idle.meta), ...K.last(M.idle)]
    : [K.sec('NOW', M.now.meta, M.now.needs ? { labelFg: 'W' } : {}), ...K.now(M.now)];
  const steps = M.steps ?? [];
  const tall = R >= 40;
  const cap = { todo: tall ? 5 : 3, files: tall ? 6 : 4, sources: tall ? 4 : 3 };
  const lv = { gap: R >= 24 ? 1 : 0, sources: 'full', files: 'full', todo: 'full', agents: 'full' };
  const order = [['gap', 0], ['sources', 'label'], ['files', 'label'], ['todo', 'one'], ['agents', 'running'], ['agents', 'label'], ['todo', 'label'], ['sources', 'none'], ['files', 'none'], ['todo', 'none'], ['agents', 'none']];
  const build = () => {
    const out = [];
    const ag = M.agents ?? [];
    if (ag.length && lv.agents !== 'none') {
      const running = ag.filter((a) => a.state !== 'done' && a.state !== 'failed' && !a.nested).length;
      const nested = ag.filter((a) => a.nested).length;
      const done = ag.filter((a) => a.state === 'done').length;
      const failed = ag.filter((a) => a.state === 'failed').length;
      const meta = [failed && `{r|${failed} failed}`, running && `${running} running`, done && `${done} done`, nested && `${nested} nested`].filter(Boolean).join(' · ');
      const rows = lv.agents === 'label' ? [] : lv.agents === 'running' ? ag.filter((a) => a.state !== 'done') : ag;
      // the cap counts top-level agents; a nested agent rides with its parent
      const tops = rows.filter((a) => !a.nested);
      const lastTop = tops[Math.min(tops.length, 7) - 1];
      let end = rows.indexOf(lastTop) + 1;
      while (rows[end]?.nested) end += 1;
      const shown = rows.slice(0, end).map(K.agent);
      if (tops.length > 7) shown.push(K.text(`… ${tops.length - 7} more`, 'd'));
      out.push([K.sec('AGENTS', meta), ...shown]);
    }
    const td = M.todos ?? [];
    if (td.length && lv.todo !== 'none') {
      const doneN = td.filter((t) => t[0] === 'x').length;
      const cur = Math.max(0, td.findIndex((t) => t[0] === '>'));
      let rows = lv.todo === 'label' ? [] : lv.todo === 'one' ? [td[cur]] : td;
      const allDone = doneN === td.length;
      if (rows.length > cap.todo) { const from = Math.min(Math.max(0, cur - 1), td.length - cap.todo); rows = td.slice(from, from + cap.todo); }
      out.push([K.sec('TODO', `${doneN} of ${td.length}`), ...(allDone ? (lv.todo === 'label' ? [] : [K.text(`all ${td.length} done`, 'm')]) : rows.map(K.todo))]);
    }
    const fl = M.files ?? [];
    if (fl.length && lv.files !== 'none') {
      const add = fl.reduce((n, f) => n + (f[2] ?? 0), 0);
      const del = fl.reduce((n, f) => n + (f[3] ?? 0), 0);
      const keep = fl.length > cap.files ? cap.files - 1 : cap.files;
      const rows = lv.files === 'label' ? [] : fl.slice(0, keep).map(K.file);
      if (lv.files !== 'label' && fl.length > cap.files) {
        const rest = fl.slice(keep);
        rows.push(K.text(`… ${rest.length} more files · +${rest.reduce((n, f) => n + (f[2] ?? 0), 0)} −${rest.reduce((n, f) => n + (f[3] ?? 0), 0)}`, 'd'));
      }
      out.push([K.sec('FILES' + pinTag, `${fl.length} changed · {g|+${add}}${del ? ` {r|−${del}}` : ''}`), ...rows]);
    }
    const so = M.sources ?? [];
    if (so.length && lv.sources !== 'none') {
      const cited = so.filter((s) => s[0] !== '·').length;
      const keepS = so.length > cap.sources ? cap.sources - 1 : cap.sources;
      const rows = lv.sources === 'label' ? [] : so.slice(0, keepS).map(K.source);
      if (lv.sources !== 'label' && so.length > cap.sources) rows.push(K.text(`… ${so.length - keepS} more`, 'd'));
      out.push([K.sec('SOURCES' + pinTag, `${so.length} read · ${cited} cited`), ...rows]);
    }
    return out;
  };
  let lower = build();
  const fixed = () => head.length + lower.reduce((n, s) => n + s.length + lv.gap, 0) + lv.gap + 1;
  const need = Math.min(R >= 24 ? 6 : 3, Math.max(1, steps.length + (steps.length > 6 ? 1 : 0)));
  for (const [k, v] of order) {
    if (R - fixed() >= need) break;
    lv[k] = v;
    lower = build();
  }
  const room = Math.max(0, R - fixed());
  let rows;
  if (!steps.length) rows = room > 0 ? [K.text(M.empty ?? 'no steps yet', 'd')] : [];
  else if (steps.length <= room) rows = steps.map(K.step);
  else if (room <= 0) rows = [];
  else {
    const pinnedMax = room >= 8 ? 3 : room >= 5 ? 1 : 0;
    let tailN = room - 1;
    let hidden = steps.slice(0, steps.length - tailN);
    const pinned = hidden.filter((s) => s.open).slice(-pinnedMax);
    tailN -= pinned.length;
    hidden = steps.slice(0, steps.length - tailN);
    const quiet = hidden.filter((s) => !pinned.includes(s) && !s.say);
    rows = [K.text(`… ${quiet.length} earlier · ${kinds(quiet, P >= 56 ? 3 : 2)}`, 'd'), ...pinned.map(K.step), ...steps.slice(steps.length - tailN).map(K.step)];
  }
  const failN = steps.filter((s) => s.mark === 'fail').length;
  const n = steps.filter((s) => !s.say).length;
  const stepMeta = M.stepsMeta ?? `${n} step${n === 1 ? '' : 's'}${failN ? ` · {r|${failN} failed}` : ''}`;
  const stepSec = [K.sec('STEPS' + (M.pin ? `${pinTag} · PINNED` : M.stepsTurn ? ` · TURN ${M.stepsTurn}` : ''), stepMeta, M.pin ? { labelFg: 'b' } : {}), ...rows];
  while (stepSec.length < room + 1) stepSec.push(K.blank());
  const out = [...head];
  for (const s of [stepSec, ...lower]) { for (let i = 0; i < lv.gap; i += 1) out.push(K.blank()); out.push(...s); }
  while (out.length < R) out.push(K.blank());
  if (out.length > R) throw new Error(`pane overflow: ${out.length} > ${R} at P=${P}`);
  return out;
}

// ---------------------------------------------------------------- chrome
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
export const spin = (i = 2) => SPIN[i % 10];
const meter = (pct, n) => { const f = pct > 0 ? Math.max(1, Math.round((pct / 100) * n)) : 0; return '▰'.repeat(f) + '▱'.repeat(n - f); };
const mfg = (pct) => (pct >= 95 ? 'r' : pct >= 80 ? 'w' : 't');
// stand-ins for the status line script's own Nerd Font icons (private use area, 1 cell each)
export const ICON = { model: '', repo: '', branch: '', diff: '', ctx: '', five: '', week: '' };

export function status(C, o = {}) {
  const s = { model: 'Opus 5.5', effort: 'medium', mode: 'auto', modeFg: 'W', repo: 'ghostframe', branch: 'fix/ci-bun-pin', dirty: 3, add: '25', del: '2', ctx: 19, five: 2, fiveLeft: '4h 40m left', week: 35, weekDay: 'Mon', ...o };
  const I = (k) => `{d|${ICON[k]}} `;
  const eff = C >= 120 || s.mode.length <= 6 ? `{m|· ${s.effort} ·}` : '{m|·}';
  let a; let b;
  if (C >= 120) {
    const g = [34, 60];
    a = cat(sp(2), fit(cat(I('model'), `{b|${s.model}} ${eff} {${s.modeFg}|${s.mode}}`), g[0]), fit(cat(I('repo'), `{t|${s.repo}} {m|·} `, I('branch'), `{t|${s.branch}} {m|· ${s.dirty} uncommitted}`), g[1]), I('diff'), `{g|+${s.add}} {r|−${s.del}} {m|lines}`);
    b = cat(sp(2), fit(cat(I('ctx'), `{m|context} {${mfg(s.ctx)}|${meter(s.ctx, 10)}} {t|${s.ctx}%}`), g[0]), fit(cat(I('five'), `{m|5 hours} {${mfg(s.five)}|${meter(s.five, 10)}} {t|${s.five}%} {m|· ${s.fiveLeft}}`), g[1]), I('week'), `{m|week} {${mfg(s.week)}|${meter(s.week, 10)}} {t|${s.week}%} {m|· ${s.weekDay}}`);
  } else if (C >= 80) {
    const g = [30, 42];
    a = cat(sp(2), fit(cat(I('model'), `{b|${s.model}} ${eff} {${s.modeFg}|${s.mode}}`), g[0]), fit(cat(I('repo'), `{t|${s.repo}} {m|·} `, I('branch'), `{t|${s.branch}}`), g[1]), I('diff'), `{g|+${s.add}} {r|−${s.del}}`);
    b = cat(sp(2), fit(cat(I('ctx'), `{m|context} {${mfg(s.ctx)}|${meter(s.ctx, 8)}} {t|${s.ctx}%}`), g[0]), fit(cat(I('five'), `{m|5h} {${mfg(s.five)}|${meter(s.five, 8)}} {t|${s.five}%} {m|· ${s.fiveLeft.replace(' left', '')}}`), g[1]), I('week'), `{m|week} {t|${s.week}%}`);
  } else {
    a = cat(sp(2), fit(cat(I('model'), `{b|${s.model}} {m|·} {${s.modeFg}|${s.mode}}`), 22), I('repo'), `{t|${s.repo}} {m|·} `, I('branch'), `{t|${s.branch}}`);
    b = cat(sp(2), I('ctx'), `{m|context} {t|${s.ctx}%}  {m|·}  `, I('five'), `{m|5h} {t|${s.five}%}  {m|·}  `, I('week'), `{m|week} {t|${s.week}%}`);
  }
  return [fit(a, C), fit(b, C)];
}

export const HINT = {
  auto: '{W|auto} {m|· a classifier decides · shift+tab to change · esc to stop}',
  autoIdle: '{W|auto} {m|· a classifier decides · shift+tab to change}',
  default: '{m|default · shift+tab to change · ? for shortcuts}',
  plan: '{b|plan} {m|· reads only · shift+tab to change}',
  accept: '{t|accept edits} {m|· shift+tab to change · esc to stop}',
  pane: '{b|pane} {m|· arrows scroll · tab moves · enter opens · esc returns to the prompt}',
};

/** prompt box, hint line and the 2-row status line; full terminal width */
export function chrome(C, { input = '', hint = HINT.auto, st = {}, noStatus = false, dialog = null } = {}) {
  if (dialog) return [...dialog.map((l) => fit(l, C)), ...(noStatus ? [] : status(C, st))];
  const box = [cellsOf('─'.repeat(C), 'h'), fit(cat('{m|>} ', m(input, 'b'), '{a|█}'), C), cellsOf('─'.repeat(C), 'h')];
  return [...box, fit(cat(sp(2), m(hint)), C), ...(noStatus ? [] : status(C, st))];
}

/**
 * A full screen. left: transcript lines (F wide). pane: {P, M} docks a pane of P body cells
 * behind a 2-cell engine chrome. live: rows of the live area (drawn under the transcript).
 */
export function screen({ C, R, F, left, pane = null, live = [], bottom = {}, top = false, close = true }) {
  const ch = chrome(C, bottom);
  const bodyR = R - ch.length;
  const leftW = pane ? C - pane.P - 2 : C;
  const liveRows = live.map((l) => fit(l, leftW));
  const tRows = bodyR - liveRows.length - (liveRows.length ? 1 : 0);
  let view = left.map((l) => fit(l, leftW));
  if (view.length > tRows) view = top ? view.slice(0, tRows) : view.slice(view.length - tRows);
  while (view.length < tRows) view.push(sp(leftW));
  const leftCol = [...view, ...(liveRows.length ? [sp(leftW)] : []), ...liveRows];
  let rows = leftCol;
  if (pane) {
    const body = pane.lines ?? fitPane(pane.P, bodyR - 1, pane.M);
    const mark = pane.focus ? '{b|pane} {d|[×]}' : '{d|[×]}';
    const paneRows = [lr(pane.title ? m(pane.title, 'm') : '', close ? mark : '', pane.P), ...body];
    if (paneRows.length !== bodyR) throw new Error(`pane rows ${paneRows.length} != ${bodyR}`);
    rows = leftCol.map((l, i) => [...l, ...cellsOf('│', pane.focus ? 'H' : 'h'), ...sp(1), ...paneRows[i]]);
  }
  return [...rows, ...ch];
}

// ---------------------------------------------------------------- registry and emit
export const mocks = new Map();
/** register a mock; hero mocks print paint and bg blocks */
export function mock(name, w, lines, { hero = false } = {}) {
  if (mocks.has(name)) throw new Error('duplicate mock ' + name);
  const fixed = lines.map((l) => m(l));
  fixed.forEach((l, i) => { if (l.length !== w) throw new Error(`${name}: line ${i} is ${l.length} cells, expected ${w}: "${l.map((c) => c.ch).join('')}"`); });
  mocks.set(name, { w, lines: fixed, hero });
}
export const textOf = (l) => l.map((c) => c.ch).join('');
const paintOf = (l) => l.map((c) => (c.ch === '' ? c.fg : c.ch === ' ' ? ' ' : c.fg)).join('');
const bgOf = (l) => l.map((c) => c.bg).join('');
export function render(name) {
  const k = mocks.get(name);
  if (!k) throw new Error('unknown mock ' + name);
  const block = (lang, f) => '```' + lang + '\n' + k.lines.map(f).join('\n') + '\n```';
  return k.hero ? [block('text', textOf), block('paint', paintOf), block('bg', bgOf)].join('\n') : block('text', textOf);
}

/** the engine's dialog in its target look (E.15, E.16): it takes the place of the prompt box */
export function dialog(C, label, meta, head, options, { sel = 0, note = '', foot = 'enter to choose · 1 to 9 pick · esc to deny' } = {}) {
  const w = Math.min(C - 1, 120);
  return [
    rule(w, { label, meta }),
    ...head.map((h) => fit(cat(sp(2), m(h, 'b')), w)),
    ...(note ? [fit(cat(sp(2), m(note, 'm')), w)] : []),
    sp(w),
    ...options.map((o, i) => (i === sel ? setBg(fit(cat(sp(2), '{a|▸} ', m(`${i + 1}  ${o}`, 'b')), w), 'k', 4, 4 + len(m(`${i + 1}  ${o}`))) : fit(cat(sp(4), m(`${i + 1}  ${o}`, 't')), w))),
    rule(w),
    fit(cat(sp(2), m(foot, 'm')), w),
  ];
}
/** place text fragments at fixed columns: at(w, [[col, markup], ...]) */
export function at(w, parts) {
  let line = [];
  for (const [col, src] of parts) { if (line.length > col) throw new Error('at(): overlap at ' + col); line = [...line, ...sp(col - line.length), ...m(src, 'd')]; }
  return fit(line, w);
}
