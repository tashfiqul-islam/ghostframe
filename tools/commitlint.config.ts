import { RuleConfigSeverity, type UserConfig } from '@commitlint/types'

const ERROR = RuleConfigSeverity.Error

// Squash merges take the PR title, so the PR title check and the commit-msg hook share these rules.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [ERROR, 'always', ['feat', 'fix', 'perf', 'refactor', 'test', 'docs', 'style', 'build', 'ci', 'chore', 'revert', 'security']],
    'scope-enum': [ERROR, 'always', ['hooks', 'theme', 'tests', 'deps', 'actions', 'ci', 'docs', 'release', 'tooling']],
    'header-max-length': [ERROR, 'always', 100],
    'body-max-line-length': [ERROR, 'always', 100]
  }
} satisfies UserConfig
