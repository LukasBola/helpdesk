import { USERS } from '../fixtures/users'

const REDACTED = '[REDACTED]'

// Known secrets and personal data used by the suite. Longest first, so a value
// that contains another one is replaced as a whole.
const KNOWN = [
  ...Object.values(USERS).flatMap(user => [user.password, user.name]),
  // Read here, not via USERS: users.ts is imported before the config loads .env.
  process.env.E2E_PASSWORD,
  process.env.POSTMARK_WEBHOOK_TOKEN,
]
  .filter((value): value is string => !!value && value.length >= 4)
  .sort((a, b) => b.length - a.length)

const PATTERNS: [RegExp, string][] = [
  [/[\w.%+-]+@[\w-]+(\.[\w-]+)+/g, REDACTED], // e-mail addresses
  [/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, `$1 ${REDACTED}`],
  [
    /\b([\w.-]*(?:password|passwd|secret|token|authorization|cookie|api[_-]?key))(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
    `$1$2${REDACTED}`,
  ],
]

// The single place where everything printed by the step reporter is masked.
// It only touches log text: test data, requests and assertions are unchanged.
export function mask(text: string): string {
  let result = text
  for (const secret of KNOWN) result = result.split(secret).join(REDACTED)
  for (const [pattern, replacement] of PATTERNS) result = result.replace(pattern, replacement)
  return result
}
