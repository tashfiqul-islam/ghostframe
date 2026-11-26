#!/usr/bin/env bun
// ghostframe status line: preview
// Prints the final design with sample data, so you can judge it in your own terminal and font
// before the real status line is built. Nothing is installed or changed.
//
//   bun statusline-preview.ts                 normal + under pressure at your width, then narrow (100)
//   bun statusline-preview.ts --width 160     force a width
//   bun statusline-preview.ts --state normal  one state only (normal | pressure)
//   bun statusline-preview.ts --no-icons      without Nerd Font icons
//   bun statusline-preview.ts --bars          sampler: the meter drawn with each candidate block character
//   bun statusline-preview.ts --bar ■         draw everything with one candidate (any single character)
//   bun statusline-preview.ts --ghosts        sampler: the ghost in each colour option, calm and under pressure
//   bun statusline-preview.ts --ghost shaded  draw everything with one ghost colour (ash | smoke | obsidian | ember | peach)

type Seg = { t: string; fg?: string; bg?: string; b?: boolean };

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const ICONS = !args.includes('--no-icons');

// ---- tokens (Cockpit design system)
const SLAB = '#111117';
const TILE = { n: '#17171F', w: '#1E1A15', e: '#22161C' } as const;
const A = '#FAB387', CY = '#7EC8BE', CYD = '#4E7A75', ERR = '#EC84A0', WARN = '#E8B98A', BR = '#ECECF1';
const GREY = '#7A7A86', GREY2 = '#6E6E7A', RULE = '#2A2A34', OFF = '#2C2C37';
const ADD = '#96D292', REM = '#EC84A0', EYE = '#F4F1EC', EYE_RED = '#D7263D';
const ICON = { branch: '\uE725', pr: '\uF407', bolt: '\uF0E7' }; // Nerd Font: dev git branch, oct pull request, fa bolt
const BAR = opt('--bar') ?? '▮';

type State = 'n' | 'w' | 'e';
const state = (p: number): State => (p < 60 ? 'n' : p < 85 ? 'w' : 'e');
const tone = (p: number) => (p < 60 ? CY : p < 85 ? WARN : ERR);

// ---- sample data (the same two states as the design board)
type Data = {
  ctx: number; s: number; sr: string; sp: number; w: number; wr: string; wp: number;
  add: string; rem: string; pr: null | { n: string; review: string }; cache: string | null; dirty: boolean;
};
const NORMAL: Data = { ctx: 41, s: 34, sr: '2h 14m', sp: 55, w: 8, wr: 'Mon', wp: 22, add: '+9.3k', rem: '−524', pr: null, cache: '4m', dirty: true };
const PRESSURE: Data = { ctx: 88, s: 91, sr: '38m', sp: 87, w: 76, wr: 'Mon', wp: 64, add: '+9.3k', rem: '−524', pr: { n: '#23', review: 'changes requested' }, cache: null, dirty: true };

// ---- segment helpers
const len = (segs: Seg[]) => segs.reduce((n, x) => n + [...x.t].length, 0);
const sp = (n: number): Seg[] => (n > 0 ? [{ t: ' '.repeat(n) }] : []);
function fit(segs: Seg[], w: number): Seg[] {
  const n = len(segs);
  if (n > w) throw new Error(`overflow ${n}>${w}: ${segs.map(x => x.t).join('')}`);
  return [...segs, ...sp(w - n)];
}
const lr = (l: Seg[], r: Seg[], w: number) => fit([...l, ...sp(Math.max(1, w - len(l) - len(r))), ...r], w);
const onbg = (segs: Seg[], bg: string) => segs.map(x => ({ ...x, bg: x.bg ?? bg }));
const icon = (k: keyof typeof ICON, fg: string): Seg[] => (ICONS ? [{ t: ICON[k] + ' ', fg }] : []);

