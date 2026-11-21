import { expect, test } from 'claude-code/testing'

test('the hot-reload note is one short line', async ($, on) => {
  // Beneath the mod: what reaches the store.
  const kept: string[] = []
  on('session.append', (_, e, next) => {
    const c = (e.message as { content: unknown }).content
    kept.push(Array.isArray(c) ? String((c[0] as { text?: unknown }).text) : String(c))
    return next(e)
  })
  const note = (text: string, uuid: string) =>
    $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] }, door: 'notice', origin: { kind: 'engine' }, uuid } as never)

  await note('ghostframe: reloaded (13 hooks: ui.render, session.start, tool.call)', 'n1')
  await note('something else', 'n2')
  expect(kept).toEqual(['ghostframe reloaded · 13 hooks', 'something else'])
})
