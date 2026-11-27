/**
 * Finished replies whose end looks like text still being written (B2, B3): a bracket on the last line, a one-line
 * table row, a last block that starts like a `Sources` label. The engine raises each block once, complete
 * (correction E), so each must draw in full.
 */
export const FINISHED = [
  'Then answer the prompt: [y/N]',
  'Use arr[i]',
  'Marked as [WIP until review',
  'The result:\n\n| total | 42 |',
  'All done.\n\nSo',
  'All done.\n\nSource'
]

/** The words a reply must show: its text split at whitespace, table pipes dropped. */
export const wordsIn = (text: string): string[] => text.split(/[\s|]+/).filter(w => w.length > 0)
