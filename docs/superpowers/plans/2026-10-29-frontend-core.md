# Frontend Core Implementation Plan (Plan 05)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React SPA skeleton for the helpdesk: Better Auth login, protected and role-gated routes, a "Soft / pastel" AppShell (sidebar, header, avatar menu, mobile drawer), logout, a 404 page and placeholder pages, plus the two server changes the client needs.

**Architecture:** Session state comes only from `better-auth/react` (`useSession`), via a single `authClient` instance in `client/src/lib/auth-client.ts`. Its `baseURL` is omitted, so requests go through the Vite `/api` proxy. A user counts as "logged in" when there is a session and `user.isBlocked !== true`. `ProtectedRoute` gates the AppShell routes. Non-auth API calls go through one axios instance, whose 401 interceptor signs out exactly once. Styling uses the shadcn CSS variables plus a few Tailwind extensions. Radix `Sheet` and `DropdownMenu` provide the mobile drawer and the avatar menu.

**Tech Stack:** React 18, React Router 6, TanStack Query 5, axios, `better-auth` 1.7.14 (`better-auth/react`), Tailwind 3, shadcn/ui (Radix), lucide-react, Vitest + React Testing Library + jsdom. Server: Express, Better Auth, Zod env, Vitest + Supertest.

**Spec:** `docs/superpowers/specs/2026-10-29-frontend-core-design.md` (revision 2). Read it first. The visual direction and the behavior rules there are binding.

## Global Constraints

- The branch is `feature/frontend-core`. Every commit must pass the pre-commit hook (`pnpm typecheck` + `prettier --check .`), so run `pnpm format` before committing.
- `better-auth` in the client must be exactly `1.7.14`, the same version as the server.
- Do not import anything from `server/` into `client/`. Additional user fields are typed through the **explicit** `inferAdditionalFields({ user: { role: { type: ['AGENT', 'ADMIN'] }, isBlocked: { type: 'boolean' } } })`.
- `createAuthClient()` is called **without** `baseURL`.
- Do not edit `.env` or any `.env*` file other than `.env.example`.
- No React, Tailwind or shadcn upgrades. No dark mode, because the `.dark` block in `index.css` stays untouched.
- The UI language is Polish. These exact strings are fixed:
  - login subtitle: `Zaloguj się do panelu agenta`
  - labels: `E-mail`, `Hasło`
  - submit button: `Zaloguj się`
  - credential error (401/403): `Nieprawidłowy e-mail lub hasło`
  - rate limit (429): `Za dużo prób. Spróbuj za chwilę.`
  - other errors: `Coś poszło nie tak. Spróbuj ponownie.`
  - greeting: `Dzień dobry,` followed by the first word of `user.name` and ` 👋`
  - nav labels: `Tickety` (`/tickets`), `Moje` (`/tickets/mine`), `Baza wiedzy` (`/knowledge-base`), `Użytkownicy` (`/users`, ADMIN only)
  - logout: `Wyloguj`
  - 404: `Nie znaleziono strony` and the button `Wróć do ticketów` → `/tickets`
- Mobile breakpoint: below `md` (768 px). Touch targets are at least 44 px high (`min-h-11`). No horizontal scroll at 360 px.
- UI client tests mock `@/lib/auth-client`, never `better-auth/react`.

## Review Focus

1. **A blocked user with a live session** (blocked after logging in) must never cause a `/login` ↔ `/tickets` loop. Expected: they see the login form. Tested in Task 3 (`ProtectedRoute`) and in Task 3 (`LoginPage` does not redirect a blocked session).
2. **Several API calls failing with 401 at once** (session expired while several queries are mounted) must result in exactly one `signOut()`. Tested in Task 2.
3. **A malicious `from` in the redirect state** (`//evil.com`, `https://evil.com`, `/login`) must land on `/tickets`. Tested in Task 2 (`safeRedirectPath`).
4. **A refresh while the session is pending** must show only the loader, with no flash of the login form or of the app. Tested in Task 3.
5. **An AGENT typing `/users` by hand** must land on `/tickets`, and an ADMIN must see the page. Tested in Task 3.

