// The engine draws each answer row under the id its `session.append` carries (`requestId` = the message id): a
// response made here notes that id for its text, so a test that mounts the answer by its text mounts that row.
const rows = new Map<string, string>()

/**
 * The id the engine draws an answer row under: the uuid of the response that carried its text last.
 * @param text the row's text
 * @returns `{ requestId }`, or nothing when no response carried it
 */
export const rowOf = (text: string): { requestId?: string } => {
  const id = rows.get(text)

  return id === undefined ? {} : { requestId: id }
}

export const respond = (content: unknown[], uuid: string) => {
  for (const b of content) {
    const block = b as { type?: unknown; text?: unknown }

    if (block.type === 'text' && typeof block.text === 'string') rows.set(block.text, uuid)
  }

  return {
    message: { type: 'assistant', role: 'assistant', content },
    door: 'response',
    origin: { kind: 'model' },
    uuid
  } as never
}

export const respondText = (text: string, uuid: string) => respond([{ type: 'text', text }], uuid)
