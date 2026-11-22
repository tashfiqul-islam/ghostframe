// Cockpit with no pane docked (spec E.3, E.47): the engine's side of a fallback session, the sites as it raises them
// at a given width, and one turn of every kind of step: a shell call, an edit, a fetch, a failing command and an
// agent launch, then the answer.
import type { Engine, On } from './engine'
import { text, use } from './docked'
import { respond } from './respond'

export type Clock = { now: number }

/** A value a test needs to be there: it fails the test at once when it is not. */
export function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value, got undefined')

  return value
}

/** A fullscreen terminal this wide, as each transcript site's viewport says it. */
export const view = (columns: number) => ({ columns, rows: 50, isFullscreen: true })

type Result = { result?: unknown; text?: string; isError?: true }

const FAIL_TEXT = "Exit code 2\nls: cannot access '/nope': No such file or directory"

/** What each call of `mixedTurn` returns, and how long it takes. */
const RESULTS: Record<string, [Result, number]> = {
  Bash: [{ result: { stdout: 'hi\n', stderr: '' }, text: 'hi' }, 1_000],
  Edit: [{ result: { structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+a', '+b'] }] }, text: 'ok' }, 2_000],
  WebFetch: [{ result: { code: 200, bytes: 1_256, url: 'https://example.com/' }, text: 'Example Domain' }, 3_000],
  Fail: [{ isError: true, text: FAIL_TEXT, result: FAIL_TEXT }, 1_000],
  Agent: [{ result: { status: 'completed', content: [{ type: 'text', text: 'two files' }] }, text: 'two files' }, 9_000]
}

/**
 * The engine's side: the clock, every call's result (the failing one by its command), an engine drawing under every
 * site, and the pane's open, close and list.
 * @param on the test's `on`
 * @param clock the clock the calls move on
 * @param placed whether the engine places the pane (docks it) when it is opened
 * @returns what was opened, for a test to read
 */
export function fallbackEngine(on: On, clock: Clock, placed = false): { opened: Record<string, unknown>[] } {
  const opened: Record<string, unknown>[] = []
  let isPlaced = false
  on('clock.now', () => ({ value: clock.now }))
  on('ui.open', (_, e) => {
    opened.push({ ...e })
    isPlaced = placed

    return { value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'unasked below 144 columns' } }
  })
  on('ui.close', () => {
    isPlaced = false

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: isPlaced ? [{ id: 'cockpit', title: 'cockpit', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('agent.list', () => ({ value: [] as never }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('tool.call', (_, e) => {
    const command = (e as { command?: string }).command ?? ''
    const [result, ms] = RESULTS[command.startsWith('ls /nope') ? 'Fail' : e.tool] ?? [{ result: {} }, 1_000]
    clock.now += ms

    return result
  })

  return { opened }
}

/** The calls of `mixedTurn`, as the engine's tool group carries each. */
export const MIXED = (n: number) => [
  { id: `sh${n}`, tool: 'Bash', input: { command: 'echo hi' } },
  { id: `ed${n}`, tool: 'Edit', input: { file_path: 'src/a.ts', old_string: 'a', new_string: 'a\nb' } },
  { id: `fe${n}`, tool: 'WebFetch', input: { url: 'https://example.com/', prompt: 'title' } },
  { id: `ls${n}`, tool: 'Bash', input: { command: 'ls /nope' } },
  { id: `ag${n}`, tool: 'Agent', input: { description: 'Count files', prompt: 'count', subagent_type: 'Explore' } }
]

export const answerOf = (n: number) => `Turn ${n}: the shell said hi, the edit landed, the page loaded, ls failed, the agent counted two files.`

/**
 * One turn of every kind of step, ending in an answer: prompt, the calls one by one (each announced by narration),
 * the answer, the turn's end. 16s of calls on Cockpit's clock.
 * @param $ the engine
 * @param clock the clock
 * @param n the turn's number, for its ids
 */
export async function mixedTurn($: Engine, clock: Clock, n: number): Promise<void> {
  const prompt = `run every kind of step, turn ${n}`
  await $.prompt.submit({ text: prompt, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: prompt, turnId: `turn${n}` })

  for (const c of MIXED(n)) {
    await $.session.append(respond([text(`Next, ${c.tool} for turn ${n}.`), use(c.id, c.tool, c.input)], `m${n}-${c.id}`))
    await $.tool.call({ tool: c.tool, ...c.input, tool_use_id: c.id } as never)
  }

  await $.session.append(respond([text(answerOf(n))], `m${n}-answer`))
  clock.now += 1_000
  await $.turn.complete({ answer: answerOf(n), durationMs: 17_000, isAborted: false, turnId: `turn${n}`, reason: 'answer' })
}

/** A site as the engine raises it, at a width. */
export const site = (component: string, requestId: string, columns: number, props: Record<string, unknown>) =>
  ({ plugin: 'ghostframe', surface: 'terminal', component, requestId, viewport: view(columns), props }) as never

/** A turn's tool group, one call, settled as the engine carries it. */
export const groupOf = (c: { id: string; tool: string; input: Record<string, unknown> }, columns: number, isErrored = false) =>
  site('ToolGroup', `g-${c.id}`, columns, {
    calls: [{ tool_use_id: c.id, tool: c.tool, input: c.input, isRunning: false, isErrored, isInterrupted: false, output: {} }],
    isActive: false,
    isExpanded: false,
    isCallsOnly: true
  })

/**
 * The rows a site draws: each row is one Text whose parts are Texts inside it, so a row is a Text holding others.
 * @param $ the engine
 * @param raised the site
 * @returns the rows' texts, blank ones left out
 */
export async function rowsOf($: Engine, raised: Parameters<Engine['ui']['mount']>[0]): Promise<string[]> {
  const ui = await $.ui.mount(raised)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()

  // A row's Text holds its parts' Texts: keep the outer ones (a part's text is inside its row's).
  return texts.filter((t, i) => t.trim().length > 0 && !texts.slice(0, i).some(o => o !== t && o.includes(t)))
}
