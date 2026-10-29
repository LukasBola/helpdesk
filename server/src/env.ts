import { z } from 'zod'

const DEV_CLIENT_URL = 'http://localhost:5173'

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    ANTHROPIC_API_KEY: z.string().optional(),
    POSTMARK_WEBHOOK_TOKEN: z.string().optional(),
    OWN_DOMAIN: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    // Origin of the SPA, trusted by Better Auth. Required in production.
    CLIENT_URL: z.preprocess(v => (v === '' ? undefined : v), z.string().url().optional()),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && !data.CLIENT_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLIENT_URL'],
        message: 'Required in production',
      })
    }
  })
  .transform(data => ({ ...data, CLIENT_URL: data.CLIENT_URL ?? DEV_CLIENT_URL }))

const result = schema.safeParse(process.env)

if (!result.success) {
  console.error('Invalid environment variables:')
  console.error(result.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables')
}

export const env = result.data
