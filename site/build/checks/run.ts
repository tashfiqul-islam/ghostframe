// `bun build/checks/run.ts`: the post-build checks over the real site. Exits 1 with every finding.
import { resolve } from 'node:path'
import { checkSite } from './checks'

const site = resolve(import.meta.dir, '..', '..')
const findings = checkSite({ site, repo: resolve(site, '..') })
for (const finding of findings) console.error(finding)
if (findings.length > 0) process.exit(1)
console.log('site checks: no findings')
