// A shell's output without the engine's own notes, for the rows the engine still draws.
import { isObject } from '../../../shared/calls/fields'
import { stripNoise } from '../../../shared/calls/tests'

const strip = (v: unknown) => (typeof v === 'string' ? stripNoise(v) : v)

/**
 * A shell's output without the engine's own notes (`Shell cwd was reset to …`), for
 * the engine's drawing of it (ctrl+o, background tasks). Same shape, so it still fits
 * the tool's schema; nothing to drop, or any other tool → the output as it was.
 */
function quietOutput(tool: string, output: unknown): unknown {
  if ((tool !== 'Bash' && tool !== 'PowerShell') || !isObject(output)) return output

  const o = output

  if (strip(o['stdout']) === o['stdout'] && strip(o['stderr']) === o['stderr']) return output

  return { ...o, stdout: strip(o['stdout']), stderr: strip(o['stderr']) }
}

/** A row's render event as the engine should draw it: its output quieted (`quietOutput`), else the event itself. */
export const quietEvent = <E extends { props: { tool: string; output?: unknown } }>(e: E): E => {
  const output = quietOutput(e.props.tool, e.props.output)

  return output === e.props.output ? e : { ...e, props: { ...e.props, output } }
}
