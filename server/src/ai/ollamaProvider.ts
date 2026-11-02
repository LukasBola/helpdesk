import {
  AiInvalidOutputError,
  type AiProvider,
  AiUnavailableError,
  type AiUsage,
  type StructuredRequest,
  type StructuredResult,
} from './types'

interface OllamaChatResponse {
  message?: { content?: unknown }
  prompt_eval_count?: number
  eval_count?: number
  total_duration?: number
}

export function createOllamaProvider(opts: {
  host: string
  model: string
  timeoutMs: number
  fetch?: typeof fetch
}): AiProvider {
  const doFetch = opts.fetch ?? fetch
  const baseUrl = opts.host.replace(/\/+$/, '')

  return {
    name: 'ollama',
    model: opts.model,
    async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const startedAt = Date.now()
      let response: Response
      try {
        response = await doFetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: opts.model,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.user },
            ],
            stream: false,
            think: false,
            format: req.jsonSchema,
            options: { temperature: req.temperature },
          }),
          signal: AbortSignal.timeout(opts.timeoutMs),
        })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        throw new AiUnavailableError(`Ollama request failed: ${reason}`, { cause: err })
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new AiUnavailableError(`Ollama HTTP ${response.status}: ${text}`)
      }

      let body: OllamaChatResponse
      try {
        body = (await response.json()) as OllamaChatResponse
      } catch (err) {
        throw new AiUnavailableError('Ollama returned an unreadable response', { cause: err })
      }

      const raw = typeof body.message?.content === 'string' ? body.message.content : ''
      const usage: AiUsage = {
        inputTokens: body.prompt_eval_count ?? 0,
        outputTokens: body.eval_count ?? 0,
        latencyMs:
          typeof body.total_duration === 'number'
            ? Math.round(body.total_duration / 1e6)
            : Date.now() - startedAt,
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        throw new AiInvalidOutputError('Model output is not valid JSON', raw, usage)
      }
      const checked = req.schema.safeParse(parsed)
      if (!checked.success) {
        throw new AiInvalidOutputError(
          `Model output does not match the schema: ${checked.error.message}`,
          raw,
          usage,
        )
      }
      return { data: checked.data, raw, ...usage }
    },
  }
}
