import type { StructuredRequest, StructuredResult } from './types'
import { AiInvalidOutputError, type AiProvider } from './types'

function defaultRespond(req: StructuredRequest<unknown>): unknown {
  if (req.kind === 'analysis') {
    return {
      priority: 'MEDIUM',
      customerLanguage: 'en',
      summaryPl: 'Klient zgłasza problem i prosi o pomoc.',
      summaryEn: 'The customer reports a problem and asks for help.',
    }
  }
  return {
    draft: 'Hello, thank you for contacting us. Could you share more details about the issue?',
    translationPl: 'Dzień dobry, dziękujemy za kontakt. Czy możesz podać więcej szczegółów?',
    translationEn: null,
  }
}

export function createFakeProvider(
  respond: (req: StructuredRequest<unknown>) => unknown = defaultRespond,
): AiProvider {
  return {
    name: 'fake',
    model: 'fake',
    async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const out = respond(req as StructuredRequest<unknown>)
      const raw = JSON.stringify(out)
      const parsed = req.schema.safeParse(out)
      if (!parsed.success) {
        throw new AiInvalidOutputError(`Fake output fails schema: ${parsed.error.message}`, raw, {
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        })
      }
      return {
        data: parsed.data,
        raw,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
      }
    },
  }
}
