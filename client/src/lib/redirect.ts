export const DEFAULT_PATH = '/tickets'

// Only same-app relative paths are allowed, so a crafted `from` can't send the user elsewhere.
export function safeRedirectPath(from: unknown): string {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) {
    return DEFAULT_PATH
  }
  if (new URL(from, 'http://x').pathname === '/login') return DEFAULT_PATH
  return from
}
