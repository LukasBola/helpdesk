import type { ZodType } from 'zod'

export type AiProviderName = 'ollama' | 'claude' | 'fake'
export type AiTaskKind = 'analysis' | 'draft'

export interface StructuredRequest<T> {
  kind: AiTaskKind
  system: string
  user: string
  schema: ZodType<T>
  jsonSchema: Record<string, unknown>
  temperature: number
}

export interface AiUsage {
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

export interface StructuredResult<T> extends AiUsage {
  data: T
  raw: string
}

export interface AiProvider {
  name: AiProviderName
  model: string
  generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>
}

/** Network failure, timeout, HTTP error or provider not implemented. */
export class AiUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AiUnavailableError'
  }
}

/** The model answered, but the output is not valid JSON or fails the schema. */
export class AiInvalidOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
    readonly usage: AiUsage,
  ) {
    super(message)
    this.name = 'AiInvalidOutputError'
  }
}
