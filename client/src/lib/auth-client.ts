import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// No baseURL: requests go to `${window.location.origin}/api/auth`, i.e. through the Vite proxy.
export const authClient = createAuthClient({
  plugins: [
    // Keep in sync with user.additionalFields in server/src/lib/auth.ts
    inferAdditionalFields({
      user: {
        role: { type: ['AGENT', 'ADMIN'] },
        isBlocked: { type: 'boolean' },
      },
    }),
  ],
})

export const { useSession, signIn, signOut } = authClient

export type Session = typeof authClient.$Infer.Session
export type SessionUser = Session['user']

// signOut() resolves before the session store changes (Better Auth refetches the session
// shortly after). Await this to know the store no longer holds the signed-out user.
export async function refreshSession(): Promise<void> {
  await authClient.$store.atoms.session.get().refetch()
}
