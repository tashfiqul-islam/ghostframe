import { expect, test } from 'claude-code/testing'

import { ON, PANE, T0, VIEW } from '../support/cockpit'
import { text, use } from '../support/docked'
import type { Engine, On } from '../support/engine'
import { respond } from '../support/respond'

// Phase 6: [ TODO ], [ FILES ] and [ SOURCES ] from the main loop's calls, through the real hooks.
const URLS = ['https://docs.github.com/en/actions/workflow-syntax', 'https://bun.sh/docs/cli/publish', 'https://docs.sigstore.dev/cosign/overview/']
const ANSWER = `Pin the workflow syntax [Workflow syntax](${URLS[0]}) and publish with [bun publish](${URLS[1]}).`

function engine(on: On, clock: { now: number }) {
  on('clock.now', () => ({ value: clock.now }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('agent.list', () => ({ value: [] as never }))
  on('tool.call', (_, e) => {
    clock.now += 1_000
    const i = e as unknown as Record<string, unknown>

    switch (e.tool) {
      case 'TaskCreate':
        return { result: { task: { id: String(i['subject']).slice(0, 1), subject: i['subject'] } }, text: 'ok' }
      case 'Edit':
        return { result: { structuredPatch: [{ lines: ['+a', '+b', '-c'] }] }, text: 'ok' }
      case 'Write':
        return { result: { type: 'create', content: 'x\ny\n', structuredPatch: [] }, text: 'ok' }
      case 'WebFetch':
        return i['url'] === URLS[2]
          ? { result: 'Request failed with status code 404', isError: true, text: 'Request failed with status code 404' }
          : { result: { url: i['url'], code: 200 }, text: 'ok' }
      default:
        return { result: {}, text: 'ok' }
    }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
}

const call = ($: Engine, tool: string, id: string, input: Record<string, unknown>) => $.tool.call({ tool, ...input, tool_use_id: id } as never)

async function paneText($: Engine): Promise<string[]> {
  const ui = await $.ui.mount(PANE)
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.trim().length > 0 && !t.includes('\n'))
  await ui.unmount()

  return [...new Set(rows)]
}

test('a turn`s to-dos, files and pages reach the pane; the answer`s marks match the left`s Sources frame', ON, async ($, on) => {
  const clock = { now: T0 }
  engine(on, clock)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await $.prompt.submit({ text: 'ship it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'ship it', turnId: 't1' })

  await call($, 'TaskCreate', 'k1', { subject: 'Audit the workflow', description: 'x' })
  await call($, 'TaskCreate', 'k2', { subject: 'Bump the runner', description: 'x' })
  await call($, 'TaskUpdate', 'k3', { taskId: 'A', status: 'in_progress' })
  await $.session.append(respond([use('f1', 'WebFetch', {}), use('f2', 'WebFetch', {}), use('f3', 'WebFetch', {})], 'm1'))

  for (const [n, url] of URLS.entries()) await call($, 'WebFetch', `f${n + 1}`, { url, prompt: 'x' })

  await call($, 'Edit', 'e1', { file_path: '/repo/.github/workflows/ci.yml', old_string: 'a', new_string: 'b' })
  await call($, 'Write', 'w1', { file_path: '/repo/docs/RELEASE.md', content: 'x\ny\n' })
  await call($, 'TaskUpdate', 'k4', { taskId: 'A', status: 'completed' })

  // While the turn runs: pages in fetch order, unmarked.
  let rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ TODO \] ┄+ 1 of 2 done$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}\[x\] Audit the workflow/))
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ FILES \] ┄+ 2 changed · \+4 −1$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}\.github\/workflows\/ci\.yml +\+2 {4}−1$/))
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}docs\/RELEASE\.md +new {4}\+2 {6}$/))
  expect(rows).toContainEqual(expect.stringMatching(/^┄ \[ SOURCES \] ┄+ 3 read · 0 cited$/))
  expect(rows.filter(r => /^ {2}[·¹²³] /.test(r)).map(r => r.slice(2, 4))).toEqual(['· ', '· ', '· '])
  expect(rows).toContainEqual(expect.stringMatching(/^ {2}· docs\.sigstore\.dev .* 404$/))

  // The answer cites two; the turn ends: those come first, marked as the answer marks them.
  await $.session.append(respond([text(ANSWER)], 'm2'))
  clock.now += 1_000
  await $.turn.complete({ answer: 'x', durationMs: 9_000, isAborted: false, turnId: 't1', reason: 'answer' })
  rows = await paneText($)
  expect(rows).toContainEqual(expect.stringMatching(/ 3 read · 2 cited$/))
  expect(rows.filter(r => /^ {2}[·¹²³] /.test(r)).map(r => r.slice(0, 20))).toEqual(['  ¹ docs.github.com ', '  ² bun.sh  bun publ', '  · docs.sigstore.de'])

  // The left numbers the same pages the same way: the prose marks and its Sources frame.
  const left = await $.ui.mount({
    plugin: 'ghostframe',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: VIEW,
    props: { text: ANSWER, isFirstOfReply: true }
  })
  const drawn = (await left.findAll({ type: 'Text' })).map(t => t.text)
  await left.unmount()
  expect(drawn).toContainEqual(expect.stringMatching(/Workflow syntax¹ and publish with bun publish²/))
  expect(drawn).toContainEqual(expect.stringMatching(/^┆ 1 {2}Workflow syntax {2}docs\.github\.com/))
  expect(drawn).toContainEqual(expect.stringMatching(/^┆ 2 {2}bun publish {6}bun\.sh/))

  // The next typed turn: files and pages start over; the list, not all done, stays.
  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'next', turnId: 't2' })
  rows = await paneText($)
  expect(rows.some(r => /FILES|SOURCES/.test(r))).toBe(false)
  expect(rows).toContainEqual(expect.stringMatching(/\[ TODO \] ┄+ 1 of 2 done$/))
})
