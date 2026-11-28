// llms.txt: the site for an agent, as llmstxt.org lays it out. Every line comes from site data or the site's words,
// the same as the pages, so the file cannot drift from them.
import type { SiteData } from '../site-data/site-data'

export interface LlmsOptions {
  /** The site's origin, from src/site.ts. */
  origin: string
  /** The landing page's one-line description, from the site's words. */
  summary: string
}

export function llmsTxt({ facts }: SiteData, { origin, summary }: LlmsOptions): string {
  return [
    '# ghostframe',
    '',
    `> ${summary}`,
    '',
    `Version ${facts.version}, for Claude Code ${facts.claudeCode.from} and later, below ${facts.claudeCode.below}.`,
    '',
    '## Commands',
    '',
    ...facts.commands.map(c => `- \`${c}\``),
    '',
    '## Pages',
    '',
    `- [ghostframe](${origin}/): what it does, the demo, install and compatibility`,
    `- [Release notes](${origin}/releases/): every release, newest first`,
    `- [Release notes feed](${origin}/releases/feed.xml): the same, as Atom`,
    ''
  ].join('\n')
}
