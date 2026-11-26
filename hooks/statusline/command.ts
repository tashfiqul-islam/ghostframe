// `/ghostframe-statusline install | uninstall | status`: puts ghostframe's status line in the user settings, or takes
// it out. A plugin cannot ship a status line (Claude Code reads `statusLine` from settings files only), so this
// command writes it, and never silently: it shows the exact diff, asks, backs up settings.json, and changes only the
// `statusLine` entry. Uninstall restores the entry that was there before. The bundled script lives in
// <config>/ghostframe/; a personal script elsewhere is never touched.
import type { EngineInterface, Register } from 'claude-code'

import { isRecord } from '../shared/calls/fields'
import { entryOf, planOf } from './settings'
import type { StatusLineEntry } from './settings'

type On = Parameters<Register>[0]

/** The command's name: `/ghostframe-statusline` (a plugin may not take the built-in `/statusline`). */
export const COMMAND = 'ghostframe-statusline'

/** The part of a command path that marks the entry as ghostframe's own. */
const OURS = '/ghostframe/statusline.js'

type Paths = { config: string; settings: string; dir: string; script: string; previous: string }

// A transcript row holds one line, and the engine already labels it with the plugin's name: control characters become
// spaces (a newline drew as "�" live), and no text of ours starts with "ghostframe:".
// oxlint-disable-next-line no-control-regex -- control characters are what it removes
const CONTROL = /[\u0000-\u001f\u007f]+/g
const flat = (text: string): string => text.replaceAll(CONTROL, ' ').trim()

/**
 * Logs text to the transcript, one dim row per line: a diff keeps its `-` and `+` prefixes and its indent.
 * @param $ the engine interface
 * @param text the text, of any number of lines
 */
function say($: EngineInterface, text: string): void {
  for (const line of text.split(/\r?\n/)) {
    const notice = line.replaceAll('\t', '  ').replaceAll(CONTROL, ' ').trimEnd() || ' '

    $.ui.log(notice)
  }
}

/** Asks the person to approve a change; true to write it. */
export type Confirm = (question: string) => Promise<boolean>

/**
 * The engine's own question dialog: Write it or Cancel. Dismissed counts as Cancel.
 * @param $ the engine interface
 * @returns the confirm step
 */
export const askPerson =
  ($: EngineInterface): Confirm =>
  async question => {
    try {
      return (await $.ui.ask(question, ['Write it', 'Cancel'])) === 'Write it'
    } catch {
      return false
    }
  }

async function pathsOf($: EngineInterface): Promise<Paths> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home === undefined ? undefined : `${home}/.claude`)

  if (config === undefined) throw new Error('neither CLAUDE_CONFIG_DIR, USERPROFILE nor HOME is set')

  const dir = `${config.replaceAll('\\', '/')}/ghostframe`

  return { config, settings: `${config}/settings.json`, dir, script: `${dir}/statusline.js`, previous: `${dir}/statusline-previous.json` }
}

// A statusLine entry as Claude Code takes it: a command entry with its command line.
const isEntry = (e: unknown): e is StatusLineEntry => isRecord(e) && e['type'] === 'command' && typeof e['command'] === 'string'

const isOurs = (e: unknown): boolean => isRecord(e) && typeof e['command'] === 'string' && e['command'].includes(OURS)

async function readSettings($: EngineInterface, p: Paths): Promise<string> {
  return (await $.fs.exists(p.settings)) ? await $.fs.read(p.settings) : '{}\n'
}

const currentOf = (text: string): unknown => {
  const s: unknown = JSON.parse(text)

  return isRecord(s) ? (s['statusLine'] ?? null) : null
}

async function hasBun($: EngineInterface): Promise<boolean> {
  try {
    return (await $.process.run(['bun', '--version'])).exitCode === 0
  } catch {
    return false
  }
}

// Shows the diff, asks, backs up settings.json and writes the new text. Answers what happened.
async function apply($: EngineInterface, confirm: Confirm, p: Paths, text: string, entry: StatusLineEntry | null, what: string): Promise<string | null> {
  const plan = planOf(text, entry)

  if (!plan.isChange) return null

  say($, `${what} changes ${p.settings}:\n${plan.diff}`)

  if (!(await confirm(`${what}: write this change to your user settings? A backup is kept.`))) return 'Cancelled. settings.json was not changed.'

  const backup = `${p.dir}/settings.json.bak-${new Date().toISOString().replaceAll(':', '-')}`

  await $.fs.write(backup, text)
  await $.fs.write(p.settings, plan.text)

  return `Wrote ${p.settings} (backup: ${backup}).`
}

