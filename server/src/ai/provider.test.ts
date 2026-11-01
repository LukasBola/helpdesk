import { describe, expect, it } from 'vitest'

import { createClaudeProvider } from './claudeProvider'
import { createFakeProvider } from './fakeProvider'
import { analysisJsonSchema, analysisSchema, draftJsonSchema, draftSchema } from './schemas'
import { AiUnavailableError } from './types'

describe('providers', () => {
  it('claude provider fails every call as not implemented', async () => {
    const p = createClaudeProvider()
    expect(p.model).toBe('claude')
    await expect(
      p.generate({
        kind: 'analysis',
        system: '',
        user: '',
        schema: analysisSchema,
        jsonSchema: analysisJsonSchema,
        temperature: 0,
      }),
    ).rejects.toThrow(new AiUnavailableError('Claude provider not implemented'))
  })

  it('fake provider returns schema-valid data for both kinds', async () => {
    const p = createFakeProvider()
    const a = await p.generate({
      kind: 'analysis',
      system: '',
      user: '',
      schema: analysisSchema,
      jsonSchema: analysisJsonSchema,
      temperature: 0,
    })
    const d = await p.generate({
      kind: 'draft',
      system: '',
      user: '',
      schema: draftSchema,
      jsonSchema: draftJsonSchema,
      temperature: 0,
    })
    expect(analysisSchema.safeParse(a.data).success).toBe(true)
    expect(draftSchema.safeParse(d.data).success).toBe(true)
  })
})
