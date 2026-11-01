import { env } from '../env'
import { createClaudeProvider } from './claudeProvider'
import { createFakeProvider } from './fakeProvider'
import { createOllamaProvider } from './ollamaProvider'
import type { AiProvider } from './types'

let instance: AiProvider | undefined

export function getAiProvider(): AiProvider {
  if (!instance) {
    switch (env.AI_PROVIDER) {
      case 'claude':
        instance = createClaudeProvider()
        break
      case 'fake':
        instance = createFakeProvider()
        break
      default:
        instance = createOllamaProvider({
          host: env.OLLAMA_HOST,
          model: env.OLLAMA_MODEL,
          timeoutMs: env.AI_TIMEOUT_MS,
        })
    }
  }
  return instance
}
