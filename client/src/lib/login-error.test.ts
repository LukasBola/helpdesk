import { describe, expect, it } from 'vitest'

import { loginErrorKey } from './login-error'

describe('loginErrorKey', () => {
  it.each([
    [401, 'errors.badCredentials'],
    [403, 'errors.badCredentials'],
    [429, 'errors.rateLimited'],
    [500, 'errors.generic'],
    [undefined, 'errors.generic'],
  ])('loginErrorKey(%s)', (status, key) => {
    expect(loginErrorKey(status)).toBe(key)
  })
})
