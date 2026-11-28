// What a reader sees on a built page, which every check of a page's words reads (facts, internal names, font
// coverage). Scripts and styles are not text. The demo (`[data-demo]`) is left out: its scripted session is a story,
// not a statement about ghostframe.

/**
 * `html`'s visible text, tags removed, entities decoded, runs of white space collapsed to one space. The demo is left
 * out unless `demo: 'keep'`: checks of what ghostframe states skip it, checks of every word that ships keep it.
 */
export function pageText(html: string, options: { demo: 'skip' | 'keep' } = { demo: 'skip' }): string {
  const text = (options.demo === 'keep' ? html : withoutDemo(html)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ')
  return decode(text).replace(/\s+/g, ' ').trim()
}

/** The text of each `<code>` element outside the demo, decoded and trimmed, in page order. */
export function pageCode(html: string): string[] {
  return [...withoutDemo(html).matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)].map(m => decode(m[1]!.replace(/<[^>]+>/g, '')).trim())
}

function withoutDemo(html: string): string {
  // shortcut: the demo is one flat <section> with no nested <section>; a nested one would end the match early.
  return html.replace(/<section[^>]*\bdata-demo\b[^>]*>[\s\S]*?<\/section>/g, ' ')
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}