---

## File Structure

```
server/src/
├── env.ts                       # + CLIENT_URL (default in non-production, required in production)
├── env.test.ts                  # + CLIENT_URL tests
├── lib/auth.ts                  # + trustedOrigins, unified blocked-user error
└── lib/auth.test.ts             # + trustedOrigins and identical-error tests
.env.example                     # + CLIENT_URL

client/
├── package.json                 # + better-auth@1.7.14, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @testing-library/jest-dom
├── tailwind.config.js           # + app gradient, soft shadow
└── src/
    ├── index.css                # theme variables (Soft / pastel)
    ├── test-setup.ts            # jest-dom + Radix/jsdom polyfills
    ├── test/render.tsx          # renderRoute() helper + session fixtures
    ├── main.tsx                 # QueryClientProvider + BrowserRouter + <App/>
    ├── App.tsx                  # route table (AppRoutes)
    ├── lib/
    │   ├── auth-client.ts       # authClient, useSession, signIn, signOut, SessionUser
    │   ├── session.ts           # getActiveUser()
    │   ├── redirect.ts          # safeRedirectPath()
    │   ├── login-error.ts       # loginErrorMessage()
    │   ├── queryClient.ts       # queryClient, shouldRetry()
    │   └── api.ts               # axios instance + 401 interceptor
    ├── hooks/useLogout.ts
    ├── components/
    │   ├── ui/sheet.tsx         # shadcn
    │   ├── ui/dropdown-menu.tsx # shadcn
    │   ├── Logo.tsx
    │   ├── FullScreenLoader.tsx
    │   ├── auth/ProtectedRoute.tsx
    │   └── layout/
    │       ├── AppShell.tsx
    │       ├── SidebarNav.tsx
    │       └── UserMenu.tsx
    └── pages/
        ├── LoginPage.tsx
        ├── NotFoundPage.tsx
        └── PlaceholderPage.tsx
```

---

### Task 1: Server — `CLIENT_URL`, `trustedOrigins`, identical sign-in errors

**Files:**

- Modify: `server/src/env.ts`, `server/src/lib/auth.ts`, `.env.example`
- Test: `server/src/env.test.ts`, `server/src/lib/auth.test.ts`

**Interfaces:**

- Produces: `env.CLIENT_URL: string`, `auth.options.trustedOrigins` containing `env.CLIENT_URL`.

- [ ] **Step 1: Write the failing env tests** in `server/src/env.test.ts`. Reuse the existing `vi.stubEnv` + `import('./env')` pattern and stub the valid base vars from the "parses valid env" test:

```ts
it('defaults CLIENT_URL to the Vite origin outside production', async () => {
  // stub valid DATABASE_URL / BETTER_AUTH_SECRET / BETTER_AUTH_URL, NODE_ENV=development, CLIENT_URL=''
  const { env } = await import('./env')
  expect(env.CLIENT_URL).toBe('http://localhost:5173')
})

it('requires CLIENT_URL in production', async () => {
  // stub valid base vars, NODE_ENV=production, CLIENT_URL=''
  await expect(import('./env')).rejects.toThrow()
})

it('accepts an explicit CLIENT_URL in production', async () => {
  // stub valid base vars, NODE_ENV=production, CLIENT_URL='https://helpdesk.example.com'
  const { env } = await import('./env')
  expect(env.CLIENT_URL).toBe('https://helpdesk.example.com')
})
```

Note: `vi.stubEnv('CLIENT_URL', '')` sets an empty string. The schema must treat an empty string as missing, so use `z.preprocess(v => (v === '' ? undefined : v), ...)` or an equivalent.

- [ ] **Step 2: Run** `pnpm --filter server exec vitest run src/env.test.ts`. Expected: the three new tests FAIL.

- [ ] **Step 3: Add `CLIENT_URL` to the schema in `server/src/env.ts`.** It is an optional URL. After `safeParse`, when `NODE_ENV === 'production'` and it is missing, fail with the same "Invalid environment variables" error path (a `superRefine` on the object is fine). Otherwise default it to `'http://localhost:5173'`. The exported type has `CLIENT_URL: string`, not optional.

