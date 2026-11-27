import { expect, test } from 'claude-code/testing'

import { engine } from '../../../support/engine'
import { OFF, ON } from '../../../support/cockpit'
import { FINISHED, wordsIn } from '../../../support/finished'
import { VIEW } from '../../../support/view'

// The engine raises each block once, complete (correction E): a finished reply that ends like text still being
// written (a bracket, a one-line table row, a `So` block) draws every word, mid-turn or after it.
for (const [mode, options] of [
  ['on', ON],
  ['off', OFF]
] as const) {
  test(
    // Cockpit off is the proof; Cockpit on never used the streaming cut, so its case is a guard.
    `B2, B3. Cockpit ${mode}: finished replies that end like streaming text draw every word, mid-turn too`,
    { ...options, timeoutMs: 30_000 },
    async ($, on) => {
      engine(on)
      on('session.id', () => ({ value: 'finished' }))
      on('ui.log', () => ({ value: undefined }))
      on('store.get', () => ({ value: undefined as never }))
      on('turn.start', (_, e) => ({ turnId: e.turnId }))
      await $.turn.start({ text: 'go', turnId: 't1' })

      for (const said of FINISHED) {
        const ui = await $.ui.mount({
          plugin: 'ghostframe',
          surface: 'terminal',
          component: 'AssistantMessage',
          viewport: VIEW,
          props: { text: said, isFirstOfReply: true }
        })
        const drawn = [
          ...(await ui.findAll({ type: 'Text' })).map(t => t.text),
          ...(await ui.findAll({ type: 'Markdown' })).map(m => String(m.props['text']))
        ].join(' ')

        for (const w of wordsIn(said)) expect({ said, has: drawn.includes(w) ? w : `missing ${w}` }).toEqual({ said, has: w })
        await ui.unmount()
      }
    }
  )
}
