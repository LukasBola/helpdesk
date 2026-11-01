import { describe, expect, it } from 'vitest'

import { analysisSchema, draftSchema } from './schemas'

describe('AI schemas', () => {
  it('accepts a valid analysis', () => {
    const sample = { priority: 'HIGH', customerLanguage: 'pl', summaryPl: 'a', summaryEn: 'b' }
    expect(analysisSchema.safeParse(sample).success).toBe(true)
  })

  it('accepts a valid draft', () => {
    const sample = { draft: 'Hello', translationPl: null, translationEn: 'Hello' }
    expect(draftSchema.safeParse(sample).success).toBe(true)
  })
})
