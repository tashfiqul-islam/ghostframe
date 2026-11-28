import { defineConfig, type OxlintConfig } from 'oxlint'
import repo from '../tools/oxlint.config.ts'

// The repo's rules (tools/oxlint.config.ts; the repo's own lint skips site/), plus what the site needs on top.
const config: OxlintConfig = defineConfig({
  ...repo,
  rules: {
    ...repo.rules,
    // A stylesheet import is a side effect by design.
    'import/no-unassigned-import': ['error', { allow: ['**/*.css'] }]
  },
  // Planted errors and lint probes exist to fail; the checker and lint specs run them on purpose.
  // The lint fixtures are not ignored here: build/checks/lint.spec.ts lints them under these rules. The lint script skips them.
  ignorePatterns: ['dist/**', '.astro/**', 'node_modules/**', 'build/checks/fixtures/planted/**']
})

export default config
