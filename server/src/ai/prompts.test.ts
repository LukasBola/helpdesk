import { describe, expect, it } from 'vitest'

import { buildAnalysisRequest, buildDraftRequest, MAX_BODY_CHARS } from './prompts'

const ticket = { subject: 'Printer broken', body: 'It does not print.', customerName: 'Anna' }

describe('prompts', () => {
  it('draft prompt states the draft rules', () => {
    const req = buildDraftRequest(ticket, 'de')
    const s = req.system.toLowerCase()
    expect(s).toContain('acknowledge')
    expect(s).toContain('restate')
    expect(s).toContain('missing information')
    expect(s).toContain('never promise')
    expect(s).toContain('deadlines')
    expect(s).toContain('refunds')
    expect(s).toContain('amounts')
    expect(s).toContain('company rules')
    expect(s).toContain('procedures')
    expect(req.system).toContain('ISO 639-1 code is "de"')
    expect(req.user).toContain('in the language "de"')
    expect(req.temperature).toBe(0.3)
    expect(req.kind).toBe('draft')
  })

  it('analysis prompt asks for both summaries and the language code', () => {
    const req = buildAnalysisRequest(ticket)
    expect(req.kind).toBe('analysis')
    expect(req.temperature).toBe(0)
    expect(req.system).toContain('ISO 639-1')
    expect(req.user).toContain('Printer broken')
    expect(req.user).toContain('Anna')
  })

  it('truncates long bodies', () => {
    const req = buildAnalysisRequest({ ...ticket, body: 'x'.repeat(100_000) })
    expect(req.user.length).toBeLessThan(MAX_BODY_CHARS + 2000)
    expect(req.user).toContain('[…]')
  })

  it('handles an empty body', () => {
    const req = buildDraftRequest({ ...ticket, body: '', customerName: null }, 'en')
    expect(typeof req.user).toBe('string')
    expect(req.user.length).toBeGreaterThan(0)
  })
})
