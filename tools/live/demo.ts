// Step 15: the README's demo. One real turn at 144 × 40, the narrowest width the pane docks at by itself, with
// ghostframe as it ships (step 14's settings and prompt). From before the prompt is typed until a moment after the
// turn settles, the screen is sampled every 250 ms; each frame that differs from the one before is saved as
// demo/<n>.html, with the time it was seen in demo/frames.json. docs/assets/demo.ts turns them into the animation.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { hasReceipt, layoutOf, timelineRows } from './checks.ts'
import { waitIdle, type Step } from './harness.ts'
import { htmlOf } from './screen.ts'
import type { Session } from './session.ts'
import { PROMPT, settingsFor } from './shots.ts'
import { markRow } from './statusline.ts'
import type { Suite } from './steps.ts'

const SAMPLE_MS = 250
// After the turn settles, so the animation ends on the receipt and the status line's last update.
const TAIL_MS = 3000

/** A sampler that keeps each changed frame until it is stopped. */
function sampler(s: Session, dir: string): { stop: () => Promise<{ file: string; at: number }[]> } {
  const frames: { file: string; at: number }[] = []
  const began = Date.now()
  let last = ''
  // An object, so the stop below is seen as changing what the loop reads.
  const state = { isRunning: true }

  const loop = (async () => {
    while (state.isRunning) {
      const html = htmlOf(await s.screen('demo'))

      if (html !== last) {
        last = html
        const file = `${String(frames.length + 1).padStart(4, '0')}.html`

        writeFileSync(join(dir, file), html)
        frames.push({ file, at: Date.now() - began })
      }
      await new Promise(done => setTimeout(done, SAMPLE_MS))
    }
  })()

  return {
    async stop() {
      state.isRunning = false
      await loop

      return frames
    }
  }
}

/** Step 15: the demo's frames. */
export const demo: Suite = {
  id: 'D',
  widths: [144],
  steps: ['15'],
  settings: settingsFor,
  // No debug log: with one, the engine draws a "Debug mode" row that holds the log's path.
  debug: false,
  async run(s: Session, stepOf: (id: string) => Step) {
    const step: Step = stepOf('15')

    await s.waitFor(c => markRow(c) >= 0, 30_000, 'the status line')
    const dir = join(dirname((await s.capture('demo-start')).html), 'demo')

    mkdirSync(dir, { recursive: true })
    const rec = sampler(s, dir)

    await s.send(PROMPT)
    await waitIdle(s, step)
    await new Promise(done => setTimeout(done, TAIL_MS))
    const frames = await rec.stop()
    const end = step.keep(await s.capture('demo-end'))

    writeFileSync(join(dir, 'frames.json'), `${JSON.stringify(frames, null, 2)}\n`)
    step.expect(
      'demo: the turn ran to its receipt with the pane docked and the status line drawn',
      hasReceipt(end) && layoutOf(end).pane !== undefined && markRow(end) >= 0,
      `${frames.length} frames over ${((frames.at(-1)?.at ?? 0) / 1000).toFixed(1)} s, ${timelineRows(end).length} timeline rows`
    )
  }
}
