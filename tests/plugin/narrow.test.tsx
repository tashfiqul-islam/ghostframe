import { expect, test } from 'claude-code/testing'

import { INSET } from '../../hooks/shared/layout'
import { vw } from '../../hooks/shared/text'
import { WIDTHS, rows } from '../support/narrow'
import { respond } from '../support/respond'
import { OFF } from '../support/cockpit'

for (const columns of WIDTHS) {
  test(`at ${columns} columns: captions above blocks, no row wider than the screen`, OFF, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('tool.call', () => ({ result: { stdout: ' 145 pass\n 3 fail', stderr: '', interrupted: false } }))
    const VIEW = { columns, rows: 40 }
    const w = columns - INSET

    await $.session.append({
      message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'run the tests' }] },
      door: 'prompt',
      origin: { kind: 'composer' },
      uuid: 'p'
    } as never)
    await $.turn.start({ text: 'run the tests', turnId: 't1' })
    await $.session.append(
      respond([{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'claude plugin test .', description: 'Run the plugin tests' } }], 'r1')
    )
    await $.tool.call({ tool: 'Bash', command: 'claude plugin test .', description: 'Run the plugin tests', tool_use_id: 'b1' } as never)

    // Your message: `you` on its own caption line, the text inset 2.
    const you = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'UserMessage',
      viewport: VIEW,
      props: {
        text: 'Run the tests and tell me which fail, with a long enough line to wrap at fifty columns.',
        origin: { kind: 'composer' },
        isExpanded: false
      }
    })
    expect(await you.find({ type: 'Text', text: /^you$/ })).toBeDefined()
    expect((await you.findAll({ type: 'Box' })).some(b => b.props['paddingLeft'] === INSET)).toBe(true)
    const youRows = await rows(you)
    expect(youRows.length).toBeGreaterThan(0)
    for (const l of youRows) expect(vw(l)).toBeLessThanOrEqual(w)
    await you.unmount()

    // The step row and its card.
    const row = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolUse',
      viewport: VIEW,
      props: {
        tool_use_id: 'b1',
        tool: 'Bash',
        input: { command: 'claude plugin test .', description: 'Run the plugin tests' },
        isRunning: false,
        isErrored: true,
        isInterrupted: false,
        output: 'Exit code 1\n 145 pass\n 3 fail'
      }
    })
    expect(await row.find({ type: 'Text', text: /^claude$/ })).toBeDefined()
    const stepRows = await rows(row)
    expect(stepRows.length).toBeGreaterThan(0)
    for (const l of stepRows) expect(vw(l)).toBeLessThanOrEqual(w)
    await row.unmount()

    const card = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'ToolResult',
      viewport: VIEW,
      props: { tool_use_id: 'b1', tool: 'Bash', isErrored: true, output: 'Exit code 1' }
    })
    const cardRows = (await rows(card)).filter(l => /^[+┆]/.test(l))
    expect(cardRows.length).toBeGreaterThan(3)
    for (const l of cardRows) expect(vw(l)).toBe(w)
    await card.unmount()

    // Prose with a list, chips and footnotes; a table too wide for the screen.
    const reply = [
      'Three fail; the cause is the `timeoutMs`, see https://bun.com/docs/test/runtime-behavior.',
      '',
      '**Failing**',
      '- `a reply taller than the window`: times out at 5 s under load (https://github.com/anthropics/claude-code/issues/108931)',
      '  - only under CPU load',
      '',
      '| Test | File | Time | Cause | Fix | Owner |',
      '|---|---|---|---|---|---|',
      '| stream | stream-stable.test.tsx | 5.1 s | timeout | timeoutMs | me |'
    ].join('\n')
    await $.session.append(respond([{ type: 'text', text: reply }], 'r2'))
    const prose = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: VIEW,
      props: { text: reply, isFirstOfReply: true }
    })
    expect(await prose.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
    const lines = await rows(prose)
    for (const l of lines) expect(vw(l)).toBeLessThanOrEqual(w)
    expect(lines.some(l => l.startsWith('┄┄┄┄ ¹'))).toBe(true)
    expect(lines.join('\n')).not.toContain('https://')
    if (columns === 50) expect(lines.some(l => /columns? hidden/.test(l))).toBe(true)
    await prose.unmount()
  })
}