// ---- the ghost: 6 x 4 pixels on two rows of half blocks; eyes turn red when any budget is red.
// Each palette gives one colour per pixel row (top to bottom), so a palette can shade the body.
const GHOSTS: Record<string, { rows: string[]; eye: string }> = {
  ash:      { rows: ['#C4C0CC', '#9894A3', '#75717F', '#58545F'], eye: A },
  smoke:    { rows: ['#8A8596', '#666271', '#4E4B57', '#3D3A45'], eye: A },
  obsidian: { rows: ['#A29DB0', '#4F4B59', '#403D49', '#35323D'], eye: A },
  ember:    { rows: ['#5E5A68', '#34313B', '#2A2830', '#E0905E'], eye: A },
  peach:    { rows: ['#FAB387', '#FAB387', '#FAB387', '#FAB387'], eye: EYE },
};
const GHOST = GHOSTS[opt('--ghost') ?? 'obsidian'] ?? GHOSTS.obsidian;   // obsidian is the chosen ghost
function ghost(worst: number, pal = GHOST): [Seg[], Seg[]] {
  const G = ['.####.', '#W##W#', '######', '#.##.#'];
  const at = (r: number, c: number) => {
    const k = G[r][c];
    return k === '#' ? pal.rows[r] : k === 'W' ? (worst < 85 ? pal.eye : EYE_RED) : null;
  };
  const rows: [Seg[], Seg[]] = [[], []];
  ([[0, 1], [2, 3]] as const).forEach(([a, b], r) => {
    for (let c = 0; c < 6; c++) {
      const top = at(a, c), bot = at(b, c);
      if (top && bot && top === bot) rows[r].push({ t: '█', fg: top });
      else if (top && bot) rows[r].push({ t: '▀', fg: top, bg: bot });
      else if (top) rows[r].push({ t: '▀', fg: top });
      else if (bot) rows[r].push({ t: '▄', fg: bot });
      else rows[r].push({ t: ' ' });
    }
  });
  return rows;
}

// ---- segmented meter: one ▬ per cell, quiet scale at 25/50/75%, one white block for pace
function meter(p: number, w: number, pace: number | null, bg: string): Seg[] {
  const f = Math.round((p / 100) * w);
  const k = pace === null ? -1 : Math.min(w - 1, Math.floor((pace / 100) * w));
  const q = new Set([0.25, 0.5, 0.75].map(x => Math.round(w * x)));
  const out: Seg[] = [];
  for (let i = 0; i < w; i++) {
    const fg = i === k ? BR : i < f ? tone(p) : q.has(i) ? '#3A3A47' : RULE;
    out.push({ t: BAR, fg, bg });
  }
  return out;
}

