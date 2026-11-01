import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createOllamaProvider } from './ollamaProvider'
import { AiInvalidOutputError, AiUnavailableError, type StructuredRequest } from './types'

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../__fixtures__/ollama', name), 'utf8')

const schema = z.object({
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  customerLanguage: z.string().regex(/^[a-z]{2}$/),
})
const jsonSchema = { type: 'object', properties: { priority: { type: 'string' } } }

const request: StructuredRequest<z.infer<typeof schema>> = {
  kind: 'analysis',
  system: 'sys',
  user: 'usr',
  schema,
  jsonSchema,
  temperature: 0.2,
}

const okFetch = (body: string, status = 200) =>
  vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch

const make = (fetchImpl: typeof fetch) =>
  createOllamaProvider({
    host: 'http://ollama:11434',
    model: 'test-model',
    timeoutMs: 1000,
    fetch: fetchImpl,
  })

describe('ollama provider', () => {
  it('sends format, think:false, stream:false and temperature', async () => {
    const f = okFetch(fixture('chat-ok.json'))
    await make(f).generate(request)
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe('http://ollama:11434/api/chat')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
      ],
      stream: false,
      think: false,
      format: jsonSchema,
      options: { temperature: 0.2 },
    })
  })

  it('maps content and usage', async () => {
    const result = await make(okFetch(fixture('chat-ok.json'))).generate(request)
    expect(result.data).toEqual({ priority: 'URGENT', customerLanguage: 'de' })
    expect(result.inputTokens).toBe(812)
    expect(result.outputTokens).toBe(143)
    expect(result.latencyMs).toBe(2500)
    expect(result.raw).toBe('{"priority": "URGENT", "customerLanguage": "de"}')
  })

  it('defaults missing counters to 0', async () => {
    const body = JSON.stringify({
      message: { role: 'assistant', content: '{"priority":"LOW","customerLanguage":"en"}' },
    })
    const result = await make(okFetch(body)).generate(request)
    expect(result.inputTokens).toBe(0)
    expect(result.outputTokens).toBe(0)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('rejects output that fails the schema', async () => {
    for (const name of ['chat-bad-enum.json', 'chat-not-json.json']) {
      const raw = JSON.parse(fixture(name)).message.content
      const err = await make(okFetch(fixture(name)))
        .generate(request)
        .catch(e => e)
      expect(err).toBeInstanceOf(AiInvalidOutputError)
      expect(err.raw).toBe(raw)
      expect(err.usage.inputTokens).toBe(100)
    }
  })

  it('turns connection errors, timeouts and HTTP errors into AiUnavailableError', async () => {
    const refused = vi.fn(async () => {
      throw new TypeError('fetch failed: ECONNREFUSED')
    }) as unknown as typeof fetch
    const aborted = vi.fn(async () => {
      throw new DOMException('The operation was aborted', 'TimeoutError')
    }) as unknown as typeof fetch
    const http500 = okFetch('{"error":"structured output is unavailable"}', 500)

    for (const f of [refused, aborted, http500]) {
      await expect(make(f).generate(request)).rejects.toBeInstanceOf(AiUnavailableError)
    }
    await expect(make(http500).generate(request)).rejects.toThrow(/structured output/)
  })
})
