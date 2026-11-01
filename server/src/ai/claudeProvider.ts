import { type AiProvider, AiUnavailableError } from './types'

export function createClaudeProvider(): AiProvider {
  return {
    name: 'claude',
    model: 'claude',
    async generate() {
      throw new AiUnavailableError('Claude provider not implemented')
    },
  }
}
