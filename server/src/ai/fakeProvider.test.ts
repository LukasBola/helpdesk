import { describe, expect, it } from 'vitest'

import { createFakeProvider } from './fakeProvider'
import { analysisJsonSchema, analysisSchema } from './schemas'
import { AiInvalidOutputError } from './types'

describe('fake provider', () => {
  it('rejects custom output that fails the schema', async () => {
    const provider = createFakeProvider(() => ({ priority: 'NOPE' }))
    const call = provider.generate({
      kind: 'analysis',
      system: '',
      user: '',
      schema: analysisSchema,
      jsonSchema: analysisJsonSchema,
      temperature: 0,
    })
    await expect(call).rejects.toBeInstanceOf(AiInvalidOutputError)
    await expect(call).rejects.toMatchObject({ raw: '{"priority":"NOPE"}' })
  })
})
