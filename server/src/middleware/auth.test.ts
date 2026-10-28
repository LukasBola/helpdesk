import type { NextFunction, Request, Response } from 'express'
import type { MockInstance } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

import { auth } from '../lib/auth'
import { requireAuth, requireRole } from './auth'

const getSession = auth.api.getSession as unknown as MockInstance

function mockReq(currentUser?: Request['currentUser']): Request {
  return { headers: {}, currentUser } as unknown as Request
}

function mockRes(): { status: MockInstance; json: MockInstance } & Response {
  const res: { status?: MockInstance; json?: MockInstance } = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res as { status: MockInstance; json: MockInstance } & Response
}

function session(role: 'AGENT' | 'ADMIN', isBlocked = false) {
  return { user: { id: 'u1', role, isBlocked } }
}

const next = vi.fn() as unknown as NextFunction

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireAuth', () => {
  it('sets req.currentUser and calls next when session exists', async () => {
    getSession.mockResolvedValue(session('AGENT'))
    const req = mockReq()
    await requireAuth(req, mockRes(), next)
    expect(req.currentUser).toEqual({ id: 'u1', role: 'AGENT' })
    expect(next).toHaveBeenCalledWith()
  })

  it('returns 401 when no session', async () => {
    getSession.mockResolvedValue(null)
    const res = mockRes()
    await requireAuth(mockReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when user is blocked', async () => {
    getSession.mockResolvedValue(session('AGENT', true))
    const res = mockRes()
    await requireAuth(mockReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('forwards session lookup errors to next', async () => {
    getSession.mockRejectedValue(new Error('db down'))
    const res = mockRes()
    await requireAuth(mockReq(), res, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect(res.status).not.toHaveBeenCalled()
  })
})

describe('requireRole', () => {
  it('calls next for matching role', async () => {
    getSession.mockResolvedValue(session('ADMIN'))
    await requireRole('ADMIN')(mockReq(), mockRes(), next)
    expect(next).toHaveBeenCalledWith()
  })

  it('returns 403 for insufficient role', async () => {
    getSession.mockResolvedValue(session('AGENT'))
    const res = mockRes()
    await requireRole('ADMIN')(mockReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows ADMIN to pass an AGENT role check', async () => {
    getSession.mockResolvedValue(session('ADMIN'))
    await requireRole('AGENT')(mockReq(), mockRes(), next)
    expect(next).toHaveBeenCalledWith()
  })

  it('returns 401 when no session', async () => {
    getSession.mockResolvedValue(null)
    const res = mockRes()
    await requireRole('ADMIN')(mockReq(), res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('reuses req.currentUser set by requireAuth without a second lookup', async () => {
    await requireRole('ADMIN')(mockReq({ id: 'u1', role: 'ADMIN' }), mockRes(), next)
    expect(getSession).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith()
  })

  it('forwards session lookup errors to next', async () => {
    getSession.mockRejectedValue(new Error('db down'))
    await requireRole('ADMIN')(mockReq(), mockRes(), next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
