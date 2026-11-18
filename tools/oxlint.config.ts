import { defineConfig } from 'oxlint'

// Run from the repository root: `oxlint -c tools/oxlint.config.ts` (the tools/ scripts do).
export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'jsdoc'],
  // `jsdoc` is oxlint's native port (tag hygiene); the JS plugin adds only `require-jsdoc`.
  jsPlugins: [{ name: 'jsdoc-js', specifier: 'eslint-plugin-jsdoc' }],
  categories: {
    correctness: 'error',
    suspicious: 'error',
    perf: 'error'
  },
  // Type-aware rules need the engine's generated declarations, so the local `lint` script
  // passes --type-aware and CI (which never has them) runs the rest.
  rules: {
    // tsc's noUnusedLocals and noUnusedParameters own unused code.
    'no-unused-vars': 'off',
    // The codebase builds new arrays on purpose (immutable updates); lists are small.
    'oxc/no-map-spread': 'off',

    'typescript/no-floating-promises': 'error',
    'typescript/no-misused-promises': 'error',
    'typescript/await-thenable': 'error',
    'typescript/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: true }],
    'typescript/no-unnecessary-type-assertion': 'error',
    'typescript/consistent-type-imports': 'error',
    'import/no-cycle': 'error',
    // The engine's `on(...).catch(($, e, next) => next(e))` is a hook fallback, not a Promise catch.
    'promise/no-callback-in-promise': 'off',

    // Code documentation: TSDoc on every export, well-formed tags everywhere.
    // Off until the register split documents every export (it turns this on).
    'jsdoc-js/require-jsdoc': [
      'off',
      {
        publicOnly: true,
        require: { FunctionDeclaration: true, ArrowFunctionExpression: true },
        contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'ExportNamedDeclaration > VariableDeclaration']
      }
    ],
    'jsdoc/check-tag-names': 'error',
    'jsdoc/empty-tags': 'error',
    'jsdoc/no-defaults': 'error',
    'jsdoc/require-param-description': 'error',
    'jsdoc/require-param-name': 'error',
    'jsdoc/require-returns-description': 'error'
  },
  overrides: [
    {
      // Tests drive the engine step by step (await in a loop is the point), build engine
      // fixtures with assertions, and reuse short names inside each test.
      files: ['**/tests/**'],
      rules: {
        'no-await-in-loop': 'off',
        'no-shadow': 'off',
        'typescript/no-unsafe-type-assertion': 'off',
        'unicorn/consistent-function-scoping': 'off',
        'jsdoc-js/require-jsdoc': 'off'
      }
    }
  ],
  ignorePatterns: ['**/.claude-plugin/types/**', '**/node_modules/**']
})
