// The engine drift guard (docs/decisions/0012-engine-range.md): ghostframe draws through Claude Code's plugin API and
// render sites, which change with the engine. The manifest's `engines["claude-code"]` range says which engines it is
// tested with; outside it, ghostframe is dormant: every site hands its row back to the engine, and the session says why.
// GHOSTFRAME_ENGINE_CHECK=0 turns the check off. The status line is a separate program and is not gated.
import type { EngineInterface } from 'claude-code'

import { inRange, parseRange, rangeText } from './range'

/** Whether this copy of the module has run the check (see `checkEngineOnce`). */
let isChecked = false
/** Whether ghostframe is dormant: the engine is outside the tested range and the check is on. */
let isDormantNow = false
/** What the session is told when ghostframe is dormant. */
let dormantNote = ''

/** Whether ghostframe is dormant: every site hands its row back to the engine. */
export const isDormant = (): boolean => isDormantNow

/** Why ghostframe is dormant, for /cockpit and /steps; empty while it is not. */
export const dormantText = (): string => dormantNote

/**
 * Runs the check once per copy of the module (session start, or the first draw after `/tui` loads the module again).
 * The range is the manifest's; the engine's version is `$.session.version()`'s. Dormant, it tells the session once: a
 * notice in the transcript and a line in the debug log. A range or version that cannot be read leaves ghostframe awake
 * and says so in the debug log: a broken read never switches it off unseen.
 * @param $ the engine interface
 */
export async function checkEngineOnce($: EngineInterface): Promise<void> {
  if (isChecked) return
  isChecked = true

  try {
    if (((await $.env.get('GHOSTFRAME_ENGINE_CHECK')) ?? '') === '0') {
      $.ui.log('engine check: GHOSTFRAME_ENGINE_CHECK=0, so the Claude Code version is not checked', { to: 'debug' })

      return
    }
    const manifest: unknown = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
    const engines = typeof manifest === 'object' && manifest !== null && 'engines' in manifest ? manifest.engines : undefined
    const text = typeof engines === 'object' && engines !== null && 'claude-code' in engines ? engines['claude-code'] : undefined
    const plugin = typeof manifest === 'object' && manifest !== null && 'version' in manifest ? String(manifest.version) : 'dev'

    if (typeof text !== 'string') throw new Error('the manifest has no engines["claude-code"] range')
    const range = parseRange(text)
    const { version, base } = await $.session.version()

    if (inRange(base ?? version, range)) return
    isDormantNow = true
    // Claude Code labels the row "ghostframe:" itself, so the notice starts after the name.
    dormantNote =
      `version ${plugin} is tested with Claude Code ${rangeText(range)}; this session runs ${version}, so it draws ` +
      'nothing and Claude Code looks as it does without it. Update ghostframe, or set GHOSTFRAME_ENGINE_CHECK=0 to try ' +
      'it anyway.'
    const notice = dormantNote

    $.ui.log(notice)
    $.ui.log(`engine check: dormant, Claude Code ${version} is outside ${text}`, { to: 'debug' })
  } catch (error: unknown) {
    $.ui.log(`engine check: the Claude Code version was not checked: ${String(error)}`, { to: 'debug' })
  }
}

/**
 * Whether a site should hand its row back to the engine: the check runs first if this copy of the module has not run
 * it yet. A site that cannot wait (a synchronous one) reads `isDormant()` instead.
 * @param $ the engine interface
 * @returns true while ghostframe is dormant
 */
export async function dormantFor($: EngineInterface): Promise<boolean> {
  await checkEngineOnce($)

  return isDormantNow
}
