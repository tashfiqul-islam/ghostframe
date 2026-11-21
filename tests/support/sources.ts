export const FOOTNOTED = [
  'What changed:',
  '',
  '- dedupe by key before the flush, as [vitest](https://vitest.dev/guide/cli) suggests',
  '- a regression test for the double fire, see https://github.com/oven-sh/bun/issues/9123',
  '1. run the suite',
  '2. ship it'
].join('\n')

export const SOURCED = [
  'Sources:',
  '',
  '- [Vitest CLI](https://vitest.dev/guide/cli)',
  '- [Bun test runner](https://bun.sh/docs/cli/test)',
  '- [Playwright actionability](https://playwright.dev/docs/actionability)',
  '- [Bun issue 9123](https://github.com/oven-sh/bun/issues/9123)',
  '- [Node timers](https://nodejs.org/api/timers.html)'
].join('\n')
