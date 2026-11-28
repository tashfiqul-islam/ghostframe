import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { readSiteData } from '../site-data/site-data'
import { llmsTxt } from './llms'

const data = readSiteData(join(import.meta.dir, '..', 'site-data', 'fixtures', 'repo'))
const origin = 'https://ghostframe.example.workers.dev'
const summary = 'A Claude Code plugin: a turn timeline, a docked pane and a status line.'
const text = llmsTxt(data, { origin, summary })

describe('llmsTxt', () => {
  test('opens with the H1 and the one-line summary as a blockquote, as llmstxt.org lays it out', () => {
    expect(text.split('\n').slice(0, 3)).toEqual(['# ghostframe', '', `> ${summary}`])
  })

  test('states the version and the supported Claude Code range from the facts', () => {
    expect(text).toContain('Version 1.0.0, for Claude Code 2.1.329 and later, below 2.2.0.')
  })

  test('gives every command the README gives, in order, as code', () => {
    const commands = [...text.matchAll(/^- `([^`]+)`$/gm)].map(m => m[1])
    expect(commands).toEqual(data.facts.commands)
  })

  test("links the landing page, the release notes and the feed at the site's origin", () => {
    const links = [...text.matchAll(/\]\((\S+)\)/g)].map(m => m[1])
    expect(links).toEqual([`${origin}/`, `${origin}/releases/`, `${origin}/releases/feed.xml`])
  })

  // Lighthouse 13.6.0, core/audits/agentic/llms-txt.js: an H1, a Markdown link, and 50 characters or more.
  test("passes Lighthouse's llms-txt audit rules", () => {
    expect(/^\s*#\s+.+/m.test(text)).toBe(true)
    expect(/\[.+\]\(.+\)/.test(text)).toBe(true)
    expect(text.length).toBeGreaterThanOrEqual(50)
  })
})
