import { describe, expect, it } from 'vitest'

import en from './en.json'
import pl from './pl.json'

function leaves(obj: object, prefix = ''): [string, unknown][] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? leaves(value as object, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value] as [string, unknown]],
  )
}

const flattenKeys = (obj: object) => leaves(obj).map(([key]) => key)

describe('locales', () => {
  it('en.json has exactly the same keys as pl.json', () => {
    expect(flattenKeys(en).sort()).toEqual(flattenKeys(pl).sort())
  })

  it('no translation is empty', () => {
    for (const file of [pl, en]) {
      for (const [key, value] of leaves(file)) {
        expect(typeof value, key).toBe('string')
        expect((value as string).trim(), key).not.toBe('')
      }
    }
  })
})
