export const respond = (content: unknown[], uuid: string) =>
  ({
    message: { type: 'assistant', role: 'assistant', content },
    door: 'response',
    origin: { kind: 'model' },
    uuid
  }) as never

export const respondText = (text: string, uuid: string) =>
  ({
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text }] },
    door: 'response',
    origin: { kind: 'model' },
    uuid
  }) as never
