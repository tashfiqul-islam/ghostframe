import { expect, test } from 'claude-code/testing'

import { GLYPH } from '../../../../hooks/shared/look/glyphs'
import { widthOf } from '../../../../hooks/shared/look/width'
import { engine } from '../../../support/engine'
import type { Found } from '../../../support/engine'
import { OFF, ON } from '../../../support/cockpit'
import { bare, UNBROKEN } from '../../../support/unbroken'

const COLUMNS = 70
// A bare URL is left out: Cockpit off draws it as its cited label, on purpose shorter than the URL.
const SAID = `${UNBROKEN.chinese}\n\n${UNBROKEN.path}`

/** Every row the reply's Texts draw: a Text that truncates is one row; one that wraps is its lines. */
const rowsOf = (texts: readonly Found[]) => texts.flatMap(t => (t.props['wrap'] === 'truncate' ? [t.text] : t.text.split('\n')))

for (const [mode, options] of [
  ['on', ON],
  ['off', OFF]
] as const) {
  test(`B1. Cockpit ${mode}: an answer with no space to break at draws every character, no row past the window`, options, async ($, on) => {
    engine(on)
    on('session.id', () => ({ value: 'wrap' }))
    on('ui.log', () => ({ value: undefined }))
    on('store.get', () => ({ value: undefined as never }))

    const ui = await $.ui.mount({
      plugin: 'ghostframe',
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: { columns: COLUMNS, rows: 40 },
      props: { text: SAID, isFirstOfReply: true }
    })
    const texts = (await ui.findAll({ type: 'Text' })).filter(t => t.props['wrap'] === 'truncate' || t.props['wrap'] === 'wrap')
    const rows = rowsOf(texts)
    // The words as drawn, the spine Cockpit draws down each row taken out.
    const said = bare(rows.join('').replaceAll(GLYPH.spine, ''))

    expect(rows.length).toBeGreaterThan(2)
    for (const r of rows) expect(widthOf(r)).toBeLessThanOrEqual(COLUMNS)
    expect(said).toContain(bare(UNBROKEN.chinese))
    expect(said).toContain(bare(UNBROKEN.path))
    await ui.unmount()
  })
}