- [ ] **Step 4: Run the env tests again.** Expected: PASS.

- [ ] **Step 5: Write the failing auth tests** in `server/src/lib/auth.test.ts`, with the existing `ACTIVE`/`BLOCKED` users:

```ts
describe('trustedOrigins', () => {
  it('trusts the client origin', () => {
    expect(auth.options.trustedOrigins).toContain(env.CLIENT_URL)
  })
})

describe('sign-in errors', () => {
  it('returns the same error for a wrong password and a blocked account', async () => {
    const wrong = await auth.api
      .signInEmail({ body: { email: ACTIVE, password: 'wrong-password' } })
      .catch(e => e)
    const blocked = await auth.api
      .signInEmail({ body: { email: BLOCKED, password: PASSWORD } })
      .catch(e => e)
    expect(blocked.status).toBe(wrong.status)
    expect(blocked.body).toEqual(wrong.body) // same code + message
  })
})
```

(Import `env` from `'../env'`.)

- [ ] **Step 6: Run** `pnpm --filter server exec vitest run src/lib/auth.test.ts`. Expected: both new tests FAIL. The blocked body has the message `Invalid credentials`.

- [ ] **Step 7: Make the changes in `server/src/lib/auth.ts`:**
  - add `trustedOrigins: [env.CLIENT_URL]`;
  - in `databaseHooks.session.create.before`, replace the `new APIError('UNAUTHORIZED', { message: 'Invalid credentials' })` with `APIError.from('UNAUTHORIZED', BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD)`. This is what Better Auth's own sign-in route throws (`node_modules/better-auth/dist/api/routes/sign-in.mjs`). Import `BASE_ERROR_CODES` from where that file imports it, and check that the import path is public.
  - add a one-line comment next to `additionalFields`: `// Keep in sync with inferAdditionalFields in client/src/lib/auth-client.ts`.

- [ ] **Step 8: Add `CLIENT_URL=http://localhost:5173` to `.env.example`**, with a comment that it is required in production. If a permission rule blocks the edit, stop and ask the user.

- [ ] **Step 9: Run the whole server suite** with `pnpm --filter server test`. Expected: all tests PASS, including the existing blocked-user tests in `auth.integration.test.ts` (they assert status, not message).

- [ ] **Step 10: Commit**

```bash
git add server/src/env.ts server/src/env.test.ts server/src/lib/auth.ts server/src/lib/auth.test.ts .env.example
git commit -m "feat(server): trust client origin and unify sign-in errors"
```

---

### Task 2: Client foundations — auth client, API client, query client, pure helpers, test setup

**Files:**

- Modify: `client/package.json`, `client/src/test-setup.ts`
- Create: `client/src/lib/auth-client.ts`, `client/src/lib/session.ts`, `client/src/lib/redirect.ts`, `client/src/lib/login-error.ts`, `client/src/lib/queryClient.ts`, `client/src/lib/api.ts`
- Test: `client/src/lib/session.test.ts`, `client/src/lib/redirect.test.ts`, `client/src/lib/login-error.test.ts`, `client/src/lib/queryClient.test.ts`, `client/src/lib/api.test.ts`

**Interfaces:**

