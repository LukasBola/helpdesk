import { describe, expect, it } from 'vitest'

import { loginErrorMessage } from './login-error'

describe('loginErrorMessage', () => {
  it.each([
    [401, 'Nieprawidłowy e-mail lub hasło'],
    [403, 'Nieprawidłowy e-mail lub hasło'],
    [429, 'Za dużo prób. Spróbuj za chwilę.'],
    [500, 'Coś poszło nie tak. Spróbuj ponownie.'],
    [undefined, 'Coś poszło nie tak. Spróbuj ponownie.'],
  ])('loginErrorMessage(%s)', (status, message) => {
    expect(loginErrorMessage(status)).toBe(message)
  })
})
