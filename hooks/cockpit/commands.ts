// Cockpit's own slash commands as they ran (spec 7.15): the whole command as typed and whether it did what was asked,
// kept by the text it answered, so the `CommandOutput` row that prints that text can say both. The engine hands the
// row empty `args` and its own `<plugin>: ` prefix on the text, so the row cannot tell them from its props.

/** A run of one of Cockpit's commands: the command as typed, its answer, and whether it did what was asked. */
export type Run = { command: string; text: string; isOk: boolean }

const RUNS_MAX = 50
const runs: Run[] = []

/**
 * A command answered: keeps the run for its row, and hands back the answer for `command.run` to return.
 * @param command its name, no slash
 * @param args its arguments as typed
 * @param text what it answers
 * @param isOk whether it did what was asked; an answer that says it could not is an error row (`×`)
 * @returns `{ text }`, the hook's answer
 */
export function answered(command: string, args: string, text: string, isOk: boolean): { text: string } {
  const typed = `/${command}${args.trim().length > 0 ? ` ${args.trim()}` : ''}`

  runs.push({ command: typed, text, isOk })
  while (runs.length > RUNS_MAX) runs.shift()

  return { text }
}

/**
 * The run a `CommandOutput` row prints, by its text with the engine's `<plugin>: ` prefix taken off.
 * @param shown the row's text
 * @param plugin this plugin's name, the prefix the engine adds
 * @returns the run, or undefined for a command Cockpit did not answer
 */
export function runOf(shown: string, plugin: string): Run | undefined {
  const text = withoutPrefix(shown, plugin)

  return runs.findLast(r => r.text.trim() === text)
}

/** A row's text without the `<plugin>: ` the engine puts before a plugin's answer. */
export const withoutPrefix = (shown: string, plugin: string): string =>
  shown.trim().replace(new RegExp(`^${plugin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`), '')