- Produces:
  - `auth-client.ts`: `authClient` (from `createAuthClient({ plugins: [inferAdditionalFields({...})] })`), plus `export const { useSession, signIn, signOut } = authClient`, `export type Session = typeof authClient.$Infer.Session` and `export type SessionUser = Session['user']`.
  - `session.ts`: `getActiveUser(data: Session | null | undefined): SessionUser | null`. Returns `null` when there is no data or `data.user.isBlocked === true`.
  - `redirect.ts`: `safeRedirectPath(from: unknown): string`. Returns `from` only if it is a string starting with `/`, not starting with `//`, and its pathname is not `/login`. Otherwise it returns `'/tickets'`. The `DEFAULT_PATH = '/tickets'` export is reused by the pages.
  - `login-error.ts`: `loginErrorMessage(status: number | undefined): string`, using the three fixed strings from Global Constraints.
  - `queryClient.ts`: `shouldRetry(failureCount: number, error: unknown): boolean` and `queryClient` (with `retry: shouldRetry`, `refetchOnWindowFocus: false`).
  - `api.ts`: `api: AxiosInstance` (`baseURL: '/api'`, `withCredentials: true`).

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter client add better-auth@1.7.14 @radix-ui/react-dialog @radix-ui/react-dropdown-menu
pnpm --filter client add -D @testing-library/jest-dom
```

- [ ] **Step 2: Fill `client/src/test-setup.ts`.** It imports `@testing-library/jest-dom/vitest` and polyfills for jsdom the APIs Radix needs: `window.PointerEvent` (extend `MouseEvent`), `Element.prototype.hasPointerCapture` / `setPointerCapture` / `releasePointerCapture`, `Element.prototype.scrollIntoView` and `window.matchMedia`, each one only if it is missing.

- [ ] **Step 3: Write the failing tests for the pure helpers**

```ts
// redirect.test.ts
it.each([
  ['/tickets/42?tab=history', '/tickets/42?tab=history'],
  ['/users', '/users'],
  ['//evil.com', '/tickets'],
  ['https://evil.com', '/tickets'],
  ['/login', '/tickets'],
  ['/login?x=1', '/tickets'],
  [undefined, '/tickets'],
  [42, '/tickets'],
])('safeRedirectPath(%j) → %s', (input, expected) => {
  expect(safeRedirectPath(input)).toBe(expected)
})

// login-error.test.ts
it.each([
  [401, 'Nieprawidłowy e-mail lub hasło'],
  [403, 'Nieprawidłowy e-mail lub hasło'],
  [429, 'Za dużo prób. Spróbuj za chwilę.'],
  [500, 'Coś poszło nie tak. Spróbuj ponownie.'],
  [undefined, 'Coś poszło nie tak. Spróbuj ponownie.'],
])('loginErrorMessage(%s)', (status, msg) => expect(loginErrorMessage(status)).toBe(msg))

// session.test.ts
it('returns null without a session', () => expect(getActiveUser(null)).toBeNull())
it('returns null for a blocked user', () =>
  expect(getActiveUser(sessionFor({ isBlocked: true }))).toBeNull())
it('returns the user otherwise', () =>
  expect(getActiveUser(sessionFor({}))?.email).toBe('anna@firma.pl'))

// queryClient.test.ts
it('does not retry 4xx', () => expect(shouldRetry(0, axiosError(401))).toBe(false))
it('retries 5xx up to twice', () => {
  expect(shouldRetry(0, axiosError(503))).toBe(true)
  expect(shouldRetry(2, axiosError(503))).toBe(false)
})
it('retries network errors (no response)', () =>
  expect(shouldRetry(0, axiosError(undefined))).toBe(true))
it('does not retry non-axios errors', () => expect(shouldRetry(0, new Error('x'))).toBe(false))
```

`sessionFor` is a local helper building `{ user: { id, name: 'Anna Kowalska', email: 'anna@firma.pl', role: 'AGENT', isBlocked: false, ...overrides }, session: {...} } as Session`. `axiosError(status)` builds `new AxiosError('x', undefined, undefined, undefined, status ? { status } as AxiosResponse : undefined)`.

Note on network errors: the spec says `!isAxiosError(err) || (status ?? 500) >= 500 && count < 2`. Read literally, that retries non-axios errors. This plan treats a non-axios error as a bug and does not retry it, while network errors (axios without a response) do get retried. The tests above pin that rule.

- [ ] **Step 4: Run** `pnpm --filter client test`. Expected: FAIL (the modules do not exist yet).

- [ ] **Step 5: Implement `auth-client.ts`, `session.ts`, `redirect.ts`, `login-error.ts` and `queryClient.ts`** following the Interfaces block. In `auth-client.ts`, add the comment `// Keep in sync with user.additionalFields in server/src/lib/auth.ts`. For `redirect.ts`, parse with `new URL(from, 'http://x')` to compare the pathname to `/login`.