// ---- the two rows
function statusline(d: Data, w: number): [Seg[], Seg[]] {
  const wide = w >= 140;
  const [g1, g2] = ghost(Math.max(d.ctx, d.s, d.w));

  const model: [Seg[], Seg[], number] = [
    [{ t: 'Opus 5.5', fg: BR, b: true }],
    [...Array.from({ length: 5 }, (_, i): Seg => ({ t: BAR, fg: i < 2 ? A : OFF })), ...(wide ? [{ t: ' medium', fg: GREY }] : [])],
    wide ? 12 : 8,
  ];
  const repo1: Seg[] = [{ t: 'ghostframe', fg: BR, b: true }];
  const repo2: Seg[] = [...icon('branch', CYD), { t: 'main', fg: CY }, ...(d.dirty ? [{ t: ' ●', fg: A }] : [])];
  const prSlot: Seg[] = [...icon('pr', ERR), { t: 'PR #23' }];
  const ch: [Seg[], Seg[]] = d.pr
    ? [[...icon('pr', ERR), { t: 'PR ' + d.pr.n, fg: BR, b: true }], [{ t: wide ? d.pr.review : 'changes', fg: ERR }]]
    : [[{ t: d.add, fg: ADD }, { t: ' ' + d.rem, fg: REM }], wide && d.cache ? [...icon('bolt', CYD), { t: 'cache ' + d.cache, fg: GREY }] : [{ t: 'cache', fg: GREY }]];
  // each column is sized for its longest state, so nothing moves between states
  const repoW = Math.max(len(repo1), len(repo2));
  const chW = Math.max(wide ? 17 : 8, len(prSlot), len(ch[0]), len(ch[1]));
  const cols: [Seg[], Seg[], number][] = [model, [repo1, repo2, repoW], [ch[0], ch[1], chW]];

  // gutters: after the ghost, either side of each rule, and before the tiles.
  // Past TILE_MAX the first extra width goes to the left side's gutters, so it breathes instead of the bars stretching.
  const TG = 1, TILE_MAX = 54;
  const g = wide ? { ghost: 4, rule: 3, tiles: 3 } : { ghost: 2, rule: 1, tiles: 2 };
  const colsW = 2 + 6 + cols.reduce((n, [, , W]) => n + W, 0);
  const fixed = () => colsW + g.ghost + (wide ? 2 * (2 * g.rule + 1) : 2 * 2 * g.rule) + g.tiles;
  let TW = Math.floor((w - fixed() - 2 * TG) / 3);
  if (wide && TW > TILE_MAX) {
    let slack = w - fixed() - 2 * TG - 3 * TILE_MAX;
    g.rule += Math.min(2, Math.floor(slack / 4));           // only the 4 gutters around the rules grow (up to 2 cells each);
                                                            // the ghost stays with the model, and the tiles share whatever is left
  }
  let L1: Seg[] = [...sp(2), ...g1], L2: Seg[] = [...sp(2), ...g2];
  cols.forEach(([a, b, W], i) => {
    const sep: Seg[] = i === 0 ? sp(g.ghost) : wide ? [...sp(g.rule), { t: '│', fg: RULE }, ...sp(g.rule)] : sp(2 * g.rule);
    L1 = [...L1, ...sep, ...fit(a, W)];
    L2 = [...L2, ...sep, ...fit(b, W)];
  });
  L1.push(...sp(g.tiles)); L2.push(...sp(g.tiles));

  const avail = w - len(L1) - 2 * TG;
  const base = Math.floor(avail / 3), extra = avail % 3;
  const tiles: [string, string, number, string | null, number | null][] = [
    ['context', 'ctx', d.ctx, null, null],
    ['5-hour', '5h', d.s, d.sr, d.sp],
    ['week', 'wk', d.w, d.wr, d.wp],
  ];
  tiles.forEach(([name, short, p, rs, pace], i) => {
    const TW = base + (i < extra ? 1 : 0);   // equal tiles
    const bg = TILE[state(p)];
    const edge = { n: '#2E5A55', w: WARN, e: ERR }[state(p)];
    const inner = TW - 5;
    const val = fit([{ t: String(p), fg: p < 60 ? BR : tone(p), b: true }, { t: '%', fg: p < 60 ? GREY2 : tone(p) }], 4);
    // the label and the note in the tile's corner each have longer and shorter forms;
    // take the longest pair that fits, so in-between widths degrade step by step
    const labels = (wide ? [name, short] : [short]).map(x => ' ' + x.toUpperCase());
    const notes: Seg[][] = [];
    const reset = (full: boolean): Seg[] => (rs ? [{ t: full ? '↻ ' + rs : '↻' + rs.split(' ')[0], fg: GREY2 }] : []);
    if (p >= 85 && name === 'context') notes.push([{ t: 'compacts at 95%', fg: WARN }], [{ t: 'at 95%', fg: WARN }]);
    if (p >= 85 && pace !== null && p > pace) notes.push([{ t: 'ahead of pace', fg: ERR }, { t: '  ', fg: GREY2 }, ...reset(true)], [{ t: 'ahead', fg: ERR }, { t: ' ', fg: GREY2 }, ...reset(false)]);
    if (rs && (wide || p >= 85)) notes.push(reset(true), reset(false));
    notes.push([]);
    let lab: Seg[] = [], meta: Seg[] = [];
    pick: for (const l of labels) for (const m of notes) {
      if (len(val) + l.length + (m.length ? 1 + len(m) : 0) <= inner) { lab = [{ t: l, fg: p < 85 ? GREY : ERR }]; meta = m; break pick; }
    }
    const sep = i ? sp(TG) : [];
    L1 = [...L1, ...sep, { t: '▏', fg: edge, bg }, ...onbg([...sp(2), ...lr([...val, ...lab], meta, inner), ...sp(2)], bg)];
    L2 = [...L2, ...sep, { t: '▏', fg: edge, bg }, ...onbg(sp(2), bg), ...meter(p, inner, pace, bg), ...onbg(sp(2), bg)];
  });
  if (len(L1) !== w || len(L2) !== w) throw new Error(`row width ${len(L1)}/${len(L2)} != ${w}`);
  return [onbg(L1, SLAB), onbg(L2, SLAB)];
}

