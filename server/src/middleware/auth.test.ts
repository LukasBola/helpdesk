import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockInstance } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { requireAuth, requireRole } from './auth'

function mockReq(session: Partial<{ userId: string; role: string }> = {}): Request {
  return { session } as unknown as Request
}

function mockRes(): { status: MockInstance; json: MockInstance } & Response {
  const res: { status?: MockInstance; json?: MockInstance } = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res as { status: MockInstance; json: MockInstance } & Response
}

const next = vi.fn() as unknown as NextFunction

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireAuth', () => {
  it('calls next when session has userId', () => {
    const req = mockReq({ userId: 'u1', role: 'AGENT' })
    const res = mockRes()
    requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 401 when no session', () => {
    const req = mockReq()
    const res = mockRes()
    requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('requireRole', () => {
  it('calls next for matching role', () => {
    const req = mockReq({ userId: 'u1', role: 'ADMIN' })
    const res = mockRes()
    requireRole('ADMIN')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 403 for wrong role', () => {
    const req = mockReq({ userId: 'u1', role: 'AGENT' })
    const res = mockRes()
    requireRole('ADMIN')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when no userId in session', () => {
    const req = mockReq()
    const res = mockRes()
    requireRole('ADMIN')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})