- [ ] **Step 6: Run the tests again.** Expected: PASS.

- [ ] **Step 7: Write the failing `api.test.ts`.** Mock `@/lib/auth-client` (`signOut: vi.fn().mockResolvedValue({})`) and spy on `queryClient.clear`. Make requests fail with a custom axios `adapter` set on the request config:

```ts
it('signs out once when several requests get 401 at the same time', async () => {
  const fail401 = config =>
    Promise.reject(
      new AxiosError('401', undefined, config, undefined, { status: 401, config } as AxiosResponse),
    )
  await Promise.allSettled([1, 2, 3].map(() => api.get('/tickets', { adapter: fail401 })))
  expect(signOut).toHaveBeenCalledTimes(1)
  expect(queryClient.clear).toHaveBeenCalled()
})

it('ignores 401 from /auth endpoints', async () => {
  await api.get('/auth/get-session', { adapter: fail401 }).catch(() => {})
  expect(signOut).not.toHaveBeenCalled()
})

it('rethrows the original error', async () => {
  await expect(api.get('/tickets', { adapter: fail401 })).rejects.toMatchObject({
    response: { status: 401 },
  })
})

it('allows a later sign-out after the first one completes', async () => {
  /* two sequential batches → 2 calls */
})
```

- [ ] **Step 8: Run** `pnpm --filter client test src/lib/api.test.ts`. Expected: FAIL.

- [ ] **Step 9: Implement `api.ts`.** A response error interceptor: when the status is 401 and `config.url` does not start with `/auth`, it calls `handleUnauthorized()` (module-private). That function keeps one `inFlight: Promise<void> | null`. If one is already set, it returns that promise. Otherwise it sets `inFlight = signOut().finally(() => { queryClient.clear(); inFlight = null })`. The interceptor always rejects with the original error and does not wait for the sign-out to finish.

- [ ] **Step 10: Run the whole client suite and typecheck** with `pnpm --filter client test && pnpm --filter client typecheck`. Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add client/package.json pnpm-lock.yaml client/src/test-setup.ts client/src/lib
git commit -m "feat(client): add auth client, API client and query client foundations"
```

---

### Task 3: Theme, routing, auth gate and login page

**Files:**

- Modify: `client/src/index.css`, `client/tailwind.config.js`, `client/src/main.tsx`, `client/src/App.tsx`
- Create: `client/src/test/render.tsx`, `client/src/components/Logo.tsx`, `client/src/components/FullScreenLoader.tsx`, `client/src/components/auth/ProtectedRoute.tsx`, `client/src/pages/LoginPage.tsx`, `client/src/pages/NotFoundPage.tsx`, `client/src/pages/PlaceholderPage.tsx`
- Test: `client/src/components/auth/ProtectedRoute.test.tsx`, `client/src/pages/LoginPage.test.tsx`

**Interfaces:**

- Consumes: `useSession`, `signIn` (from `@/lib/auth-client`), `getActiveUser`, `safeRedirectPath`, `DEFAULT_PATH`, `loginErrorMessage`, `queryClient`.
- Produces:
  - `AppRoutes(): JSX.Element` in `App.tsx`. It renders the `<Routes>` table only, with no router. `main.tsx` wraps it in `BrowserRouter` + `QueryClientProvider`.
  - `ProtectedRoute({ role?: 'ADMIN' }): JSX.Element`. Renders `<FullScreenLoader/>` while pending, `<Navigate to="/login" replace state={{ from: pathname + search }}/>` when `getActiveUser` is null, `<Navigate to="/tickets" replace/>` when the role does not match, and `<Outlet/>` otherwise.
  - `PlaceholderPage({ title: string, icon: LucideIcon })`, `Logo({ className?: string })` and `FullScreenLoader()`.
  - `test/render.tsx`: `renderRoute(path: string, opts?: { state?: unknown })` renders `<MemoryRouter initialEntries={[{ pathname, search, state }]}><QueryClientProvider><AppRoutes/></QueryClientProvider></MemoryRouter>`. Also `mockSession(user: Partial<SessionUser> | null, opts?: { isPending?: boolean })`, which sets the return value of the mocked `useSession` to `{ data, isPending, error: null, refetch }`. Each test file calls `vi.mock('@/lib/auth-client')` itself.

Route table (Task 4 swaps the temporary layout for `AppShell`):

```
/login                 LoginPage
/                      <Navigate to="/tickets" replace/>
<ProtectedRoute>       (layout: temporarily <Outlet/>, replaced by <AppShell/> in Task 4)
  /tickets             PlaceholderPage "Tickety"
  /tickets/mine        PlaceholderPage "Moje"
  /knowledge-base      PlaceholderPage "Baza wiedzy"
  <ProtectedRoute role="ADMIN">
    /users             PlaceholderPage "Użytkownicy"
