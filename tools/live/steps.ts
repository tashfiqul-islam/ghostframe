// The live checks, steps 1 to 12 of the round 3 report, as scripts. Each suite starts a fresh session (steps 5 and 11
// continue the session of steps 1 and 4), sends the exact prompt, presses the exact keys, captures, and checks
// structure only: glyphs, rows, regions and colours, never Claude's wording.
import { widthOf } from '../../hooks/shared/look/width.ts'
import { at, colourIs, hasReceipt, headers, isDialogUp, layoutOf, leftRows, paneRows, pillOf, receipts, rowsMatching, selectedRow } from './checks.ts'
import { focusPane, slash, startTurn, turn, waitIdle, type Step } from './harness.ts'
import { rowText, textOf, type Capture } from './screen.ts'
import type { Session } from './session.ts'

/** A group of steps run in one session, at each of its widths (200 and 100 columns unless it names one). */
export type Suite = { id: string; widths: readonly number[]; steps: string[]; run: (s: Session, step: (id: string) => Step, cols: number) => Promise<void> }

const quote = (rows: readonly { text: string }[] | readonly string[], max = 4): string =>
  rows.length === 0
    ? '(none)'
    : rows
        .slice(0, max)
        .map(r => `“${(typeof r === 'string' ? r : r.text).trim()}”`)
        .join(' ')

const FLOOD = "run these one at a time and don't fix anything: ls /nope1, ls /nope2, ls /nope3, ls /nope4, ls /nope5, then ls /nope1 again"

/** The left's rows of the latest turn: from its header (or the top) to its receipt (or the bottom). */
function turnRows(cap: Capture): string[] {
  const rows = leftRows(cap)
  const from = headers(cap).at(-1)?.y ?? 0
  const end = receipts(cap).findLast(r => r.y >= from)?.y ?? rows.length - 1

  return rows.slice(from, end + 1)
}

// The spine is column 13 of the left (6.1: 2 margin, 10 label, 1 space).
const SPINE = 13

/** The pane's timeline rows: below the ruler, a glyph in column 2; the result is columns 51–70 (6.2), read by cell. */
function timelineRows(cap: Capture): { y: number; text: string; glyph: string; result: string; isLong: boolean }[] {
  const pane = layoutOf(cap).pane

  if (pane === undefined) return []
  const rows = paneRows(cap)
  const ruler = rows.findIndex(r => /┬─+┬/.test(r))

  if (ruler < 0) return []

  return rows.slice(ruler + 1).flatMap((text, i) => {
    const y = pane.y0 + ruler + 1 + i
    const glyph = at(cap, y, pane.x0 + 2).ch

    if (!/[✓×!◇●↗⊘▸◼▍]/.test(glyph)) return []
    const result = rowText(cap, y, pane.x0 + 51, pane.x0 + 71).trim()
    // Right-aligned in 20 cells, a result of at most 14 leaves columns 51–56 blank.
    const isLong = rowText(cap, y, pane.x0 + 51, pane.x0 + 57).trim() !== '' && at(cap, y, pane.x0 + 50).ch !== ' '

    return [{ y, text, glyph, result, isLong }]
  })
}

/** At this width no pane docks (under 144 columns, nobody asked): a pane check is a note there. */
const noPane = (step: Step, check: string, cols: number): void => step.note(check, `no pane at ${cols} columns`)

/** The full screen's rows. */
const allRows = (cap: Capture): string[] => textOf(cap).split('\n')

/**
 * The checks every kept screen gets (round 5): no pane row wrapped onto the next (2), 4 cells before the wordmark (14),
 * no zero side in the Files counts (13), no reload note on the left (19), no footnote carrying markdown (12).
 * @param step the step whose captures these are
 */
