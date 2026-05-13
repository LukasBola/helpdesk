import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ANTHROPIC_API_KEY: z.string().optional(),
  POSTMARK_WEBHOOK_TOKEN: z.string().optional(),
  OWN_DOMAIN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
})

const result = schema.safeParse(process.env)

if (!result.success) {
  console.error('Invalid environment variables:')
  console.error(result.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables')
}

export const env = result.data
