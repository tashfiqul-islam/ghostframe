import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'

// Rolldown finds a tsconfig per file and, for a file site/tsconfig.json does not include (Astro's virtual page modules),
// walks up to the repo's own, which extends engine types a fresh checkout lacks. Naming site's stops the walk.
const tsconfig = fileURLToPath(new URL('./tsconfig.json', import.meta.url))

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { tsconfig }
})
