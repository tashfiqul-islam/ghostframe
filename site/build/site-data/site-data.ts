// Site data: everything the site says about ghostframe, read from the repository once, under one set of rules. Pages,
// the feed and the post-build checks all read it here; nothing else opens a repository file.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { type Facts, readFacts } from '../facts/facts'
import { type Release, readReleases } from '../release-notes/releases'

/** The repository paths the site reads. The CI job runs the site checks when any of them changes (a spec holds it). */
export const SITE_INPUTS = ['.claude-plugin/plugin.json', 'README.md', 'CHANGELOG.md', 'docs/design/brand', 'statusline/render.ts'] as const

/** The brand files the site serves, by their path in docs/design/brand. build/brand/copy.ts copies them unchanged. */
export const BRAND_FILES = ['icons/favicon-32.png', 'icons/apple-touch-icon.png', 'ghostframe-mascot.svg'] as const

export interface SiteData {
  facts: Facts
  releases: Release[]
  /** Each file in BRAND_FILES, by its path in docs/design/brand, with its bytes as exported. */
  brand: Map<string, Buffer>
}

/** The site data of the repository at `repo`. Throws, naming the input, when one is missing or wrong. */
export function readSiteData(repo: string): SiteData {
  for (const input of SITE_INPUTS) if (!existsSync(join(repo, input))) throw new Error(`site input ${input} is missing`)
  const brand = new Map<string, Buffer>()
  for (const path of BRAND_FILES) {
    const file = join(repo, 'docs', 'design', 'brand', path)
    if (!existsSync(file)) throw new Error(`brand file docs/design/brand/${path} is missing`)
    brand.set(path, readFileSync(file))
  }
  return { facts: readFacts(repo), releases: readReleases(readFileSync(join(repo, 'CHANGELOG.md'), 'utf8')), brand }
}

let cached: SiteData | undefined

/** The site data for the build: the repository is site/'s parent, and the build runs from site/. */
export function siteData(): SiteData {
  // The build is bundled, so a module's own path says nothing about where site/ is; the working folder does.
  if (!existsSync(join(process.cwd(), 'astro.config.ts'))) throw new Error(`run the build from site/, not ${process.cwd()}`)
  cached ??= readSiteData(resolve(process.cwd(), '..'))
  return cached
}
