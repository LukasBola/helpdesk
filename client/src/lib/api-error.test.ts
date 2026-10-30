import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'

import { apiErrorKey } from './api-error'

function httpError(status: number) {
  return new AxiosError('x', 'ERR', undefined, undefined, {
    status,
    data: {},
    statusText: '',
    headers: {},
    config: {} as never,
  })
}

describe('apiErrorKey', () => {
  it('maps network errors (no response)', () => {
    expect(apiErrorKey(new AxiosError('Network Error'))).toBe('errors.network')
  })
  it.each([
    [404, 'errors.notFound'],
    [422, 'errors.validation'],
    [500, 'errors.generic'],
  ])('maps %s', (status, key) => {
    expect(apiErrorKey(httpError(status))).toBe(key)
  })
  it('falls back to generic for non-axios errors', () => {
    expect(apiErrorKey(new Error('boom'))).toBe('errors.generic')
  })
})
