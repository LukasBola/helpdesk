import { describe, expect, it } from 'vitest'

import { safeRedirectPath } from './redirect'

describe('safeRedirectPath', () => {
  it.each([
    ['/tickets/42?tab=history', '/tickets/42?tab=history'],
    ['/users', '/users'],
    ['//evil.com', '/tickets'],
    ['https://evil.com', '/tickets'],
    ['/login', '/tickets'],
    ['/login?x=1', '/tickets'],
    [undefined, '/tickets'],
    [42, '/tickets'],
  ])('safeRedirectPath(%j) → %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected)
  })
})
