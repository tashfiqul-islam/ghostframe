// A stand-in for the Messages API, for the live benchmark: Claude Code runs against it (ANTHROPIC_BASE_URL), so a
// turn streams with no account and no cost, the same way every run. Every request is answered with one reply that
// streams its text in small pieces, a piece every `pieceMs`, as a model streams: prose, a table and a code block.
import type { Server } from 'bun'

/** The reply every turn streams. */
export const REPLY: string = [
  'The width check counts **grapheme clusters** now. Here is what changed:',
  '',
  '| file | adds | dels |',
  '| --- | ---: | ---: |',
  ...Array.from({ length: 8 }, (_, i) => `| src/module-${i}.ts | ${i * 3} | ${i} |`),
  '',
  '```ts',
  ...Array.from({ length: 24 }, (_, i) => `export const value${i} = (s: string): number => [...new Intl.Segmenter().segment(s)].length + ${i}`),
  '```',
  '',
  ...Array.from({ length: 12 }, (_, i) => `Paragraph ${i}: the cache keys each row by its id, its width and its version, so a frame draws only what changed.`)
].join('\n')

const event = (type: string, data: Record<string, unknown>): string => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`

/**
 * Starts the stand-in on a free port.
 * @param pieceMs the gap between streamed pieces
 * @param pieceChars the characters in each piece
 * @returns the server, and how many requests it answered
 */
export function startMockApi(pieceMs = 15, pieceChars = 12): { server: Server<undefined>; url: string; requests: () => number } {
  let requests = 0
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(req) {
      if (process.env['MOCKAPI_LOG'] === '1') console.log('mockapi', req.method, req.url)
      const url = new URL(req.url)

      if (req.method !== 'POST' || !url.pathname.endsWith('/messages')) {
        return url.pathname.endsWith('/count_tokens') ? Response.json({ input_tokens: 100 }) : Response.json({}, { status: 404 })
      }
      requests += 1
      const body = (await req.json()) as { stream?: boolean; model?: string }
      const model = body.model ?? 'claude-opus-5-5'
      const message = {
        id: `msg_bench_${requests}`,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 1 }
      }

      if (body.stream !== true) {
        return Response.json({
          ...message,
          content: [{ type: 'text', text: REPLY }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 400 }
        })
      }

      const stream = new ReadableStream<string>({
        async start(c) {
          c.enqueue(event('message_start', { message }))
          c.enqueue(event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }))
          for (let i = 0; i < REPLY.length; i += pieceChars) {
            c.enqueue(event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: REPLY.slice(i, i + pieceChars) } }))
            await Bun.sleep(pieceMs)
          }
          c.enqueue(event('content_block_stop', { index: 0 }))
          c.enqueue(event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 400 } }))
          c.enqueue(event('message_stop', {}))
          c.close()
        }
      })

      return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } })
    }
  })

  return { server, url: `http://127.0.0.1:${server.port}`, requests: () => requests }
}