export function screenChecks(step: Step): void {
  const wrapped: string[] = []
  const tight: string[] = []
  const zero: string[] = []
  const reloads: string[] = []
  const marked: string[] = []
  const rulers: string[] = []
  let rulerCount = 0

  for (const cap of step.caps) {
    const pane = layoutOf(cap).pane

    if (pane !== undefined) {
      // 7. The ruler: the start label on the track's first cell, the end label ending on its last; `now` while live.
      for (let y = pane.y0 + 1; y < pane.y1; y++) {
        const ticks = rowText(cap, y, pane.x0, pane.x1)

        if (!/^ +┬[─┬]+┬ *$/.test(ticks)) continue
        rulerCount++
        const labels = rowText(cap, y - 1, pane.x0, pane.x1)
        const isLive = rowsMatching(paneRows(cap), /▐ ● LIVE ▌/).length > 0 && rowsMatching(paneRows(cap), /PINNED/).length === 0
        const isAligned = labels.search(/\S/) === ticks.indexOf('┬') && labels.trimEnd().length === ticks.lastIndexOf('┬') + 1

        if (!isAligned || (isLive && !labels.trimEnd().endsWith('now'))) rulers.push(`${cap.name}: “${labels.trim()}” over ${ticks.trim().length} cells`)
      }

      for (let y = pane.y0; y < pane.y1; y++) {
        const first = at(cap, y, pane.x0).ch
        const row = rowText(cap, y, pane.x0, pane.x1)

        // A pane row starts with a space, the select bar, a card edge or the engine's own rule; a wrapped tail starts at column 0.
        if (!/^[ ▐▄▀─]$/.test(first)) wrapped.push(`${cap.name}: “${row.trim()}”`)
        const mark = row.search(/ghostframe (v|dev)/)
        const before = mark < 0 ? '' : row.slice(0, mark)

        if (before.trim() !== '' && before.length - before.trimEnd().length < 4) tight.push(`${cap.name}: “${row.trim()}”`)
        if (/(^|\s)[+−]0(\s|$)/.test(row)) zero.push(`${cap.name}: “${row.trim()}”`)
      }
    }
    reloads.push(...rowsMatching(allRows(cap), /reloaded · \d+ hooks?/).map(r => `${cap.name}: “${r.text.trim()}”`))
    marked.push(...rowsMatching(leftRows(cap), /\[\d+\] \S*(\*\*|`)/).map(r => `${cap.name}: “${r.text.trim()}”`))
  }
  step.expect('2. no pane row wraps onto the next row', wrapped.length === 0, wrapped.slice(0, 3).join(' ') || '(none)')
  step.expect('14. 4 cells or more before the wordmark on every hint row', tight.length === 0, tight.slice(0, 3).join(' ') || '(none)')
  step.expect('13. no `+0` or `−0` in the pane', zero.length === 0, zero.slice(0, 3).join(' ') || '(none)')
  step.expect('19. no `reloaded · n hooks` row', reloads.length === 0, reloads.slice(0, 3).join(' ') || '(none)')
  step.expect('12. no footnote carries markdown (`**`, backticks)', marked.length === 0, marked.slice(0, 3).join(' ') || '(none)')
  if (rulerCount > 0)
    step.expect(
      '7. the ruler: start label on the track`s first cell, end label on its last, `now` while LIVE',
      rulers.length === 0,
      rulers.slice(0, 3).join(' ') || `${rulerCount} rulers`
    )
}

/** Steps 1 and 5: a fix and its commit, then the slash commands in the same session. */
const fixAndCommit: Suite = {
  id: 'A',
  widths: [200, 100],
  steps: ['1', '5'],
  async run(s, stepOf, cols) {
    const one = stepOf('1')

    await turn(s, one, 'the width tests fail, find out why and fix src/width.ts, then commit')
    const cap = one.keep(await s.capture('step1-turn'))
    const rows = turnRows(cap)
    const offSpine = rows.filter(r => r.trim() !== '' && (r[SPINE] ?? ' ') === ' ')

    one.expect('no row of the turn is drawn off the spine (no narration paragraph)', offSpine.length === 0, quote(offSpine))
    const committed = rowsMatching(leftRows(cap), /↗ {2}committed {3}([0-9a-f]{7})/)
    const sha = /([0-9a-f]{7})/.exec(committed[0]?.text.split('committed')[1] ?? '')?.[1]

    one.expect('a `↗  committed <sha>` row', committed.length > 0, quote(committed))
    const receipt = receipts(cap).at(-1)

    one.expect(
      'the receipt ends `↗ <sha>`, the committed hash',
      receipt !== undefined && sha !== undefined && receipt.text.endsWith(`↗ ${sha}`),
      receipt?.text ?? '(no receipt)'
    )
    const timeline = timelineRows(cap)
    const long = timeline.filter(r => r.isLong || widthOf(r.result) > 14)

    if (layoutOf(cap).pane === undefined) {
      noPane(one, '5. a fixed failure keeps its × row; its rerun is a ✓ row', cols)
      noPane(one, '7. the commit step reads `git commit …`, never `git add …`', cols)
    } else {
      const tests = timeline.filter(r => /test /.test(r.text))

      one.expect(
        '5. a fixed failure keeps its × row; its rerun is a ✓ row',
        // The × run, then a ✓ rerun after it (a test-and-commit step after that reads ↗).
        tests.findIndex(r => r.glyph === '×') >= 0 && tests.slice(tests.findIndex(r => r.glyph === '×') + 1).some(r => r.glyph === '✓'),
        quote(tests.map(r => r.text))
      )
      one.expect(
        '7. the commit step reads `git commit …`, never `git add …` (its group may carry Claude`s sentence)',
        !timeline.some(r => /git add/.test(r.text)) && timeline.some(r => r.glyph === '↗'),
        quote(timeline.filter(r => /git /.test(r.text)).map(r => r.text))
      )
    }

    one.expect(
      'every pane result is at most 14 cells',
      layoutOf(cap).pane === undefined || (timeline.length > 0 && long.length === 0),
      `${timeline.length} rows; over: ${quote(long)}; results: ${timeline.map(r => r.result).join(' | ')}`
    )
    await s.key('ctrl+o')
    const full = one.keep(await s.waitSettled(c => layoutOf(c).pane === undefined, 20_000, 'ctrl+o').then(async () => s.capture('step1-ctrl-o')))
    const stepLines = rowsMatching(leftRows(full), /^\s{12,20}(read|edit|write|shell|test|fetch|search|agent|todo|skill)\s{1,6}\S/)

    one.expect('ctrl+o shows step lines (kind, subject, result, time)', stepLines.length > 0, quote(stepLines))
    one.expect('ctrl+o hides the pane', layoutOf(full).pane === undefined, layoutOf(full).pane === undefined ? 'no pane' : 'pane still docked')
    await s.key('ctrl+o')
    await s.waitSettled(c => cols < 144 || layoutOf(c).pane !== undefined, 20_000, 'the pane back after ctrl+o')

    const five = stepOf('5')
    const turnNo = headers(cap).at(-1)?.turn ?? 1

    five.note('the turn number used for /steps', `${turnNo} (the header of step 1's turn)`)
    const steps = five.keep(await slash(s, `/steps ${turnNo} all`, /STEPS · TURN \d+/).then(async () => s.capture('step5-steps-all')))
    const left = leftRows(steps)
    const head = left.findLastIndex(r => /STEPS · TURN \d+/.test(r))
    const stepRows = left.slice(head + 1).filter(r => /^\s+(?:[✓×!▸⊘↗◇]\s+)?(read|edit|write|shell|test|fetch|search|agent|todo|skill)\s/.test(r))
    const kindAt = new Set(stepRows.map(r => r.search(/(read|edit|write|shell|test|fetch|search|agent|todo|skill)\s/)))
    // In cells: a subject with an emoji or a CJK character is wider than its code units.
    const ends = new Set(stepRows.map(r => widthOf(r.trimEnd())))

    five.expect('a `✓  /steps n all` row', rowsMatching(left, /\d\d:\d\d:\d\d ✓ {2}\/steps \d+ all/).length > 0, quote(rowsMatching(left, /\/steps/)))
    five.expect(
      '/steps rows: kind words in one column, right ends in one column',
      stepRows.length > 0 && kindAt.size === 1 && ends.size === 1,
      `${stepRows.length} rows, kind columns ${[...kindAt].join(',')}, right ends ${[...ends].join(',')}`
    )
    five.expect(
      '7. /steps names the commit step after its commit, never `git add`',
      !stepRows.some(r => /git add/.test(r)),
      quote(stepRows.filter(r => /git /.test(r)))
    )
    five.expect(
      '/steps prints no diff card, no JSON (`{"`, `"key":`), no `exit 0`',
      rowsMatching(left.slice(head), /@@|c copy|\{"|"\w+":|exit 0/).length === 0,
      quote(rowsMatching(left.slice(head), /@@|c copy|\{"|"\w+":|exit 0/))
    )
    const nine = five.keep(await slash(s, '/copy code 9', /\/copy code 9 {3}\S/).then(async () => s.capture('step5-copy-9')))

    five.expect(
      '`/copy code 9` is an × row',
      rowsMatching(leftRows(nine), /\d\d:\d\d:\d\d × {2}\/copy code 9 {3}\S/).length > 0,
      quote(rowsMatching(leftRows(nine), /\/copy code 9/))
    )
    const one1 = five.keep(await slash(s, '/copy code 1', /\/copy code 1 {3}\S/).then(async () => s.capture('step5-copy-1')))
    const copied = rowsMatching(leftRows(one1), /\d\d:\d\d:\d\d ([✓×]) {2}\/copy code 1 {3}\S/)

    five.note('`/copy code 1` row (✓ when the answer has a code block)', quote(copied))
    five.expect('no row says `ghostframe:`', !textOf(one1).includes('ghostframe:'), quote(rowsMatching(leftRows(one1), /ghostframe:/)))
  }
}

/** Step 2: a failing test, then the pane focused: hidden key labels, the hint row, selection, tab keys. */
const failingTest: Suite = {
  id: 'B',
  widths: [200, 100],
  steps: ['2'],
  async run(s, stepOf, cols) {
    const two = stepOf('2')

    await turn(s, two, "break the ascii test on purpose (expect 4) and run bun test once, don't fix it")
    const cap = two.keep(await s.capture('step2-turn'))

    if (cols < 144) {
      const rows = rowsMatching(leftRows(cap), /× {2}test /)

      two.expect('fallback: a `×  test …` failure row on the left (13.1)', rows.length > 0, quote(rowsMatching(leftRows(cap), /×/)))
    } else
      two.expect(
        'a `× n still failing` card on the left',
        rowsMatching(leftRows(cap), /× \d+ still failing/).length > 0,
        quote(rowsMatching(leftRows(cap), /still failing/))
      )
    two.expect('the receipt is FAILED', receipts(cap).at(-1)?.word === 'FAILED', receipts(cap).at(-1)?.text ?? '(none)')
    if (cols < 144) {
      for (const check of [
        'no hotkey label rows',
        'C. the hint row is the pane’s second-to-last row',
        'the selected row',
        '9. the failure`s drawer',
        'pressing 3 then 1'
      ])
        noPane(two, check, cols)

      return
    }
    const failing = timelineRows(cap).filter(r => r.glyph === '×')

    two.expect(
      'the pane names the failing step (a × test row)',
      failing.some(r => /test\s|bun test/.test(r.text)),
      quote(failing.map(r => r.text))
    )
    await focusPane(s)
    const focused = two.keep(await s.capture('step2-pane-focused'))
    const pane = layoutOf(focused).pane
    const leaked = rowsMatching(paneRows(focused), /^\s*[0-9a-z]:\s*$/)

    two.expect('no hotkey label rows (`1:` …) in the pane', pane !== undefined && leaked.length === 0, quote(leaked))
    // Decision C: the engine keeps the dock's last row, so the hint row is the second-to-last.
    const secondLast = pane === undefined ? '' : rowText(focused, pane.y1 - 2, pane.x0, pane.x1)
    const last = pane === undefined ? '' : rowText(focused, pane.y1 - 1, pane.x0, pane.x1)

    two.expect(
      'C. the hint row and wordmark are the pane’s second-to-last row',
      /ghostframe/.test(secondLast) && /tab/.test(secondLast) && last.trim() === '',
      `second-to-last: “${secondLast.trim()}”; last: “${last.trim()}”`
    )
    let selected = selectedRow(focused)

    if (selected === undefined) {
      await s.key('tab')
      selected = selectedRow(await s.waitSettled(() => true, 5000, 'a selected row'))
    }
    const tints = new Set(selected?.backgrounds ?? [])

    two.expect(
      'the selected row is one `selected` tint across, `▐` in accent',
      selected !== undefined &&
        colourIs(selected.bar, 'token.accent') &&
        tints.size === 1 &&
        colourIs({ ...selected.bar, fg: [...tints][0] ?? null }, 'tint.selected'),
      selected === undefined ? 'no selected row' : `bar fg ${selected.bar.fg}, backgrounds ${[...tints].join(',')}`
    )
    two.keep(await s.capture('step2-selected'))
    // 9: the ring onto the failing row, Enter: its drawer names the cleaned command and its exit code.
    for (let i = 0; i < 8 && !/× test/.test(rowText(await s.screen(), selectedRow(await s.screen())?.y ?? 0)); i++) await s.key('tab')
    await s.key('enter')
    const drawer = two.keep(await s.waitSettled(() => true, 5000, 'the drawer').then(async () => s.capture('step2-drawer')))
    const drawn = paneRows(drawer)

    two.expect(
      '9. the failure`s drawer: the cleaned command, its exit code or count, never `2>&1` or `failed`',
      drawn.some(r => /test +bun test .*(exit \d+|\d+ of \d+)/.test(r)) && !drawn.some(r => /2>&1|\bfailed\b/.test(r)),
      quote(
        drawn.filter(r => /test |exit|failed/.test(r)),
        4
      )
    )
    await s.key('enter')
    const activeTab = (c: Capture): string | undefined => {
      const p = layoutOf(c).pane

      if (p === undefined) return undefined
      for (let y = p.y0; y < p.y0 + 4; y++) {
        const text = rowText(c, y, p.x0, p.x1)
        const m = /(TIMELINE|FILES|SOURCES|TODO|AGENTS)/g

        for (const hit of text.matchAll(m)) if (at(c, y, p.x0 + hit.index).bold) return hit[1]
      }

      return undefined
    }

    await s.key('3')
    const three = two.keep(await s.waitSettled(() => true, 5000, 'tab 3').then(async () => s.capture('step2-key-3')))

    await s.key('1')
    const back = two.keep(await s.waitSettled(() => true, 5000, 'tab 1').then(async () => s.capture('step2-key-1')))

    two.expect(
      'pressing 3 then 1 switches the tab (bug 12: hidden hotkeys still fire)',
      activeTab(three) === 'SOURCES' && activeTab(back) === 'TIMELINE',
      `after 3: ${activeTab(three)}; after 1: ${activeTab(back)}`
    )
  }
}

/** Step 3: a denial with a comment, in the default mode. */
const denial: Suite = {
  id: 'C',
  widths: [200, 100],
  steps: ['3'],
  async run(s, stepOf, cols) {
    const three = stepOf('3')
    const modeLine = async (): Promise<string> =>
      textOf(await s.screen())
        .split('\n')
        .slice(-6)
        .filter(r => r.trim() !== '' && !/^[─\s]+$/.test(r))
        .join(' · ')

    for (let i = 0; i < 6 && /auto mode|accept edits|plan mode/.test(await modeLine()); i++) await s.key('shift+tab')
    three.note('the mode line before the prompt', (await modeLine()).trim())
    await startTurn(s, 'delete src/width.test.ts using Remove-Item')
    const dialog = three.keep(await s.waitSettled(isDialogUp, 300_000, 'the permission dialog').then(async () => s.capture('step3-dialog')))
    const needs = rowsMatching(leftRows(dialog), /! {2}NEEDS YOU/)

    // Decision B: the engine's dialog is its own signal; the left draws no NEEDS YOU row, the pane's pill says it.
    three.expect('B. no `! NEEDS YOU` row on the left while the dialog is up', needs.length === 0, quote(needs))
    if (layoutOf(dialog).pane === undefined) noPane(three, 'B. the pane`s pill says NEEDS YOU', cols)
    else three.expect('B. the pane`s pill says NEEDS YOU', pillOf(dialog)?.word === 'NEEDS YOU', `pill: ${pillOf(dialog)?.word ?? '(none)'}`)
    for (let i = 0; i < 5; i++) {
      const pointed = textOf(await s.screen())
        .split('\n')
        .find(r => r.includes('❯') && /\d\.\s/.test(r))

      if (pointed !== undefined && /\bNo\b/.test(pointed)) break
      await s.key('down')
    }
    await s.key('tab')
    await s.type('keep it')
    three.keep(await s.capture('step3-comment'))
    await s.key('enter')
    const after = three.keep(await waitIdle(s, three, false).then(async () => s.capture('step3-denied')))
    const denied = rowsMatching(leftRows(after), /▍ {2}DENIED/)

    three.expect('a `▍  DENIED` row', denied.length > 0, quote(denied))
    three.expect(
      '10. the denied step`s subject is project-relative: no `-LiteralPath`, no `D:\\…`',
      !denied.some(r => /LiteralPath|[A-Z]:\\/.test(r.text)),
      quote(denied)
    )
    if (layoutOf(after).pane === undefined) noPane(three, '10. the pane`s denied row is `▍ … denied`', cols)
    else {
      const row = timelineRows(after).find(r => r.glyph === '▍')

      three.expect('10. the pane`s denied row is `▍ … denied`', row?.glyph === '▍' && row.result === 'denied', row?.text.trim() ?? '(no row)')
    }
    const said = rowsMatching([...leftRows(after), ...paneRows(after)], /keep it/)

    three.note('does “keep it” appear anywhere on screen', said.length > 0 ? `yes: ${quote(said)}` : 'no')
  }
}

/** Steps 4 and 11: a blocked push, then /cockpit closes and docks the pane. */
const blocked: Suite = {
  id: 'D',
  widths: [200, 100],
  steps: ['4', '11'],
  async run(s, stepOf, cols) {
    const four = stepOf('4')
    const cap = four.keep(await turn(s, four, 'remember that I prefer bun, then run git push').then(async () => s.capture('step4-turn')))
    const row = rowsMatching(leftRows(cap), /⊘ {2}BLOCKED {3}by a hook · guard-main\.ps1 · \S/)

    four.expect('`⊘  BLOCKED   by a hook · guard-main.ps1 · <message>`', row.length > 0, quote(rowsMatching(leftRows(cap), /BLOCKED/)))
    four.expect('the receipt counts `1 blocked`', /1 blocked/.test(receipts(cap).at(-1)?.text ?? ''), receipts(cap).at(-1)?.text ?? '(none)')
    four.note('the `└ instead` line', quote(rowsMatching(leftRows(cap), /└ instead/)))

    const eleven = stepOf('11')

    if (cols < 144) {
      noPane(eleven, '/cockpit closes and docks the pane', cols)

      return
    }
    const closed = eleven.keep(await slash(s, '/cockpit', /\/cockpit {3}Pane (closed|docked|not placed)/).then(async () => s.capture('step11-closed')))

    eleven.expect(
      '`✓  /cockpit   Pane closed`',
      rowsMatching(leftRows(closed), /✓ {2}\/cockpit {3}Pane closed/).length > 0,
      quote(rowsMatching(leftRows(closed), /\/cockpit/))
    )
    eleven.expect('the pane is gone', layoutOf(closed).pane === undefined, layoutOf(closed).pane === undefined ? 'no pane' : 'pane docked')
    const still = rowsMatching(leftRows(closed), /⊘ {2}BLOCKED/)
    const worked = rowsMatching(leftRows(closed), /◇ {2}worked/)

    eleven.expect('the BLOCKED row is still `⊘` after the switch', still.length > 0, `${quote(still)}; worked rows: ${quote(worked)}`)
    const docked = eleven.keep(await slash(s, '/cockpit', /Pane docked · \d+ columns/).then(async () => s.capture('step11-docked')))

    eleven.expect(
      '`✓  /cockpit   Pane docked · 200 columns`',
      rowsMatching(leftRows(docked), /✓ {2}\/cockpit {3}Pane docked · 200 columns/).length > 0,
      quote(rowsMatching(leftRows(docked), /\/cockpit/))
    )
    eleven.expect('the pane is back', layoutOf(docked).pane !== undefined, layoutOf(docked).pane === undefined ? 'no pane' : 'pane docked')
  }
}

/** Step 6: two fetches and an edit; inline code in bold, Files with the hunk in place, Sources. */
const sources: Suite = {
  id: 'E',
  widths: [200, 100],
  steps: ['6'],
  async run(s, stepOf, cols) {
    const six = stepOf('6')
    const cap = six.keep(
      await turn(
        s,
        six,
        'fetch https://bun.sh/docs/cli/test and https://example.com/missing-page, then add a doc comment to src/width.ts citing the first'
      ).then(async () => s.capture('step6-turn'))
    )
    const ticks = rowsMatching(leftRows(cap), /`https?:\/\//)

    six.expect('no backtick left around a URL on the left', ticks.length === 0, quote(ticks))
    const urlRow = leftRows(cap).findIndex(r => r.includes('bun.sh/docs/cli/test'))

    if (urlRow >= 0) {
      const x = leftRows(cap)[urlRow]?.indexOf('bun.sh') ?? 0
      const cell = at(cap, urlRow, x)

      six.note('the URL on the left: bold, colour', `bold ${cell.bold}, fg ${cell.fg} (textBright is ${colourIs(cell, 'token.textBright')})`)
    } else six.note('the URL on the left', 'the answer does not show it')
    if (cols < 144) {
      for (const check of ['Files', 'Sources', '4. the source title']) noPane(six, check, cols)

      return
    }
    await focusPane(s)
    await s.key('2')
    await s.key('tab')
    const files = six.keep(await s.waitSettled(() => true, 5000, 'files').then(async () => s.capture('step6-files')))
    const hunk = rowsMatching(paneRows(files), /@@ .*@@/)

    six.expect('Files: the selected file’s first hunk opens under it (`@@ … @@`)', hunk.length > 0, quote(rowsMatching(paneRows(files), /\S/), 8))
    six.expect(
      '13. no file named `@` (a here-string`s body)',
      !paneRows(files).some(r => /^ {3,4}@ /.test(r)),
      quote(rowsMatching(paneRows(files), /files? changed|^ {3,4}\S/), 4)
    )
    await s.key('enter')
    const diff = six.keep(await s.waitSettled(() => true, 5000, 'diff').then(async () => s.capture('step6-full-diff')))

    six.expect('enter opens the full diff (`+n · n hunk`)', rowsMatching(paneRows(diff), /hunks?\b/).length > 0, quote(rowsMatching(paneRows(diff), /\S/), 4))
    await s.key('b')
    const backed = six.keep(await s.waitSettled(() => true, 5000, 'back').then(async () => s.capture('step6-back')))

    six.expect('b goes back to the file list', rowsMatching(paneRows(backed), /files? changed/).length > 0, quote(rowsMatching(paneRows(backed), /\S/), 3))
    await s.key('3')
    const src = six.keep(await s.waitSettled(() => true, 5000, 'sources').then(async () => s.capture('step6-sources')))
    const summary = rowsMatching(paneRows(src), /\d+ pages? read/)

    six.expect('Sources summary `n pages read · n cited · n failed`', summary.length > 0, quote(summary))
    const bun = rowsMatching(paneRows(src), /bun\.sh {3}\S/)

    six.expect(
      '4, 6a. the bun.sh page`s title is the fetch`s own (`Test runner`), never `bun.sh · …` or its host and path',
      bun.length > 0 && !bun.some(r => /bun\.sh · |bun\.sh {3}bun\.sh\//.test(r.text)),
      quote(bun)
    )
    const listed = rowsMatching(paneRows(src), /^ {2}[▐ ][·¹²³⁴] \S/).map(r => /[·¹²³⁴] (\S+)/.exec(r.text)?.[1] ?? '')
    const cited = Number(/(\d+) cited/.exec(summary[0]?.text ?? '')?.[1] ?? '-1')

    six.expect(
      '6b. nothing cited: no `cited pages first` line, the pages in fetch order (bun.sh, then example.com)',
      cited !== 0 || (rowsMatching(paneRows(src), /cited pages first/).length === 0 && listed.join(' ') === 'bun.sh example.com'),
      `${cited} cited · ${listed.join(', ')} · ${quote(rowsMatching(paneRows(src), /cited pages first/))}`
    )
    const pane = layoutOf(src).pane
    const fourOhFour = pane === undefined ? -1 : paneRows(src).findIndex(r => /\b404\s*$/.test(r))
    const cell404 =
      pane === undefined || fourOhFour < 0 ? undefined : at(src, pane.y0 + fourOhFour, pane.x0 + (paneRows(src)[fourOhFour]?.lastIndexOf('404') ?? 0))

    six.expect('the 404 is in `err`', cell404 !== undefined && colourIs(cell404, 'token.err'), cell404 === undefined ? 'no 404 row' : `fg ${cell404.fg}`)
    await s.key('u')
    const hidden = six.keep(await s.waitSettled(() => true, 5000, 'urls').then(async () => s.capture('step6-sources-u')))
    const urls = (c: Capture): number => rowsMatching(paneRows(c), /^\s{4,}https?:\/\//).length

    six.expect('u toggles the URLs', urls(src) !== urls(hidden), `URL rows ${urls(src)} → ${urls(hidden)}`)
  }
}

/** Step 7: three agents; one receipt for the whole turn, the waiting line, the Agents tab, an agent in view. */
const agents: Suite = {
  id: 'F',
  widths: [200, 100],
  steps: ['7'],
  async run(s, stepOf, cols) {
    const seven = stepOf('7')

    await startTurn(s, 'launch three agents in parallel: one audits src, one audits the tests, one audits package.json')
    const live = await s.waitFor(c => /◇◇◇|● LIVE/.test(textOf(c)), 120_000, 'the agents running').catch(() => undefined)

    if (live !== undefined) seven.keep(await s.capture('step7-live'))
    const waiting = await s.waitFor(c => /Waiting on \d+ agents?/.test(textOf(c)) || hasReceipt(c), 900_000, 'the waiting line or the receipt')

    if (/Waiting on \d+ agents?/.test(textOf(waiting))) {
      const cap = seven.keep(await s.capture('step7-waiting'))
      const left = rowsMatching(leftRows(cap), /Waiting on \d+ agents?/)

      seven.expect('after the first answer: no receipt yet', !hasReceipt(cap), receipts(cap).at(-1)?.text ?? '(none)')
      if (layoutOf(cap).pane === undefined) {
        // Decision A, no pane: one line in the band above the prompt.
        const band = rowsMatching(allRows(cap), /◇+ {2}Waiting on \d+ agents?/)

        seven.expect('A. no pane: the band above the prompt says `◇◇◇  Waiting on n agents`', band.length === 1, quote(band))
      } else {
        const head = rowsMatching(paneRows(cap), /Waiting on \d+ agents?/)

        seven.expect('A. docked: the left stays quiet', left.length === 0, quote(left))
        seven.expect('A. docked: the pane head says `Waiting on n agents`', head.length > 0, quote(head))
        seven.expect('3. while agents run after the answer, the pill is `● LIVE`', pillOf(cap)?.word === 'LIVE', `pill: ${pillOf(cap)?.word ?? '(none)'}`)
      }
    } else seven.note('the waiting line', 'the receipt drew without a wait: the agents ran in the foreground, so there was no waiting to see')
    const end = seven.keep(await waitIdle(s, seven).then(async () => s.capture('step7-end')))
    const from = headers(end).at(-1)?.y ?? 0
    const mine = receipts(end).filter(r => r.y > from)

    seven.expect('exactly one receipt for the turn', mine.length === 1, quote(mine))
    seven.expect('the receipt counts `3 agents`', /3 agents/.test(mine[0]?.text ?? ''), mine[0]?.text ?? '(none)')
    const launch = timelineRows(end).filter(r => r.glyph === '◇')

    seven.note('the launch row in the pane', quote(launch.map(r => r.text)))
    if (cols < 144) {
      for (const check of ['the Agents tab', '16. launched together', '17. the agent view']) noPane(seven, check, cols)

      return
    }
    await focusPane(s)
    await s.key('5')
    const tab = seven.keep(await s.waitSettled(() => true, 5000, 'agents').then(async () => s.capture('step7-agents-tab')))
    const reported = rowsMatching(paneRows(tab), /✓ reported · \d+ steps?\s+done/)

    seven.expect('each agent reads `✓ reported · n steps   done`', reported.length === 3, quote(reported))
    seven.expect(
      '16. one message`s agents: `launched together at HH:MM:SS`',
      rowsMatching(paneRows(tab), /launched together at \d\d:\d\d:\d\d/).length === 1,
      quote(rowsMatching(paneRows(tab), /launched/))
    )
    await s.key('tab')
    await s.key('enter')
    const view = seven.keep(await s.waitSettled(() => true, 8000, 'agent view').then(async () => s.capture('step7-agent-view')))

    seven.expect('enter on an agent row shows the AGENT pill', pillOf(view)?.word === 'AGENT', `pill: ${pillOf(view)?.word ?? '(none)'}`)
    const own = timelineRows(view)
    const pane = layoutOf(view).pane
    const headRow = pane === undefined ? -1 : paneRows(view).findIndex(r => /▐ ◇ AGENT ▌/.test(r))
    const doneAt = headRow < 0 || pane === undefined ? -1 : (paneRows(view)[headRow]?.search(/done · /) ?? -1)
    const doneCell = doneAt < 0 || pane === undefined ? undefined : at(view, pane.y0 + headRow, pane.x0 + doneAt)

    seven.expect(
      '17. the agent`s steps read 5.7 results, at most 14 cells',
      own.every(r => widthOf(r.result) <= 14 && !/---|^\{/.test(r.result)),
      own.map(r => r.result).join(' | ') || '(no steps)'
    )
    seven.expect(
      '17. the head`s `done` is ok-coloured',
      doneCell === undefined || colourIs(doneCell, 'token.ok'),
      doneCell === undefined ? 'still running' : `fg ${doneCell.fg}`
    )
    await s.key('m')
    const main = seven.keep(await s.waitSettled(() => true, 8000, 'main').then(async () => s.capture('step7-main')))

    seven.expect('m goes back to main', pillOf(main)?.word !== 'AGENT', `pill: ${pillOf(main)?.word ?? '(none)'}`)
  }
}

/** Step 8: an interrupted turn, then the next turn's interrupted line. */
const interrupted: Suite = {
  id: 'G',
  widths: [200, 100],
  steps: ['8'],
  async run(s, stepOf) {
    const eight = stepOf('8')

    await startTurn(s, 'rename src/width.test.ts to width.spec.ts and update imports')
    const started = Date.now()

    // Docked, the pane shows the first step; with no pane, Esc goes after a few seconds of work.
    await s.waitFor(c => (layoutOf(c).pane === undefined ? Date.now() - started > 3_000 : timelineRows(c).length > 0), 120_000, 'the first step')
    await s.key('esc')
    const cap = eight.keep(await s.waitSettled(c => /Interrupted/.test(textOf(c)), 60_000, 'the interrupt').then(async () => s.capture('step8-interrupted')))
    const pill = pillOf(cap)

    if (layoutOf(cap).pane === undefined) {
      noPane(eight, 'the pane pill and the interrupted line', 100)

      return
    }

    eight.expect(
      'the pane pill reads `◼ INTERRUPTED`, muted on its pill colour',
      pill?.word === 'INTERRUPTED' && pill.glyph === '◼' && pill.fg?.toUpperCase() === '#7C7C88' && pill.bg?.toUpperCase() === '#1A1A21',
      pill === undefined ? '(no pill)' : `${pill.glyph} ${pill.word} fg ${pill.fg} bg ${pill.bg}`
    )
    const search = timelineRows(cap).filter(r => /search/.test(r.text))

    eight.note('the search row', quote(search.map(r => r.text)))
    const next = eight.keep(await turn(s, eight, 'actually leave the names as they are').then(async () => s.capture('step8-next')))
    const line = rowsMatching(paneRows(next), /TURN \d+ {3}◼ INTERRUPTED after .*\d\d:\d\d:\d\d/)
    const ruler = paneRows(next).findIndex(r => /┬─+┬/.test(r))

    eight.expect('the pane shows the interrupted line above the ruler', line.length > 0 && (ruler < 0 || (line[0]?.y ?? 99) < ruler), quote(line))
  }
}

/** Steps 9 and 12: the flood of failing commands, docked at 200 columns or in fallback at 100. */
function flood(id: string, width: number, stepId: string): Suite {
  return {
    id,
    widths: [width],
    steps: [stepId],
    async run(s, stepOf, cols) {
      const step = stepOf(stepId)
      const cap = step.keep(await turn(s, step, FLOOD).then(async () => s.capture(`step${stepId}-flood`)))
      const left = turnRows(cap)
      const table = left.filter(r => /ls \/nope\d/.test(r) && /cannot access|No such/.test(r))

      if (table.length === 0) step.note('1. the table', 'Claude wrote no table this time')
      else {
        const head = left.find(r => /#\s+Command/.test(r)) ?? ''

        step.expect(
          '1. the table: `#` right-aligned in its own width, 3 cells before Command; no `1ls`',
          /# {3}Command/.test(head) && !table.some(r => /\dls \//.test(r)) && table.every(r => /\d {3}ls \//.test(r)),
          quote([head, ...table], 3)
        )
      }

      if (cols >= 144) {
        step.expect('one `× 5 still failing` card', rowsMatching(left, /× 5 still failing/).length === 1, quote(rowsMatching(left, /still failing/)))
        step.expect('the card ends `+ 3 more · /steps n`', rowsMatching(left, /\+ 3 more · \/steps \d+/).length === 1, quote(rowsMatching(left, /more ·/)))
        // The timeline's rows are groups (8.3): one sentence of Claude's holds its steps. Every step (8.11) is one per row.
        await focusPane(s)
        await s.key('s')
        const all = step.keep(
          await s.waitSettled(c => /ALL STEPS/.test(textOf(c)), 10_000, 'every step').then(async () => s.capture(`step${stepId}-every-step`))
        )
        const failed = paneRows(all).flatMap(r => {
          const m = /^\s*× +(?:shell|test) +ls \/nope\d\S*\s.*?(exit \d+)/.exec(r)

          return m === null ? [] : [{ text: r, result: m[1] ?? '' }]
        })
        const results = new Set(failed.map(r => r.result))

        step.expect(
          'the pane’s every-step view (s): six × rows, one per `ls`, the same exit result',
          failed.length === 6 && results.size === 1 && /^exit \d+$/.test([...results][0] ?? ''),
          `${failed.length} rows: ${quote(
            failed.map(r => r.text),
            6
          )}`
        )
      } else {
        const crosses = rowsMatching(left, /× {2}shell {1,2}ls \/nope\d/)
        const details = rowsMatching(left, /└ /)

        step.expect(
          'three `×  shell ls /nopeN` rows, for /nope1–3',
          crosses.length === 3 && crosses.every((r, i) => r.text.includes(`/nope${i + 1}`)),
          quote(crosses)
        )
        step.expect('a `└` line under each', details.length >= 3, quote(details))
        const more = rowsMatching(left, /\+ 2 more · \/steps \d+/)
        const worked = rowsMatching(left, /◇ {2}worked/)
        const answer = rowsMatching(left, /ls|nope|exit/i).filter(r => !/[×└]/.test(r.text) && !/◇|FAILED|❯/.test(r.text))

        step.expect(
          '3. `+ 2 more · /steps n` directly under the third row`s `└` line, right above `◇ worked`, before the answer',
          more.length === 1 &&
            more[0]?.y === (details[2]?.y ?? -2) + 1 &&
            worked[0]?.y === (more[0]?.y ?? -2) + 1 &&
            answer.every(r => r.y > (more[0]?.y ?? Infinity)),
          quote(rowsMatching(left, /more ·|◇ {2}worked|└ /))
        )
        const wide = left.filter(r => r.slice(16 + 78).trim() !== '')

        step.expect('the text column is 78 cells (nothing past column 94)', wide.length === 0, quote(wide))
        const inspector = step.keep(await slash(s, '/steps', /esc close/).then(async () => s.capture(`step${stepId}-inspector`)))

        step.expect(
          '/steps opens the inline inspector with its key row',
          rowsMatching(textOf(inspector).split('\n'), /STEPS · TURN \d+/).length > 0,
          quote(rowsMatching(textOf(inspector).split('\n'), /STEPS|esc close/))
        )
        await s.key('esc')
        const gone = step.keep(await s.waitSettled(() => true, 5000, 'inspector closed').then(async () => s.capture(`step${stepId}-inspector-closed`)))

        step.expect('esc closes it', !/esc close/.test(textOf(gone)), quote(rowsMatching(textOf(gone).split('\n'), /esc close/)))
      }
    }
  }
}

/** Step 10: a rewind; the next header says `AFTER REWIND`. */
const rewind: Suite = {
  id: 'I',
  widths: [200, 100],
  steps: ['10'],
  async run(s, stepOf, cols) {
    const ten = stepOf('10')

    await turn(s, ten, 'say hi')
    await s.key('esc')
    await s.key('esc')
    ten.keep(await s.waitSettled(c => /Rewind/.test(textOf(c)), 10_000, 'the rewind picker').then(async () => s.capture('step10-picker')))
    // The picker opens on `(current)`; the prompt to rewind to is the row above it.
    await s.key('up')
    await s.key('enter')
    const choice = ten.keep(await s.waitSettled(() => true, 10_000, 'the restore choice').then(async () => s.capture('step10-restore')))

    if (/Restore|conversation/i.test(textOf(choice)) && !/❯\s*$/.test(textOf(choice).split('\n').at(-4) ?? '')) await s.key('enter')
    const rewound = ten.keep(await s.waitSettled(() => true, 10_000, 'the rewind').then(async () => s.capture('step10-rewound')))

    // 18: the rewound turn leaves the pane: no pill for it (nothing remains of a one-turn session).
    if (layoutOf(rewound).pane === undefined) noPane(ten, '18. the pane no longer shows the rewound turn', cols)
    else
      ten.expect(
        '18. the pane no longer shows the rewound turn',
        pillOf(rewound) === undefined,
        `pill: ${pillOf(rewound)?.word ?? '(none)'}; ${quote(rowsMatching(paneRows(rewound), /TURN \d+/))}`
      )
    for (let i = 0; i < 30; i++) await s.key('backspace')
    const cap = ten.keep(await turn(s, ten, 'say hello').then(async () => s.capture('step10-after')))
    const header = rowsMatching(leftRows(cap), /TURN \d+ · AFTER REWIND/)

    ten.expect('the new header reads `TURN n · AFTER REWIND`', header.length > 0, quote(rowsMatching(leftRows(cap), /TURN \d+/)))
    ten.expect(
      '18. the turn after the rewind takes its number again: `TURN 1 · AFTER REWIND`',
      rowsMatching(leftRows(cap), /TURN 1 · AFTER REWIND/).length > 0,
      quote(header)
    )
  }
}

/** Every suite, in run order. */
export const SUITES: Suite[] = [fixAndCommit, failingTest, denial, blocked, sources, agents, interrupted, flood('H', 200, '9'), rewind, flood('J', 100, '12')]