*                      NotFoundPage
```

- [ ] **Step 1: Write the failing `ProtectedRoute.test.tsx`**

```ts
it('shows the login page when there is no session', ...)      // renderRoute('/tickets'); mockSession(null) → getByRole('button', { name: 'Zaloguj się' })
it('shows only the loader while the session is pending', ...)  // mockSession(null, { isPending: true }) → getByRole('status'); no 'Zaloguj się', no 'Tickety' heading
it('treats a blocked user as logged out (no loop)', ...)       // mockSession({ isBlocked: true }) → login form visible, stays there
it('renders the page for an active user', ...)                 // mockSession({}) → getByRole('heading', { name: 'Tickety' })
it('redirects an AGENT away from /users', ...)                 // mockSession({ role: 'AGENT' }); renderRoute('/users') → heading 'Tickety'
it('lets an ADMIN open /users', ...)                           // mockSession({ role: 'ADMIN' }) → heading 'Użytkownicy'
it('renders 404 for an unknown path', ...)                     // renderRoute('/nope') → 'Nie znaleziono strony', link 'Wróć do ticketów' href '/tickets'
it('redirects / to /tickets', ...)
```

`FullScreenLoader` has `role="status"` and `aria-label="Ładowanie"`. `PlaceholderPage` renders its title as an `h1`.

- [ ] **Step 2: Write the failing `LoginPage.test.tsx`.** `signIn.email` is `vi.fn()`.

```ts
it('shows the credential error on 401', ...)    // signIn.email resolves { error: { status: 401, message: 'x' } } → 'Nieprawidłowy e-mail lub hasło' (role="alert")
it('shows the rate-limit error on 429', ...)
it('disables the button while submitting', ...) // pending promise → button disabled
it('navigates to the saved `from` after success', ...) // renderRoute('/login', { state: { from: '/knowledge-base' } }); resolves { data: {...} }, then mockSession({}) on rerender → heading 'Baza wiedzy'
it('ignores an unsafe `from`', ...)             // state.from = '//evil.com' → heading 'Tickety'
it('redirects an active user away from /login', ...)  // mockSession({}) → heading 'Tickety'
it('does not redirect a blocked user', ...)     // mockSession({ isBlocked: true }) → form visible
it('calls signIn.email with the typed credentials', ...) // expect(signIn.email).toHaveBeenCalledWith({ email: 'anna@firma.pl', password: 'password123' })
```

Use `userEvent` and look up fields by their labels `E-mail` and `Hasło`.

- [ ] **Step 3: Run** `pnpm --filter client test`. Expected: FAIL.

- [ ] **Step 4: Apply the theme.**
  - In the `:root` block of `index.css`, set the shadcn variables for Soft / pastel: `--primary` indigo `#4f46e5` (≈ `243 75% 59%`), `--primary-foreground` white, `--ring` indigo, `--radius: 0.875rem`, plus `--accent`/`--secondary` as a light indigo `#eef2ff` with indigo text. Leave `.dark` as it is.
  - In `tailwind.config.js` add `backgroundImage.app: 'linear-gradient(135deg, #eef2ff, #f0fdfa)'`, `backgroundImage.brand: 'linear-gradient(135deg, #6366f1, #14b8a6)'` and `boxShadow.soft: '0 4px 20px rgba(79, 70, 229, 0.08)'`.
  - Set the `body` to `bg-app min-h-screen`.

