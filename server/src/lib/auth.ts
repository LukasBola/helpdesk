import { BASE_ERROR_CODES, betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError, createAuthMiddleware } from 'better-auth/api'

import { prisma } from '../db'
import { env } from '../env'

export const PASSWORD_LENGTH = { min: 8, max: 128 }
export const NAME_MAX_LENGTH = 100

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  advanced: {
    database: {
      generateId: false,
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: PASSWORD_LENGTH.min,
    maxPasswordLength: PASSWORD_LENGTH.max,
  },
  user: {
    // Keep in sync with inferAdditionalFields in client/src/lib/auth-client.ts
    additionalFields: {
      role: {
        type: ['AGENT', 'ADMIN'],
        required: false,
        defaultValue: 'AGENT',
        input: false,
      },
      isBlocked: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Runs after the password is verified, so blocked accounts don't respond faster.
        // Same error as a wrong password, so the response doesn't reveal a blocked account.
        before: async session => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isBlocked: true },
          })
          if (!user || user.isBlocked) {
            throw APIError.from('UNAUTHORIZED', BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD)
          }
        },
      },
    },
  },
  hooks: {
    // Better Auth doesn't validate the name; it's shown to other agents (history, avatar).
    before: createAuthMiddleware(async ctx => {
      if (ctx.path !== '/update-user' || !ctx.body || !('name' in ctx.body)) return
      const name = typeof ctx.body.name === 'string' ? ctx.body.name.trim() : ''
      if (!name || name.length > NAME_MAX_LENGTH) {
        throw new APIError('BAD_REQUEST', { message: 'Invalid name' })
      }
      return { context: { ...ctx, body: { ...ctx.body, name } } }
    }),
  },
  trustedOrigins: [env.CLIENT_URL],
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
})