// ---- ANSI output (24-bit colour)
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(';');
const ansi = (segs: Seg[]) =>
  segs.map(x => `\x1b[0m${x.b ? '\x1b[1m' : ''}${x.fg ? `\x1b[38;2;${rgb(x.fg)}m` : ''}${x.bg ? `\x1b[48;2;${rgb(x.bg)}m` : ''}${x.t}`).join('') + '\x1b[0m';

function show(label: string, d: Data, w: number) {
  const dim = (t: string) => `\x1b[38;2;${rgb('#5E5E6A')}m${t}\x1b[0m`;
  console.log('\n' + `\x1b[1m${label}\x1b[0m ` + dim(`· ${w} columns`));
  console.log(dim('─'.repeat(w)));
  console.log(`\x1b[38;2;${rgb('#7C7C88')}m❯ \x1b[38;2;${rgb(A)}m█\x1b[0m`);
  console.log(dim('─'.repeat(w)));
  for (const row of statusline(d, w)) console.log(ansi(row));
  console.log(`\x1b[38;2;${rgb(A)}m ⏵⏵ auto mode on\x1b[0m` + dim(' (shift+tab to cycle) · ← 1 agent'));
}

const termW = Number(opt('--width')) || process.stdout.columns || 200;
if (args.includes('--ghosts')) {
  console.log('\nGhost sampler: each palette on the slab, calm and under pressure. Pick one, then run with --ghost <name>.\n');
  for (const name of Object.keys(GHOSTS)) {
    const calm = ghost(0, GHOSTS[name]), hot = ghost(90, GHOSTS[name]);
    for (let r = 0; r < 2; r++) {
      const label: Seg[] = r === 0 ? [{ t: '  ' + name.padEnd(10), fg: BR }] : [{ t: '  '.padEnd(12) }];
      console.log(ansi([...label, ...onbg([...sp(3), ...calm[r], ...sp(4), ...hot[r], ...sp(3)], SLAB), ...sp(3),
        ...onbg([...sp(2), ...calm[r], ...sp(3), { t: r === 0 ? 'Opus 5.5' : 'medium  ', fg: r === 0 ? BR : GREY, b: r === 0 }, ...sp(3)], SLAB)]));
    }
    console.log();
  }
  process.exit(0);
}
if (args.includes('--bars')) {
  const cands: [string, string][] = [
    ['▮', 'black vertical rectangle (current)'], ['▬', 'black rectangle'], ['■', 'black square'],
    ['▰', 'black parallelogram'], ['▌', 'left half block'], ['▐', 'right half block'],
    ['▆', 'lower three-quarter block'], ['▄', 'lower half block'], ['▀', 'upper half block'], ['━', 'heavy line'],
  ];
  console.log('\nMeter sampler: 41% calm, 91% red with pace, 5-block effort. Pick the row that looks best, then run with --bar <char>.\n');
  for (const [ch, name] of cands) {
    const bg = TILE.n, bgE = TILE.e;
    const m1 = Array.from({ length: 32 }, (_, i): Seg => ({ t: ch, fg: i === 18 ? BR : i < 13 ? CY : [8, 16, 24].includes(i) ? '#3A3A47' : RULE, bg }));
    const m2 = Array.from({ length: 32 }, (_, i): Seg => ({ t: ch, fg: i === 27 ? BR : i < 29 ? ERR : RULE, bg: bgE }));
    const ef = Array.from({ length: 5 }, (_, i): Seg => ({ t: ch, fg: i < 2 ? A : OFF, bg: SLAB }));
    console.log(ansi([{ t: `  ${ch}  `, fg: BR }, { t: name.padEnd(28), fg: GREY }, ...sp(2), ...ef, ...sp(3), { t: '  ', bg }, ...m1, { t: '  ', bg }, ...sp(2), { t: '  ', bg: bgE }, ...m2, { t: '  ', bg: bgE }]));
    console.log();
  }
  process.exit(0);
}
const only = opt('--state');
if (termW < 100) console.log(`Your terminal is ${termW} columns. The design needs at least 100; widen the window or pass --width.`);
const W = Math.max(100, termW);
if (!only || only === 'normal') show('Normal', NORMAL, W);
if (!only || only === 'pressure') show('Under pressure', PRESSURE, W);
if (!only && W >= 140) show('Narrow', PRESSURE, 100);
console.log(`\n\x1b[38;2;${rgb('#5E5E6A')}mDrawn for line height 1.5. Windows Terminal: Settings > your profile > Appearance > Line height 1.5.${ICONS ? ' Icons need a Nerd Font; empty boxes mean run with --no-icons.' : ''}\x1b[0m\n`);
