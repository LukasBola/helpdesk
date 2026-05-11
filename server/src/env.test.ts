import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('env', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '')
    await expect(import('./env')).rejects.toThrow()
  })

  it('parses valid env without throwing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(32))
    vi.stubEnv('PORT', '3000')
    const { env } = await import('./env')
    expect(env.PORT).toBe(3000)
  })

  it('throws when SESSION_SECRET is too short', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(31))
    await expect(import('./env')).rejects.toThrow()
  })

  it('coerces PORT string to number', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(32))
    vi.stubEnv('PORT', '5000')
    const { env } = await import('./env')
    expect(env.PORT).toBe(5000)
    expect(typeof env.PORT).toBe('number')
  })

  it('uses PORT default when not provided', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(32))
    delete process.env.PORT
    const { env } = await import('./env')
    expect(env.PORT).toBe(3000)
  })

  it('allows optional fields to be undefined', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(32))
    delete process.env.PORT
    const { env } = await import('./env')
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })
})
