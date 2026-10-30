import { AxiosError, type AxiosResponse } from 'axios'
import { describe, expect, it } from 'vitest'

import { shouldRetry } from './queryClient'

function axiosError(status: number | undefined) {
  const response = status ? ({ status } as AxiosResponse) : undefined
  return new AxiosError('x', undefined, undefined, undefined, response)
}

describe('shouldRetry', () => {
  it('does not retry 4xx', () => {
    expect(shouldRetry(0, axiosError(401))).toBe(false)
    expect(shouldRetry(0, axiosError(404))).toBe(false)
  })

  it('retries 5xx up to twice', () => {
    expect(shouldRetry(0, axiosError(503))).toBe(true)
    expect(shouldRetry(1, axiosError(503))).toBe(true)
    expect(shouldRetry(2, axiosError(503))).toBe(false)
  })

  it('retries network errors (no response)', () => {
    expect(shouldRetry(0, axiosError(undefined))).toBe(true)
  })

  it('does not retry non-axios errors', () => {
    expect(shouldRetry(0, new Error('x'))).toBe(false)
  })
})
