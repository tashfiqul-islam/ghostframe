import { describe, expect, test } from 'bun:test'
import { pageCode, pageText } from './page-text'

describe('pageText', () => {
  test('is what a reader sees: tags gone, entities decoded', () => {
    expect(pageText('<h1>ghost<b>frame</b></h1><p>a &amp; b &lt;c&gt;</p>')).toBe('ghost frame a & b <c>')
  })

  test('leaves out inline scripts and styles', () => {
    expect(pageText('<style>.a[data-astro-cid-v434]{}</style><script>const v2 = 1</script><p>text</p>')).toBe('text')
  })

  test('leaves out the demo, whose scripted session is a story, not a statement', () => {
    expect(pageText('<section data-demo><pre>Bun 1.4.1</pre></section><p>v1.0.0</p>')).toBe('v1.0.0')
  })

  test('keeps a section that is not the demo', () => {
    expect(pageText('<section id="install"><p>v1.0.0</p></section>')).toBe('v1.0.0')
  })
})

describe('pageCode', () => {
  test('lists each <code> text outside the demo, decoded and trimmed', () => {
    const html = '<p>Run <code> /plugin install ghostframe@ghostframe </code></p><section data-demo><code>bun test</code></section><code>a &amp; b</code>'
    expect(pageCode(html)).toEqual(['/plugin install ghostframe@ghostframe', 'a & b'])
  })
})

describe('pageText with the demo kept', () => {
  test('includes the demo for checks of every word that ships', () => {
    expect(pageText('<section data-demo><pre>Bun 1.4.1</pre></section><p>v1.0.0</p>', { demo: 'keep' })).toBe('Bun 1.4.1 v1.0.0')
  })
})