- [ ] **Step 5: Implement `Logo`, `FullScreenLoader`, `ProtectedRoute`, `PlaceholderPage`, `NotFoundPage`, `AppRoutes` and `main.tsx`.**
  - `Logo` is a `bg-brand` rounded square plus the text `helpdesk`.
  - `PlaceholderPage` is a white `rounded-2xl shadow-soft` card with the icon, an `h1` with the title and the text `Wkrótce`.
  - `NotFoundPage` stands on its own (not inside AppShell), with the gradient background and a centered card.

- [ ] **Step 6: Implement `LoginPage`.**
  - The layout matches the spec mockup: a centered white card (`w-full max-w-sm` with `px-4` outside it), `Logo`, the subtitle, labelled `Input`s (`type="email" required`, `type="password" required`), an error box (`role="alert"`, light pink) and a full-width `Button`.
  - On submit it sets `pending`, then calls `const { error } = await signIn.email({ email, password })`. On error it sets `loginErrorMessage(error.status)`. On success it calls `navigate(safeRedirectPath(location.state?.from), { replace: true })`.
  - On render: while the session is pending it shows `FullScreenLoader`. If `getActiveUser(data)` is truthy it renders `<Navigate to="/tickets" replace/>`.
  - A thrown error (network) maps to `loginErrorMessage(undefined)`.

