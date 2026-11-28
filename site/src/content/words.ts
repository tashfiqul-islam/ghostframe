// The site's words. One string wherever it fits both widths; where a phone really needs fewer words, the entry
// carries a `short` variant too, and <Words> renders both with CSS showing one (display: none, so screen readers and
// search engines read only the one shown). No JavaScript, no layout shift. Facts (versions, commands) never live here:
// they come from build/site-data.

export type Wording = string | { text: string; short: string }

export const words = {
  landing: {
    title: 'ghostframe: the cockpit for Claude Code',
    description: 'A Claude Code plugin: a turn timeline, a docked pane and a status line.'
  },
  demo: {
    lede: { text: 'A scripted session on the real cell grid. The tabs respond.', short: 'Cropped to the conversation. Swipe for the pane.' }
  },
  releaseNotes: {
    title: 'Release notes · ghostframe',
    description: 'Every ghostframe release, newest first.',
    heading: 'Release notes',
    filters: 'Show changes'
  },
  notFound: {
    title: 'Not found · ghostframe',
    description: 'This page is not here.',
    heading: 'Nothing in this frame.'
  }
} satisfies Record<string, Record<string, Wording>>
