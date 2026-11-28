// The type-aware lint proves it still runs: oxlint must report the floating promise planted in the lint fixture.
// Type-aware rules run on tsrs-lint (ADR 0023); if that backend silently stops loading, this fails.
import { expect, test } from 'bun:test'
import { join } from 'node:path'

const site = join(import.meta.dir, '..', '..')
const oxlint = join(site, 'node_modules', '.bin', process.platform === 'win32' ? 'oxlint.exe' : 'oxlint')
const config = Bun.env['LINT_PROOF_CONFIG'] ?? 'oxlint.config.ts'

test('the type-aware lint reports the floating promise planted in its fixture', () => {
  const run = Bun.spawnSync([oxlint, '-c', config, '--type-aware', 'build/checks/fixtures/lint/floating.ts'], {
    cwd: site,
    env: { ...process.env, TSRS_LINT_RUN_EXTERNAL_CODE: '1' }
  })
  expect(run.exitCode).not.toBe(0)
  expect(run.stdout.toString()).toContain('typescript(no-floating-promises)')
})
