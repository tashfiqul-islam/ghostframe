import { expect, test } from 'claude-code/testing'

import { toneRow } from '../../../hooks/transcript/figure/tone'

const colorOf = (line: string, ch: string) => toneRow(line).find(p => p.t.includes(ch))?.color

test('figure tones: box lines in the rule colour, text in text, hue only where the figure marks state', async () => {
  const FRAME = '#2c2c36'
  expect(colorOf('●  Mar 12  CLI copies the files', '●')).toBe('#96d292') // done
  expect(colorOf('○  Apr 02  Registry listed', '○')).toBe('#686874') // next
  expect(colorOf('│', '│')).toBe(FRAME)
  expect(colorOf('●  Mar 12  CLI copies the files', 'CLI')).toBe('#b2b2bc')
  expect(colorOf('                     ▾', '▾')).toBe('#fab387') // now
  expect(colorOf('██████▒███', '▒')).toBe('#e8b98a') // slow
  expect(colorOf('█████··████', '·')).toBe('#ec84a0') // down
  expect(colorOf('+ app          31 kb', '+')).toBe('#96d292')
  expect(colorOf('- sourcemaps   12 kb', '-')).toBe('#ec84a0')
  expect(colorOf('--------------------', '-')).toBe(FRAME)
  expect(colorOf('Registry       |    ✓ |      ✓', '✓')).toBe('#96d292')
  expect(colorOf('Registry       |    ✓ |      ✓', '|')).toBe(FRAME)
  const bar = toneRow('/install  [=======-------------]   4,100')
  expect(bar.find(p => p.t.startsWith('='))?.color).toBe('#b2b2bc') // text (bar fill)
  expect(bar.find(p => p.t.startsWith('-'))?.color).toBe('#2c2c36') // hairline (track)
  expect(bar.find(p => p.t === '[')?.color).toBe(FRAME)
})
