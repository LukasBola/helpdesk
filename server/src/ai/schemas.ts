import { z } from 'zod'

export const analysisSchema = z.object({
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  customerLanguage: z.string().regex(/^[a-z]{2}$/),
  summaryPl: z.string().min(1).max(1000),
  summaryEn: z.string().min(1).max(1000),
})

export const draftSchema = z.object({
  draft: z.string().min(1).max(5000),
  translationPl: z.string().nullable(),
  translationEn: z.string().nullable(),
})

export type Analysis = z.infer<typeof analysisSchema>
export type Draft = z.infer<typeof draftSchema>

export const analysisJsonSchema = {
  type: 'object',
  properties: {
    priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
    customerLanguage: { type: 'string', pattern: '^[a-z]{2}$' },
    summaryPl: { type: 'string', minLength: 1, maxLength: 1000 },
    summaryEn: { type: 'string', minLength: 1, maxLength: 1000 },
  },
  required: ['priority', 'customerLanguage', 'summaryPl', 'summaryEn'],
  additionalProperties: false,
}

export const draftJsonSchema = {
  type: 'object',
  properties: {
    draft: { type: 'string', minLength: 1, maxLength: 5000 },
    translationPl: { type: ['string', 'null'] },
    translationEn: { type: ['string', 'null'] },
  },
  required: ['draft', 'translationPl', 'translationEn'],
  additionalProperties: false,
}
