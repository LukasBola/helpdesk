import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('env', () => {
  beforeEach(() => {
    vi.resetModules()
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
})