async function install($: EngineInterface, confirm: Confirm): Promise<string> {
  if (!(await hasBun($))) {
    return 'The status line runs on Bun, and `bun` is not on PATH. Install it (https://bun.sh), then run /ghostframe-statusline install again.'
  }

  const p = await pathsOf($)
  const text = await readSettings($, p)
  const current = currentOf(text)
  const built = await $.process.run(['bun', 'build', `${$.plugin.root}/statusline/main.ts`, '--target=bun', '--outfile', p.script])

  if (built.exitCode !== 0) {
    say($, built.stderr || built.stdout)

    return 'The status line did not build (the build output is above), so nothing was changed.'
  }

  // Keep what was there before, once: a second install must not overwrite it with ghostframe's own entry.
  if (!isOurs(current)) await $.fs.write(p.previous, `${JSON.stringify({ statusLine: current }, null, 2)}\n`)

  const done = await apply($, confirm, p, text, entryOf(p.script), 'Installing ghostframe’s status line')

  // The outcome first: the engine's command row shows only the start of the text.
  return [
    done ?? 'settings.json already runs it; nothing else changed.',
    `Built ${p.script}.`,
    'Project settings (.claude/settings.json) can also set statusLine, and win over user settings.'
  ].join(' ')
}

async function uninstall($: EngineInterface, confirm: Confirm): Promise<string> {
  const p = await pathsOf($)
  const text = await readSettings($, p)

  if (!isOurs(currentOf(text))) return 'ghostframe’s status line is not in your user settings; nothing to undo.'

  let previous: StatusLineEntry | null = null

  if (await $.fs.exists(p.previous)) {
    const kept: unknown = JSON.parse(await $.fs.read(p.previous))
    const entry = isRecord(kept) ? kept['statusLine'] : null

    previous = isEntry(entry) ? entry : null
  }

  const done = await apply($, confirm, p, text, previous, previous === null ? 'Removing ghostframe’s status line' : 'Restoring your previous status line')

  return done ?? 'Nothing to change.'
}

async function status($: EngineInterface): Promise<string> {
  const p = await pathsOf($)
  const current = currentOf(await readSettings($, p))
  const built = await $.fs.exists(p.script)

  if (isOurs(current))
    return `ghostframe’s status line is installed: ${JSON.stringify(current)}${built ? '' : ` (but ${p.script} is missing: run install again)`}`

  return current === null ? 'No status line is set in your user settings.' : `Your user settings run another status line: ${JSON.stringify(current)}`
}

/**
 * Runs one form of the command.
 * @param $ the engine interface
 * @param args what followed the command's name
 * @param confirm how the person approves a change (the engine's dialog by default)
 * @returns the command's output
 */
export async function runStatusline($: EngineInterface, args: string, confirm: Confirm = askPerson($)): Promise<string> {
  const verb = args.trim().split(/\s+/)[0] ?? ''

  try {
    if (verb === 'install') return flat(await install($, confirm))
    if (verb === 'uninstall') return flat(await uninstall($, confirm))
    if (verb === 'status' || verb === '') return flat(await status($))

    return flat(`Unknown option "${verb}". Use: /${COMMAND} install | uninstall | status`)
  } catch (error: unknown) {
    return flat(`${verb} stopped, settings.json unchanged: ${String(error)}`)
  }
}

/**
 * Adds `/ghostframe-statusline`: registered at session start, answered by `command.run`. The transcript's ledger owns
 * the plugin's one unmatched `session.start` hook (the engine refuses a second); this one matches the terminal surface,
 * the only one the command runs on.
 * @param on the `on` that `register` receives
 */
export function registerStatusline(on: On): void {
  on('session.start', { surface: 'terminal' }, async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Install, remove or check ghostframe’s status line in your user settings',
      argumentHint: 'install | uninstall | status',
      isTerminalOnly: true
    })

    return next(e)
  })
  on('command.run', { command: COMMAND }, async ($, e) => ({ text: await runStatusline($, e.args) }))
}
