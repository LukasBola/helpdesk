import { vi } from 'vitest'

// Factory for the auth client mock. Every test file that renders routes uses:
//   vi.mock('@/lib/auth-client', async () => (await import('@/test/auth-client-mock')).authClientMock())
// so a new export in auth-client.ts only needs adding here.
// Lives apart from render.tsx on purpose: render.tsx imports the (mocked) auth client,
// so importing the factory from there would be circular inside vi.mock.
export function authClientMock() {
  return {
    useSession: vi.fn(),
    signIn: { email: vi.fn() },
    signOut: vi.fn(),
    updateUser: vi.fn(),
    refreshSession: vi.fn(),
  }
}
