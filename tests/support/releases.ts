export const REPLY = `Contributor counts come from the GitHub releases page I read earlier in this conversation.

| Version | Released | Contributors | Headline |
|---|---|---:|---|
| v1.4.4 | Oct 22, 2026 | 39 | \`bun fmt\`, a formatter that works like Prettier, and faster \`bun check\` ([post](https://bun.com/blog/bun-v1.4.4)) |
| v1.4.3 | Oct 10, 2026 | 8 | \`bun check\`, a type checker, and less CPU use when idle ([post](https://bun.com/blog/bun-v1.4.3)) |
| v1.4.2 | Sep 5, 2026 | 3 | fixes only: Elysia, AsyncLocalStorage, \`@discordjs/ws\` ([post](https://bun.com/blog/bun-v1.4.2)) |

Sources:
- [post](https://bun.com/blog/bun-v1.4.4)
- [post](https://bun.com/blog/bun-v1.4.3)
- [post](https://bun.com/blog/bun-v1.4.2)
- [Releases · oven-sh/bun · GitHub](https://github.com/oven-sh/bun/releases)`

export const TABLE_ONLY = REPLY.split('\n\nSources:')[0] ?? ''
