export const REPLY = {
  plugin: 'ghostframe',
  surface: 'terminal',
  component: 'AssistantMessage',
  props: { text: '`git worktree add ../hotfix main` gives you a second folder on `main`.', isFirstOfReply: true }
} as const
