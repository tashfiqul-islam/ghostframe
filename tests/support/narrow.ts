export const WIDTHS = [90, 70, 50] as const

/** Every row the mod drew: its one-line Texts, and each line of its block Texts. */
export async function rows(ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown>; text: string }[]> }) {
  const texts = await ui.findAll({ type: 'Text' })

  return (
    texts
      .filter(t => t.props['wrap'] === 'truncate' || t.props['wrap'] === 'wrap')
      .flatMap(t => t.text.split('\n'))
      // A rule's filler: a long ┄ run in a one-row, overflow-hidden box, cut to its room.
      .filter(l => !/^┄{100,}$/.test(l))
  )
}
