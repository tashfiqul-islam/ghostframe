import { expect, mock, test } from 'claude-code/testing'

import { ON, PANE, T0, posixPath } from '../support/cockpit'
import { holdTimers } from '../support/clock'

// A turn that writes four files: two Writes outside the project (the home folder, a temp folder), a shell's write to a
// temp folder, and a Write in the project. Each is a row that names its file; only the project's has counts and a bar.
for (const body of [60, 90]) {
  test(`${body} pane columns: every written file is a row naming its file; outside ones say so, with no bar`, ON, async ($, on) => {
    let now = T0
    on('clock.now', () => ({ value: now }))
    holdTimers(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.log', () => ({ value: undefined }))
    on('session.id', () => ({ value: 's' }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('session.messages', () => ({ value: [] }))
    on('session.info', () => ({ value: { platform: 'windows' } as never }))
    on('command.register', (_, e) => ({ value: { command: e.name } }))
    on('store.keys', () => ({ value: [] }))
    on('store.get', () => ({ value: undefined }))
    on('store.set', () => ({ value: undefined }))
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.complete', (_, e) => ({ text: e.answer }))
    on('agent.list', () => ({ value: [] as never }))
    mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
    on('tool.call', (_, e) => {
      now += 1_000

      return e.tool === 'Write'
        ? { result: { type: 'create', content: 'x\n', structuredPatch: [] }, text: 'ok' }
        : { result: { stdout: '', stderr: '' }, text: 'ok' }
    })
    on('process.run', (_, e) => {
      const argv = e.argv.join(' ')

      if (argv === 'git rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: 'D:/repo\n', stderr: '' } } as never
      if (argv === 'git rev-parse --show-prefix') return { value: { exitCode: 0, stdout: '\n', stderr: '' } } as never
      if (argv === 'git rev-parse --verify --quiet HEAD') return { value: { exitCode: 0, stdout: 'f00d\n', stderr: '' } } as never

      return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
    })
    on('fs.stat', (_, e) => ({ value: { kind: 'file', size: 2, mtimeMs: 0, isLink: false, realPath: posixPath(e.path) } }))
    on('fs.read', () => ({ value: 'x\n' }))
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    await $.session.start({ cwd: 'D:\\repo', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.tool.call({
      tool: 'Write',
      file_path: 'C:\\Users\\me\\.claude\\projects\\D--Projects-ghostframe\\memory\\verify-against-spec.md',
      content: 'x\n',
      tool_use_id: 'w1'
    } as never)
    await $.tool.call({
      tool: 'Write',
      file_path: 'C:\\Users\\me\\AppData\\Local\\Temp\\claude\\fb019\\58b98\\scratchpad\\band-block.ts',
      content: 'x\n',
      tool_use_id: 'w2'
    } as never)
    await $.tool.call({ tool: 'Bash', command: `printf 'x\\n' > ~/AppData/Local/Temp/claude/fb019/58b98/scratchpad/notes.txt`, tool_use_id: 'b1' } as never)
    await $.tool.call({ tool: 'Write', file_path: 'D:\\repo\\hooks\\cockpit\\band.tsx', content: 'x\n', tool_use_id: 'w3' } as never)
    await $.turn.complete({ answer: 'x', durationMs: 3_000, isAborted: false, turnId: 't1', reason: 'answer' })
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true, bodyColumns: body } })
    await ui.press({ key: 'key-2' })
    await ui.redraw()
    const rows = (await ui.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate').map(t => t.text)
    await ui.unmount()
    const fileRows = rows.filter(r => /^ {4}\S/.test(r))

    expect(rows).toContainEqual(expect.stringMatching(/FILES 4 /))
    expect(fileRows).toHaveLength(4)
    for (const name of ['verify-against-spec.md', 'band-block.ts', 'notes.txt', 'band.tsx']) expect(fileRows.some(r => r.includes(name))).toBe(true)
    expect(fileRows.filter(r => /outside\s*$/.test(r))).toHaveLength(3)
    expect(fileRows.filter(r => r.includes('■'))).toHaveLength(1)
  })
}
