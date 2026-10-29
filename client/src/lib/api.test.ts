import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'
import { signOut } from './auth-client'
import { queryClient } from './queryClient'

vi.mock('./auth-client', () => ({ signOut: vi.fn() }))

function fail401(config: InternalAxiosRequestConfig) {
  const response = { status: 401, config } as AxiosResponse
  return Promise.reject(new AxiosError('401', undefined, config, undefined, response))
}

async function failTickets(times: number) {
  await Promise.allSettled(
    Array.from({ length: times }, () => api.get('/tickets', { adapter: fail401 })),
  )
}

describe('api 401 interceptor', () => {
  beforeEach(() => {
    vi.mocked(signOut).mockResolvedValue({ data: { success: true }, error: null })
    vi.spyOn(queryClient, 'clear')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('signs out once when several requests get 401 at the same time', async () => {
    await failTickets(3)
    await vi.waitFor(() => expect(queryClient.clear).toHaveBeenCalled())
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('ignores 401 from /auth endpoints', async () => {
    await api.get('/auth/get-session', { adapter: fail401 }).catch(() => undefined)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('rethrows the original error', async () => {
    await expect(api.get('/tickets', { adapter: fail401 })).rejects.toMatchObject({
      response: { status: 401 },
    })
  })

  it('allows a later sign-out after the first one completes', async () => {
    await failTickets(2)
    await vi.waitFor(() => expect(queryClient.clear).toHaveBeenCalledTimes(1))
    await failTickets(2)
    await vi.waitFor(() => expect(queryClient.clear).toHaveBeenCalledTimes(2))
    expect(signOut).toHaveBeenCalledTimes(2)
  })
})
