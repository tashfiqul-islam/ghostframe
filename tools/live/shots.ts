// Step 14: the README's screens. A real session at 200 × 50 with ghostframe as it ships: Cockpit on (its default) and
// the status line set up the way `/ghostframe-statusline install` sets it up: `bun build` of statusline/main.ts into
// <config>/ghostframe/statusline.js, and the statusLine entry the installer writes (hooks/statusline/settings.ts).
// The config folder here is the suite's capture folder, so the person's own settings are never read or written.
// docs/assets/screenshots.ts turns the captures into the README's images.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { entryOf } from '../../hooks/statusline/settings.ts'
import { hasReceipt, isDialogUp, layoutOf, timelineRows } from './checks.ts'
import { SETTINGS } from './config.ts'
import { focusPane, startTurn, waitIdle, type Step } from './harness.ts'
import type { Session } from './session.ts'
import { markRow } from './statusline.ts'
import type { Suite } from './steps.ts'

const ROOT = join(import.meta.dirname, '..', '..').replaceAll('\\', '/')
export const PROMPT = 'the width tests fail: run them, read src/width.ts and its test, fix it, run the tests again, show the diff, then commit'

/**
 * The suite's settings: the base live settings with this worktree as the plugin, Cockpit left to its default, and the
 * statusLine entry the installer writes, for the script it builds.
 * @param dir the suite's capture folder
 * @returns the settings file's path
 */
export function settingsFor(dir: string): string {
  const script = join(dir, 'ghostframe', 'statusline.js').replaceAll('\\', '/')

  mkdirSync(join(dir, 'ghostframe'), { recursive: true })
  const built = Bun.spawnSync(['bun', 'build', `${ROOT}/statusline/main.ts`, '--target=bun', '--outfile', script])

  if (built.exitCode !== 0) throw new Error(`the status line did not build: ${built.stderr.toString()}`)
  const base: unknown = JSON.parse(readFileSync(SETTINGS, 'utf8'))
  const record = typeof base === 'object' && base !== null ? base : {}
  const env = 'env' in record && typeof record.env === 'object' && record.env !== null ? { ...record.env } : {}

  // Empty, GHOSTFRAME_COCKPIT leaves the cockpit option in charge: the shipped default, whatever the shell sets.
  const file = join(dir, 'shots-settings.json')

  writeFileSync(
    file,
    JSON.stringify({ ...record, env: { ...env, CLAUDE_CODE_PLUGIN_DIRS: ROOT, GHOSTFRAME_COCKPIT: '' }, statusLine: entryOf(script) }, null, 2)
  )

  return file
}

/**
 * Waits until the turn is under way: the pane docked, three rows on its timeline with the failed test among them, no receipt yet, and the
 * status line drawn. A permission dialog on the way is approved.
 * @param s the session
 * @param step the step, for the record of each dialog approved
 */
async function midTurn(s: Session, step: Step): Promise<void> {
  for (;;) {
    const cap = await s.waitFor(
      c =>
        isDialogUp(c) ||
        hasReceipt(c) ||
        (layoutOf(c).pane !== undefined && timelineRows(c).length >= 3 && timelineRows(c).some(r => r.glyph === '×') && markRow(c) >= 0),
      5 * 60_000,
      'three rows on the timeline, the failed test among them'
    )

    if (!isDialogUp(cap)) return
    step.note('a dialog came up and was approved', (await s.capture('step14-dialog')).html)
    await s.key('enter')
    await s.waitFor(c => !isDialogUp(c), 30_000, 'the dialog to close')
  }
}

/** Step 14: the turn mid-way (readme-live), settled (readme-hero, the README's hero), and on the Files tab. */
export const shots: Suite = {
  id: 'P',
  widths: [200],
  steps: ['14'],
  settings: settingsFor,
  // No debug log: with one, the engine draws a "Debug mode" row that holds the log's path.
  debug: false,
  async run(s: Session, stepOf: (id: string) => Step) {
    const step = stepOf('14')

    await s.waitFor(c => markRow(c) >= 0, 30_000, 'the status line')
    await startTurn(s, PROMPT)
    await midTurn(s, step)
    const live = step.keep(await s.capture('readme-live'))

    step.expect(
      'live: mid-turn (no receipt yet), the pane docked, the status line drawn',
      !hasReceipt(live) && layoutOf(live).pane !== undefined && markRow(live) >= 0,
      `${timelineRows(live).length} timeline rows`
    )

    await waitIdle(s, step)
    step.keep(await s.capture('readme-hero'))
    await focusPane(s)
    await s.key('2')
    await s.waitSettled(() => true, 30_000, 'the Files tab')
    step.keep(await s.capture('readme-files'))
    await s.key('esc')
  }
}
