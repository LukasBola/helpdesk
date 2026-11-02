import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('env', () => {
  const originalPort = process.env.PORT

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    // Restore PORT after direct deletion — vi.unstubAllEnvs() only restores stubbed keys
    if (originalPort !== undefined) process.env.PORT = originalPort
    else delete process.env.PORT
  })

  it('throws when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '')
    await expect(import('./env')).rejects.toThrow()
  })

  it('parses valid env without throwing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(32))
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
    vi.stubEnv('PORT', '3000')
    const { env } = await import('./env')
    expect(env.PORT).toBe(3000)
  })

  it('coerces PORT string to number', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(32))
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
    vi.stubEnv('PORT', '5000')
    const { env } = await import('./env')
    expect(env.PORT).toBe(5000)
    expect(typeof env.PORT).toBe('number')
  })

  it('uses PORT default when not provided', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(32))
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
    delete process.env.PORT
    const { env } = await import('./env')
    expect(env.PORT).toBe(3000)
  })

  it('allows optional fields to be undefined', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(32))
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
    delete process.env.PORT
    const { env } = await import('./env')
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('throws when BETTER_AUTH_SECRET is too short', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(31))
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
    await expect(import('./env')).rejects.toThrow()
  })

  it('throws when BETTER_AUTH_URL is not a URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(32))
    vi.stubEnv('BETTER_AUTH_URL', 'not-a-url')
    await expect(import('./env')).rejects.toThrow()
  })

  function stubBase(nodeEnv: string, clientUrl: string) {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('BETTER_AUTH_SECRET', 'b'.repeat(32))
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
    vi.stubEnv('NODE_ENV', nodeEnv)
    vi.stubEnv('CLIENT_URL', clientUrl)
  }

  it('defaults CLIENT_URL to the Vite origin outside production', async () => {
    stubBase('development', '')
    const { env } = await import('./env')
    expect(env.CLIENT_URL).toBe('http://localhost:5173')
  })

  it('requires CLIENT_URL in production', async () => {
    stubBase('production', '')
    await expect(import('./env')).rejects.toThrow()
  })

  it('accepts an explicit CLIENT_URL in production', async () => {
    stubBase('production', 'https://helpdesk.example.com')
    const { env } = await import('./env')
    expect(env.CLIENT_URL).toBe('https://helpdesk.example.com')
  })

  it('defaults AI settings to local Ollama', async () => {
    stubBase('development', '')
    vi.stubEnv('AI_PROVIDER', '')
    vi.stubEnv('OLLAMA_HOST', '')
    vi.stubEnv('OLLAMA_MODEL', '')
    vi.stubEnv('AI_TIMEOUT_MS', '')
    delete process.env.AI_PROVIDER
    delete process.env.OLLAMA_HOST
    delete process.env.OLLAMA_MODEL
    delete process.env.AI_TIMEOUT_MS
    const { env } = await import('./env')
    expect(env.AI_PROVIDER).toBe('ollama')
    expect(env.OLLAMA_HOST).toBe('http://localhost:11434')
    expect(env.OLLAMA_MODEL).toBe('qwen3.8:27b-q4_K_M')
    expect(env.AI_TIMEOUT_MS).toBe(120000)
  })

  it('rejects an unknown AI_PROVIDER', async () => {
    stubBase('development', '')
    vi.stubEnv('AI_PROVIDER', 'gpt')
    await expect(import('./env')).rejects.toThrow()
  })
})
