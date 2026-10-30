import { describe, expect, it } from 'vitest'

import { formatAge, formatDateTime } from './format'

const now = new Date('2026-10-30T12:00:00Z')

describe('formatAge', () => {
  it('3 days in pl and en', () => {
    expect(formatAge('2026-10-27T12:00:00Z', now, 'pl')).toMatch(/3/)
    expect(formatAge('2026-10-27T12:00:00Z', now, 'en')).toMatch(/3 days? ago/)
  })

  it('picks the largest whole unit', () => {
    expect(formatAge('2026-10-30T11:15:00Z', now, 'en')).toMatch(/45 min/)
    expect(formatAge('2026-10-30T09:00:00Z', now, 'en')).toMatch(/3 hr/)
    expect(formatAge('2026-08-30T12:00:00Z', now, 'en')).toMatch(/2 mo/)
  })

  it('says "now" for under a minute and clamps future dates', () => {
    expect(formatAge('2026-10-30T11:59:40Z', now, 'en')).toMatch(/this minute|now|0 min/)
    expect(formatAge('2026-10-30T12:05:00Z', now, 'en')).toMatch(/this minute|now|0 min/)
  })
})

describe('formatDateTime', () => {
  it('formats short date and time per language', () => {
    expect(formatDateTime('2026-10-30T12:00:00Z', 'en')).toMatch(/10\/30\/26/)
    expect(formatDateTime('2026-10-30T12:00:00Z', 'pl')).toMatch(/30\.10\.2026/)
  })
})