- [ ] **Step 7: Run the tests and the typecheck** with `pnpm --filter client test && pnpm --filter client typecheck`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src client/tailwind.config.js
git commit -m "feat(client): add routing, auth gate, login page and pastel theme"
```

---

### Task 4: AppShell — sidebar, header, avatar menu, mobile drawer, logout

**Files:**

- Create: `client/src/components/ui/sheet.tsx`, `client/src/components/ui/dropdown-menu.tsx` (from shadcn: `pnpm dlx shadcn@latest add sheet dropdown-menu` in `client/`, or copy from the shadcn "default" style source. Make sure they import the Radix packages from Task 2.)
- Create: `client/src/hooks/useLogout.ts`, `client/src/components/layout/SidebarNav.tsx`, `client/src/components/layout/UserMenu.tsx`, `client/src/components/layout/AppShell.tsx`
- Modify: `client/src/App.tsx` (the protected layout becomes `<AppShell/>`)
- Test: `client/src/components/layout/AppShell.test.tsx`

**Interfaces:**

- Consumes: `useSession`, `signOut`, `getActiveUser`, `queryClient`, `Logo`, `renderRoute`, `mockSession`.
- Produces:
  - `useLogout(): () => Promise<void>`. The order is fixed: `await signOut()`, then `navigate('/login', { replace: true })`, then `queryClient.clear()`.
  - `SidebarNav({ isAdmin: boolean, onNavigate?: () => void })`. It renders `NavLink`s with the four labels and icons (`Ticket`, `UserCheck`, `BookOpen`, `Users` from lucide) and omits `Użytkownicy` when `!isAdmin`. The active link gets `bg-accent text-primary font-semibold`. Use `end` on `/tickets` so it is not active on `/tickets/mine`.
  - `UserMenu({ user: SessionUser })`. The trigger is a gradient avatar with initials (first letters of the first two words of `name`, uppercase), `aria-label="Menu użytkownika"`. The content shows the name, the role (`ADMIN` → `administrator`, `AGENT` → `agent`) and a `Wyloguj` item in rose that calls `useLogout()`.
  - `AppShell()` renders the layout with `<Outlet/>`.

Layout of `AppShell`:

- Outer: `min-h-screen bg-app p-3 md:p-4 md:flex md:gap-4`.
- Desktop sidebar: `hidden md:flex` floating card (`w-56 bg-white rounded-2xl shadow-soft p-4 flex-col`) with `Logo` and `SidebarNav`. It is sticky at full height.
- Main column: a header row with (mobile only, `md:hidden`) a hamburger `Button` `aria-label="Otwórz menu"`, which opens a `Sheet side="left"` containing `Logo` + `SidebarNav onNavigate={close}`. Then the greeting block (`Dzień dobry,` in muted text, the first name + ` 👋` in bold, truncated with `truncate`) and `UserMenu` on the right. Below that comes `<Outlet/>`.
- Every interactive element is at least `min-h-11`.

- [ ] **Step 1: Write the failing `AppShell.test.tsx`**

```ts
it('greets the user by first name', ...)            // mockSession({ name: 'Anna Kowalska' }) → 'Anna 👋'
it('hides Użytkownicy for an AGENT', ...)           // queryByRole('link', { name: /Użytkownicy/ }) null
it('shows Użytkownicy for an ADMIN', ...)
it('logs out via the avatar menu', ...)             // click 'Menu użytkownika', then menuitem 'Wyloguj' → signOut called once; after resolve and mockSession(null) rerender → button 'Zaloguj się'
it('opens the mobile drawer with navigation', ...)  // click 'Otwórz menu' → within(getByRole('dialog')) link 'Baza wiedzy'
it('closes the drawer after choosing a link', ...)  // click link inside dialog → dialog gone, heading 'Baza wiedzy'
it('marks the current page link as active', ...)    // renderRoute('/tickets/mine') → link 'Moje' has aria-current="page"; link 'Tickety' does not
```

Radix menus open on `pointerdown`. If `userEvent.click` does not open the dropdown in jsdom despite the polyfills, use `userEvent.pointer`/`keyboard('{Enter}')` on the trigger rather than changing the component.

- [ ] **Step 2: Run** `pnpm --filter client test src/components/layout`. Expected: FAIL.

- [ ] **Step 3: Add `ui/sheet.tsx` and `ui/dropdown-menu.tsx`**, then implement `useLogout`, `SidebarNav`, `UserMenu` and `AppShell`, and switch the protected layout in `App.tsx` to `<AppShell/>`.

- [ ] **Step 4: Run the whole client suite and the typecheck.** Expected: PASS, including the Task 3 tests. Those still look for headings rendered inside the shell.

- [ ] **Step 5: Commit**

```bash
git add client/src client/package.json pnpm-lock.yaml
git commit -m "feat(client): add app shell with sidebar, avatar menu and mobile drawer"
```

---

### Task 5: End-to-end check in the browser and docs

**Files:**

- Modify: `README.md` (only if it documents env vars: add `CLIENT_URL`), `plans/05-frontend-core.md` (banner: "Superseded by `docs/superpowers/plans/2026-10-29-frontend-core.md`")

- [ ] **Step 1: Run the full verification** with `pnpm typecheck && pnpm lint && pnpm --filter server test && pnpm --filter client test && pnpm --filter client build`. Expected: everything passes, with no lint warnings.

- [ ] **Step 2: Do a real login through Vite.**
  - Start the stack with `pnpm dev` (DB via `docker compose up -d` if it is not running) and open `http://localhost:5173`.
  - Log in as the seeded admin and confirm in DevTools → Network that `POST /api/auth/sign-in/email` returns 200, not 403. This proves that `trustedOrigins` works, which the tests cannot show.
  - Also check with a wrong password: the message is `Nieprawidłowy e-mail lub hasło`.

- [ ] **Step 3: Check the visuals against the mockups** at 1280 px and 375 px (DevTools device mode):
  - gradient background, floating sidebar card, indigo active state, greeting, avatar menu, logout;
  - drawer on mobile;
  - no horizontal scroll at 360 px;
  - 404 page at `/nope`;
  - refresh on `/knowledge-base` while logged in: no flash of the login form.

  If anything looks like default shadcn (slate, sharp corners), fix it before moving on.

- [ ] **Step 4: Update the docs and commit**

```bash
git add README.md plans/05-frontend-core.md
git commit -m "docs: mark old Plan 05 as superseded, document CLIENT_URL"
```
