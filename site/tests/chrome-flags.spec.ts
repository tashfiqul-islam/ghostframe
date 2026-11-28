// Lighthouse's report does not echo the Chrome flags it launched with, so the flags the spec builds are asserted here.
import { expect, test } from 'bun:test'
import { Launcher } from 'chrome-launcher'
import { chromeFlags } from './chrome-flags'

const disabled = (flags: string[]): string[] =>
  flags.filter(f => f.startsWith('--disable-features=')).flatMap(f => f.slice('--disable-features='.length).split(','))

test('the one --disable-features switch keeps chrome-launcher defaults and adds SpareRendererForSitePerProcess', () => {
  const flags = chromeFlags().split(' ')
  // Chrome honours only the last such switch, so there must be exactly one, and it must carry both lists.
  expect(flags.filter(f => f.startsWith('--disable-features='))).toHaveLength(1)
  expect(disabled(flags)).toEqual([...disabled(Launcher.defaultFlags()), 'SpareRendererForSitePerProcess'])
})

test('the WebMCP flags stay', () => {
  expect(chromeFlags().split(' ')).toEqual(expect.arrayContaining(['--headless=new', '--enable-features=WebMCP']))
})
