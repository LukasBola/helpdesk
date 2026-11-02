import { AiNotImplementedError, type AiProvider } from './types'

export function createClaudeProvider(): AiProvider {
  return {
    name: 'claude',
    model: 'claude',
    async generate() {
      throw new AiNotImplementedError('Claude provider not implemented')
    },
  }
}
