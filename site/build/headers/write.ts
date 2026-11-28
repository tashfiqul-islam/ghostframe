// `bun build/headers/write.ts`, run after the build: writes dist/_headers for Workers static assets.
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { siteHeaders } from './headers'

const dist = resolve(import.meta.dir, '..', '..', 'dist')
writeFileSync(join(dist, '_headers'), siteHeaders(dist))
