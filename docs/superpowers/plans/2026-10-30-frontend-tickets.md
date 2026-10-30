# Frontend Tickets Implementation Plan (Plan 06)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An inbox-style tickets screen (filtered list + ticket side by side) with replies saved to the thread, assignment to any agent, an interleaved history timeline, and a Polish/English UI whose language is stored on the user's account.

**Architecture:** Four small server changes come first: list filter `assigneeId=none` + priority tie-break, `POST /api/tickets/:id/replies`, `GET /api/users`, `User.locale` as a Better Auth additional field. On the client, i18n (`i18next` + `react-i18next` + language detector, bundled JSON) is introduced before any new screen and applied to the Plan 05 screens. Then shared pieces (current user, page title, language sync, tokens, badges, formatters), a data layer (TanStack Query hooks + URL filter codec), and finally the list and the detail panel. Selected ticket and filters live in the URL.

**Tech Stack:** React 18, React Router 6, TanStack Query 5 (`useInfiniteQuery`), axios, `better-auth` 1.7.14, `i18next` + `react-i18next` + `i18next-browser-languagedetector`, Tailwind 3 + shadcn/ui (Radix), Vitest + RTL + jsdom. Server: Express, Prisma 5, Zod, Vitest + Supertest + testcontainers. E2E: Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-frontend-tickets-design.md`. Read it first; its behavior rules are binding. ADR: `docs/adr/0015-i18n-react-i18next-locale-na-koncie.md`.

## Global Constraints

- Branch `feature/frontend-tickets`. Every commit passes the pre-commit hook (`pnpm typecheck` + `prettier --check .`); run `pnpm format` before committing.
- Never edit `.env*`. No new env vars.
- `prisma migrate dev` refuses non-interactive shells: write migration SQL by hand (given in Task 4) and apply with `prisma migrate deploy`.
- `better-auth` stays exactly `1.7.14` in both packages. Client user fields are typed through the **explicit** `inferAdditionalFields({ user: { ... } })` in `client/src/lib/auth-client.ts`; do not import from `server/`.
- Supported languages: exactly `pl` and `en`. `fallbackLng: 'pl'`. Translations bundled (`client/src/locales/pl.json`, `en.json`), no HTTP backend.
- After Task 5 no user-visible string may be hard-coded in a component: everything goes through `t()`. Ticket/reply content and customer names are never translated.
- Polish UI strings that existing tests rely on keep their exact text in `pl.json`: `Zaloguj się do panelu agenta`, `E-mail`, `Hasło`, `Zaloguj się`, `Nieprawidłowy e-mail lub hasło`, `Za dużo prób. Spróbuj za chwilę.`, `Coś poszło nie tak. Spróbuj ponownie.`, `Dzień dobry,`, `Tickety`, `Moje`, `Baza wiedzy`, `Użytkownicy`, `Wyloguj`, `Nie znaleziono strony`, `Wróć do ticketów`, `Wkrótce`, `Otwórz menu`, `Menu użytkownika`, `Zamknij`.
- Status labels (pl / en): `OPEN` Otwarty / Open, `IN_PROGRESS` W toku / In progress, `RESOLVED` Rozwiązany / Resolved, `CLOSED` Zamknięty / Closed. Priority: `LOW` Niski / Low, `MEDIUM` Średni / Medium, `HIGH` Wysoki / High, `URGENT` Pilny / Urgent.
- History lines avoid gendered Polish verbs; format: `{{user}} · Status: {{from}} → {{to}}`, `{{user}} · Priorytet: {{from}} → {{to}}`, `{{user}} · Przypisanie: {{from}} → {{to}}` (unassigned = `Nieprzypisany` / `Unassigned`; unknown id = `nieznany użytkownik` / `unknown user`).
- Tickets screen breakpoint: two columns from `lg`, one column below. Touch targets ≥ 44 px (`min-h-11`). No horizontal scroll at 360 px.
- UI tests mock `@/lib/auth-client` (never `better-auth/react`) and `@/lib/api` where they need data. Unit tests run in `pl` (pinned in `test-setup.ts`).

## Review Focus

1. **Language switch racing the account save:** the user switches PL→EN while `updateUser` is in flight and the session still says `pl`. Expected: the UI stays EN (sync reacts only to a change of `session.user.locale`, not to the current language). Test in Task 6.
2. **Missing English key:** a key added to `pl.json` but forgotten in `en.json` must fail CI, not render a raw key. Test in Task 5 (key-set parity).
3. **Reply and auto status share a timestamp** (Postgres `now()` is per transaction). Expected: reply bubble before the status line, both visible. Tests in Task 2 (same transaction) and Task 10 (`buildTimeline` tie).
4. **Double submit / failed reply:** Enter-spam or a 500 must not create duplicates or lose the text. Expected: button disabled while pending; text kept on error. Test in Task 10.
5. **Garbage in the URL** (`?status=FOO&sort=x&priority=bar`, unknown ticket id). Expected: invalid params fall back to defaults; unknown id shows "Nie znaleziono ticketu" while the list still works. Tests in Task 8 (`parseFilters`) and Task 10.

---

## File Structure

```
server/
├── prisma/schema.prisma                              # + User.locale String?
├── prisma/migrations/20261030120000_add_user_locale/ # hand-written SQL
├── prisma/e2e-fixtures.ts                            # + locale user, reply/assign tickets
└── src/
    ├── app.ts                                        # + /api/users
    ├── lib/auth.ts (+ auth.test.ts)                  # + locale additional field + validation
    ├── services/ticketService.ts (+ test)            # assigneeId=none, priority tie-break, createReply
    ├── services/userService.ts (+ test)              # listUsers
    ├── routes/tickets.ts (+ test)                    # + POST /:id/replies
    └── routes/users.ts (+ test)                      # GET /

client/src/
├── i18n.ts, i18next.d.ts, locales/{pl,en}.json, locales/locales.test.ts
├── test-setup.ts                                     # pin pl
├── lib/auth-client.ts                                # + locale field, updateUser export
├── lib/{login-error,api-error,format,ticket-filters}.ts (+ tests)
├── lib/tickets-api.ts                                # types + fetchers
├── hooks/{useCurrentUser,useLanguage,useTickets,useUsers}.ts (+ tests)
├── components/layout/{AppShell,UserMenu,SidebarNav,PageTitle}.tsx
├── components/LanguageSwitcher.tsx
├── components/tickets/{TicketStatusBadge,TicketPriorityBadge,TicketFilters,TicketList,TicketRow,TicketPanel,TicketControls,TicketThread,ReplyForm}.tsx (+ tests)
├── pages/{TicketsPage,LoginPage,NotFoundPage,PlaceholderPage}.tsx
├── index.css, tailwind.config.js                     # tokens, font, type scale
└── App.tsx                                           # /tickets, /tickets/:id, /tickets/mine

e2e/
├── fixtures/{users,tickets}.ts                       # sync with e2e-fixtures.ts
├── pages/TicketsPage.ts
├── api/{tickets.api,users.api}.spec.ts
└── tests/{tickets,language}.spec.ts
```

---

### Task 1: List endpoint — unassigned filter and priority tie-break

**Files:**

- Modify: `server/src/services/ticketService.ts` (`listTickets`)
- Test: `server/src/services/ticketService.test.ts`, `server/src/routes/tickets.test.ts`

**Interfaces:**

- Produces: `GET /api/tickets?assigneeId=none` returns only tickets with `assigneeId IS NULL`. With `orderBy=priority`, order is `[priority <order>, createdAt asc, id asc]`; other `orderBy` values keep today's `[<field> <order>, id <order>]`.

- [ ] **Step 1: Write failing tests** in `ticketService.test.ts`:

```ts
it('assigneeId "none" returns only unassigned tickets', async () => {
  // seed one assigned + one unassigned ticket
  const { tickets } = await listTickets({ assigneeId: 'none', limit: 100 })
  expect(tickets.every(t => t.assigneeId === null)).toBe(true)
  expect(tickets.map(t => t.id)).toContain(unassignedId)
})

it('priority sort lists older tickets first within the same priority', async () => {
  // seed two URGENT tickets with createdAt 2026-01-01 and 2026-01-02 (older created second)
  const { tickets } = await listTickets({
    orderBy: 'priority',
    order: 'desc',
    priority: 'URGENT',
    limit: 100,
  })
  const ids = tickets.map(t => t.id)
  expect(ids.indexOf(olderId)).toBeLessThan(ids.indexOf(newerId))
})
```

- [ ] **Step 2: Run** `pnpm --filter server test ticketService` — expect both FAIL.
- [ ] **Step 3: Implement** in `listTickets`: `'none'` → `where.assigneeId = null`; build `orderBy` per the Interfaces rule.
- [ ] **Step 4: Run** `pnpm --filter server test` — expect PASS (existing pagination-stability tests included).
- [ ] **Step 5: Commit** `feat(server): unassigned filter and oldest-first tie-break for priority sort`

---

### Task 2: `POST /api/tickets/:id/replies`

**Files:**

- Modify: `server/src/services/ticketService.ts`, `server/src/routes/tickets.ts`
- Test: `server/src/services/ticketService.test.ts`, `server/src/routes/tickets.test.ts`

**Interfaces:**

- Produces (service):
  - `createReply(ticketId: string, body: string, actorId: string): Promise<ReplyWithUser | null>` — `null` when the ticket doesn't exist. One `prisma.$transaction`: check the ticket exists; create `Reply`; then a **conditional** update `tx.ticket.updateMany({ where: { id: ticketId, status: 'OPEN' }, data: { status: 'IN_PROGRESS' } })` and write the `TicketHistory` row (`field: 'status'`, `OPEN` → `IN_PROGRESS`, `userId: actorId`) **only when `count === 1`**. Never read the status and decide in JS: the `WHERE` lets Postgres settle races (a concurrent RESOLVED is not overwritten; two concurrent replies produce one history row). Returns the reply with `user: { id, name }`. `updateTicket` stays as it is.
  - `export const REPLY_MAX_LENGTH = 10_000`
- Produces (HTTP): `POST /api/tickets/:id/replies`, body `{ body: string }` → `201` with `{ id, ticketId, body, sentAt, resendId: null, user: { id, name } }`; `422` for empty/whitespace/too long/missing body; `404` unknown ticket; `401` without session (router-level `requireAuth`).

- [ ] **Step 1: Write failing route tests** in `tickets.test.ts` (`describe('POST /api/tickets/:id/replies')`):

```ts
it('saves the reply and moves an OPEN ticket to IN_PROGRESS with a history entry', async () => {
  const res = await request(app)
    .post(`/api/tickets/${openId}/replies`)
    .set('Cookie', cookie)
    .send({ body: '  Dzień dobry  ' })
  expect(res.status).toBe(201)
  expect(res.body).toMatchObject({ body: 'Dzień dobry', resendId: null, user: { name: 'Agent' } })
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: openId },
    include: { history: true },
  })
  expect(ticket.status).toBe('IN_PROGRESS')
  expect(ticket.history).toContainEqual(
    expect.objectContaining({ field: 'status', oldValue: 'OPEN', newValue: 'IN_PROGRESS' }),
  )
})
it('does not change a status other than OPEN', async () => {
  /* RESOLVED ticket → stays RESOLVED, no new history row */
})
it('two concurrent replies to an OPEN ticket create two replies but one status history row', async () => {
  await Promise.all([post(openId2, 'A'), post(openId2, 'B')])
  expect(await prisma.reply.count({ where: { ticketId: openId2 } })).toBe(2)
  expect(await prisma.ticketHistory.count({ where: { ticketId: openId2, field: 'status' } })).toBe(
    1,
  )
})
it.each([[''], ['   '], ['x'.repeat(10_001)], [undefined]])(
  'rejects body %j with 422',
  async body => {
    /* expect 422, no Reply row */
  },
)
it('returns 404 for an unknown ticket', async () => {
  /* id 'cnonexistent000000000000' */
})
it('returns 401 without a session', async () => {})
```

And in `ticketService.test.ts`:

```ts
it('the automatic status history is never older than its reply', async () => {
  // Timestamps may be equal (Review Focus 3); the client orders the tie.
  expect(historyRow.createdAt.getTime()).toBeGreaterThanOrEqual(reply.sentAt.getTime())
})
```

- [ ] **Step 2: Run** `pnpm --filter server test tickets` — expect FAIL (404 route missing).
- [ ] **Step 3: Implement** `createReply`, the zod schema `z.object({ body: z.string().trim().min(1).max(REPLY_MAX_LENGTH) })` and the route.
- [ ] **Step 4: Run** `pnpm --filter server test` — expect PASS. Atomicity comes from the single `$transaction` (reply, status and history); the reviewer checks no write happens outside it.
- [ ] **Step 5: Commit** `feat(server): save ticket replies to the thread (no email yet)`

---

### Task 3: `GET /api/users`

**Files:**

- Create: `server/src/services/userService.ts`, `server/src/services/userService.test.ts`, `server/src/routes/users.ts`, `server/src/routes/users.test.ts`
- Modify: `server/src/app.ts` (mount before the `/api` 404 handler)

**Interfaces:**

- Produces: `listUsers(): Promise<{ id: string; name: string; email: string; role: Role; isBlocked: boolean }[]>` ordered by `name asc`. `GET /api/users` (`requireAuth`, any role) → `200 { users: [...] }`.

- [ ] **Step 1: Write failing tests** in `users.test.ts`:

```ts
it('lists users with only public fields, sorted by name', async () => {
  const res = await request(app).get('/api/users').set('Cookie', agentCookie)
  expect(res.status).toBe(200)
  const names = res.body.users.map((u: { name: string }) => u.name)
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  expect(Object.keys(res.body.users[0]).sort()).toEqual([
    'email',
    'id',
    'isBlocked',
    'name',
    'role',
  ])
})
it('includes blocked users with isBlocked true', async () => {})
it('is available to AGENT, not only ADMIN', async () => {})
it('returns 401 without a session', async () => {})
```

- [ ] **Step 2: Run** `pnpm --filter server test users` — expect FAIL.
- [ ] **Step 3: Implement** with an explicit Prisma `select` (never return the whole row; `Account.password` lives elsewhere but `select` keeps future columns out too).
- [ ] **Step 4: Run** `pnpm --filter server test` — expect PASS.
- [ ] **Step 5: Commit** `feat(server): list users for assignment`

---

### Task 4: `User.locale` on the account

**Files:**

- Modify: `server/prisma/schema.prisma` (`locale String?` on `User`), `server/src/lib/auth.ts`, `client/src/lib/auth-client.ts`
- Create: `server/prisma/migrations/20261030120000_add_user_locale/migration.sql`
- Test: `server/src/lib/auth.test.ts`

**Interfaces:**

- Produces (server): `user.additionalFields.locale = { type: ['pl', 'en'], required: false, input: true }`; `export const SUPPORTED_LOCALES = ['pl', 'en'] as const`. The existing `before` hook on `/update-user` also rejects any `locale` not in `SUPPORTED_LOCALES` (including `null`) with `400`.
- Produces (client): `inferAdditionalFields` gains `locale: { type: ['pl', 'en'], required: false }`; `auth-client.ts` additionally exports `updateUser` (`authClient.updateUser`). `SessionUser['locale']` is `'pl' | 'en' | null | undefined`.

- [ ] **Step 1: Write migration SQL** (exactly):

```sql
-- AlterTable
ALTER TABLE "users" ADD COLUMN "locale" TEXT;
```

- [ ] **Step 2: Write failing tests** in `auth.test.ts`:

```ts
it('lets a signed-in user set locale to en and returns it in the session', async () => {
  const res = await request(app)
    .post('/api/auth/update-user')
    .set('Cookie', cookie)
    .send({ locale: 'en' })
  expect(res.status).toBe(200)
  const session = await request(app).get('/api/auth/get-session').set('Cookie', cookie)
  expect(session.body.user.locale).toBe('en')
})
it.each([['de'], [''], [null], [42]])('rejects locale %j with 400', async locale => {})
it('still rejects role changes through update-user', async () => {
  /* regression: role stays AGENT */
})
```

- [ ] **Step 3: Run** `pnpm --filter server test auth` — expect FAIL.
- [ ] **Step 4: Implement**; extend the hook so `name` and `locale` are validated independently (a body with only `locale` must not trip the name check). Apply locally: `pnpm --filter server exec prisma migrate deploy && pnpm --filter server exec prisma generate`.
- [ ] **Step 5: Run** `pnpm --filter server test && pnpm typecheck` — expect PASS.
- [ ] **Step 6: Commit** `feat(auth): store the UI language on the user account`

---

### Task 5: i18n foundation and translation of the Plan 05 screens

**Files:**

- Create: `client/src/i18n.ts`, `client/src/i18next.d.ts`, `client/src/locales/pl.json`, `client/src/locales/en.json`, `client/src/locales/locales.test.ts`, `client/src/components/LanguageSwitcher.tsx` (+ test)
- Modify: `client/package.json` (+ `i18next`, `react-i18next`, `i18next-browser-languagedetector`), `client/src/main.tsx` (import `./i18n` first), `client/src/test-setup.ts`, `client/src/lib/login-error.ts` (+ test), `LoginPage.tsx`, `NotFoundPage.tsx`, `PlaceholderPage.tsx`, `components/layout/{AppShell,UserMenu,SidebarNav}.tsx`, `FullScreenLoader.tsx`, `components/ui/sheet.tsx` (`Zamknij`), `App.tsx` (placeholder titles)

**Interfaces:**

- Produces:
  - `client/src/i18n.ts` default-exports the initialised instance: `.use(LanguageDetector).use(initReactI18next).init({ resources: { pl: { translation: pl }, en: { translation: en } }, fallbackLng: 'pl', supportedLngs: ['pl', 'en'], load: 'languageOnly', nonExplicitSupportedLngs: true, interpolation: { escapeValue: false }, detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'], lookupLocalStorage: 'helpdesk.lang' } })`. No `lng` option (the detector decides). On `languageChanged`, set `document.documentElement.lang`. Confirm option names against the react-i18next / i18next-browser-languagedetector docs (Context7) while implementing.
  - `export type AppLanguage = 'pl' | 'en'`, `export const LANGUAGES: AppLanguage[] = ['pl', 'en']`, `export function currentLanguage(): AppLanguage` (from `i18n.resolvedLanguage`, falling back to `'pl'`).
  - `i18next.d.ts`: `CustomTypeOptions { defaultNS: 'translation'; resources: { translation: typeof pl } }`.
  - Key namespaces in the JSON (nested objects): `common`, `auth`, `nav`, `shell`, `notFound`, `language`, `errors`, `tickets`, `thread`, `reply`, `status`, `priority`. Later tasks add keys under these.
  - `loginErrorKey(status?: number)` replaces `loginErrorMessage` and returns a key (`errors.badCredentials` | `errors.rateLimited` | `errors.generic`).
  - `<LanguageSwitcher onChange?: (lng: AppLanguage) => void />`: a two-button group `PL` / `EN` with `role="group"`, `aria-label={t('language.label')}`, `aria-pressed` on the active one. Default `onChange` is `i18n.changeLanguage`. Shown on `LoginPage` under the form.
- `test-setup.ts`: `import '@/i18n'` and `beforeEach(async () => { localStorage.clear(); await i18n.changeLanguage('pl') })`.

- [ ] **Step 1: Write failing tests**:

```ts
// locales.test.ts
it('en.json has exactly the same keys as pl.json', () => {
  expect(flattenKeys(en).sort()).toEqual(flattenKeys(pl).sort())
})
it('no translation is empty', () => {
  /* every leaf is a non-empty string in both files */
})

// LoginPage.test.tsx (add)
it('switches the login page to English', async () => {
  renderRoute('/login')
  mockSession(null)
  await user.click(screen.getByRole('button', { name: 'EN' }))
  expect(screen.getByText('Sign in to the agent panel')).toBeInTheDocument()
  expect(localStorage.getItem('helpdesk.lang')).toBe('en')
  expect(document.documentElement.lang).toBe('en')
})
```

- [ ] **Step 2: Run** `pnpm --filter client test` — expect the new tests FAIL, existing ones PASS.
- [ ] **Step 3: Install deps, implement `i18n.ts`, JSON files, types, switcher; replace every hard-coded string in the listed files with `t()`.** Keep the exact Polish strings from Global Constraints.
- [ ] **Step 4: Run** `pnpm --filter client test && pnpm typecheck` — expect PASS, all pre-existing tests unchanged.
- [ ] **Step 5: Run** `grep -rnE '>[^<{]*[A-Za-zĄ-ż]{3,}[^<{]*<' client/src --include='*.tsx' | grep -v test` — expect no hits except brand text (`helpdesk` in `Logo`).
- [ ] **Step 6: Commit** `feat(client): add Polish/English i18n and translate the app shell`

---

### Task 6: Current user, page title slot and language sync with the account

**Files:**

- Create: `client/src/hooks/useCurrentUser.ts`, `client/src/hooks/useLanguage.ts` (+ test), `client/src/components/layout/PageTitle.tsx`
- Modify: `AppShell.tsx` (+ test), `UserMenu.tsx`, `PlaceholderPage.tsx`, `NotFoundPage.tsx`, `client/src/test/render.tsx`, `ProtectedRoute.test.tsx`, `LoginPage.test.tsx`, `e2e/pages/AppShell.ts` only if a locator breaks

**Interfaces:**

- Produces:
  - `useCurrentUser(): SessionUser` — throws if called outside a signed-in tree (only used under `ProtectedRoute`). `getActiveUser` stays the single source of "active".
  - `useLanguageSync(locale: SessionUser['locale']): void` — effect with deps `[locale]` only: if `locale` is `'pl' | 'en'` and differs from `currentLanguage()`, call `i18n.changeLanguage(locale)`. Called once in `AppShell`.
  - `useChangeLanguage(): { change: (lng: AppLanguage) => Promise<void>; error: boolean }` — changes the language immediately, then `await updateUser({ locale: lng })`; sets `error` on failure (language stays changed). Used by the switcher in `UserMenu` (pass as `onChange`).
  - `PageTitleProvider` (wraps the AppShell outlet) and `usePageTitle(title: string): void` — the shell header renders the title as the page's only `<h1>` and sets `document.title` to `<title> · helpdesk`. The greeting line (`Dzień dobry,` + first name) stays in the header. `PlaceholderPage` no longer renders its own `<h1>`.
  - `client/src/test/render.tsx` exports `authClientMock()`: the factory every test passes to `vi.mock('@/lib/auth-client', () => authClientMock())`, returning `useSession`, `signIn: { email }`, `signOut`, `updateUser`, `refreshSession` as `vi.fn()`s. `AppShell.test.tsx`, `ProtectedRoute.test.tsx` and `LoginPage.test.tsx` switch to it, so a new export in `auth-client.ts` never breaks three files at once. `mockSession`'s default user gains `locale: null`.

- [ ] **Step 0: Refactor test mocks** to `authClientMock()` (above); run `pnpm --filter client test` — all existing tests PASS before any new code.
- [ ] **Step 1: Write failing tests** in `useLanguage.test.tsx` (using `authClientMock()`):

```ts
it('applies the account language when the session arrives', async () => {
  mockSession({ locale: 'en' })
  renderRoute('/tickets')
  expect(await screen.findByText('Good morning,')).toBeInTheDocument()
})
it('keeps the browser language when the account has no locale', async () => {
  await i18n.changeLanguage('en')
  mockSession({ locale: null })
  renderRoute('/tickets')
  expect(await screen.findByText('Good morning,')).toBeInTheDocument()
  expect(updateUser).not.toHaveBeenCalled()
})
it('switching in the user menu saves to the account and does not revert while the save is pending', async () => {
  let resolve!: () => void
  vi.mocked(updateUser).mockReturnValue(
    new Promise(r => {
      resolve = () => r({ data: {}, error: null })
    }),
  )
  mockSession({ locale: 'pl' })
  renderRoute('/tickets')
  await openUserMenu()
  await user.click(screen.getByRole('button', { name: 'EN' }))
  expect(updateUser).toHaveBeenCalledWith({ locale: 'en' })
  expect(screen.getByText('Good morning,')).toBeInTheDocument() // still EN with session.locale === 'pl'
  resolve()
})
it('shows an error but keeps the new language when saving fails', async () => {})
```

And in `AppShell.test.tsx`: `it('renders the page title as the only h1 and sets document.title')`.

- [ ] **Step 2: Run** `pnpm --filter client test` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter client test && pnpm typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat(client): current-user hook, page title slot, account language sync`

---

### Task 7: Visual foundation — tokens, font, type scale, badges, formatters

**Files:**

- Modify: `client/src/index.css`, `client/tailwind.config.js`, `client/package.json` (+ `@fontsource-variable/plus-jakarta-sans`; if unavailable, `@fontsource-variable/inter`), `client/src/main.tsx` (font import)
- Create: `client/src/components/tickets/TicketStatusBadge.tsx`, `TicketPriorityBadge.tsx` (+ tests), `client/src/lib/format.ts` (+ test)

**Interfaces:**

- Produces:
  - CSS variables in `:root`: `--status-{open|in-progress|resolved|closed}` and `--status-…-fg`, `--priority-{low|medium|high|urgent}` and `--priority-…-fg` (HSL triplets, pastel background + text meeting WCAG AA 4.5:1; urgent clearly the strongest). Tailwind colors `status.open`, `status.open-fg`, … and `priority.urgent`, `priority.urgent-fg`, … mapped to them.
  - `fontFamily.sans` = the chosen variable font + system fallback. Type scale in Tailwind `fontSize`: keep the default names; body text in list/thread is `text-sm`, page title `text-xl font-semibold`, history lines `text-xs`.
  - `<TicketStatusBadge status={TicketStatus} />`, `<TicketPriorityBadge priority={TicketPriority} />` — render `t('status.<CODE>')` / `t('priority.<CODE>')` with the token colors.
  - `formatAge(iso: string, now: Date, lng: AppLanguage): string` — `Intl.RelativeTimeFormat(lng, { numeric: 'auto', style: 'short' })`, largest whole unit among minutes/hours/days/months.
  - `formatDateTime(iso: string, lng: AppLanguage): string` — `Intl.DateTimeFormat(lng, { dateStyle: 'short', timeStyle: 'short' })`.
- `TicketStatus` / `TicketPriority` types come from Task 8's `lib/tickets-api.ts`; create that file now with just these two union types if Task 8 isn't done.

- [ ] **Step 1: Write failing tests**:

```ts
it('shows the translated status label', async () => {
  render(<TicketStatusBadge status="IN_PROGRESS" />)
  expect(screen.getByText('W toku')).toBeInTheDocument()
  await act(() => i18n.changeLanguage('en'))
  expect(screen.getByText('In progress')).toBeInTheDocument()
})
it('formatAge: 3 days in pl and en', () => {
  const now = new Date('2026-10-30T12:00:00Z')
  expect(formatAge('2026-10-27T12:00:00Z', now, 'pl')).toMatch(/3/)
  expect(formatAge('2026-10-27T12:00:00Z', now, 'en')).toMatch(/3 days? ago/)
})
```

- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter client test && pnpm typecheck` — PASS.
- [ ] **Step 5: Check contrast** of each token pair (any WCAG calculator); note the ratios in the commit body.
- [ ] **Step 6: Commit** `feat(client): status/priority tokens, font and type scale, ticket badges`

---

### Task 8: Data layer — API types, hooks, URL filter codec

**Files:**

- Create: `client/src/lib/tickets-api.ts`, `client/src/lib/ticket-filters.ts` (+ test), `client/src/lib/api-error.ts` (+ test), `client/src/hooks/useTickets.ts` (+ test), `client/src/hooks/useUsers.ts`

**Interfaces:**

- Produces (`tickets-api.ts`), dates as ISO strings:

```ts
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export interface UserRef {
  id: string
  name: string
}
export interface TicketListItem {
  id: string
  subject: string
  status: TicketStatus
  priority: TicketPriority
  customerEmail: string
  customerName: string | null
  createdAt: string
  updatedAt: string
  assigneeId: string | null
  assignee: (UserRef & { email: string }) | null
}
export interface TicketListPage {
  tickets: TicketListItem[]
  total: number
  page: number
  limit: number
}
export interface TicketHistoryEntry {
  id: string
  field: 'status' | 'priority' | 'assigneeId'
  oldValue: string | null
  newValue: string | null
  createdAt: string
  user: UserRef | null
}
export interface TicketReply {
  id: string
  body: string
  sentAt: string
  user: UserRef
}
export interface TicketDetail extends TicketListItem {
  body: string
  history: TicketHistoryEntry[]
  replies: TicketReply[]
}
export interface AppUser {
  id: string
  name: string
  email: string
  role: 'AGENT' | 'ADMIN'
  isBlocked: boolean
}
export interface TicketUpdate {
  status?: TicketStatus
  priority?: TicketPriority
  assigneeId?: string | null
}
// fetchTicketPage(query, page), fetchTicket(id), patchTicket(id, TicketUpdate), postReply(id, body), fetchUsers()
```

- Produces (`ticket-filters.ts`):

```ts
export type SortKey = 'oldest' | 'newest' | 'priority'
export interface TicketFilters {
  status: TicketStatus | 'all' // URL `status`, default 'OPEN'
  priority: TicketPriority | null // URL `priority`, default null
  assignee: 'all' | 'me' | 'none' | string // URL `assignee`, default per page ('all' on /tickets, 'me' on /tickets/mine)
  search: string // URL `search`, default ''
  sort: SortKey // URL `sort`, default 'oldest'
}
export function parseFilters(params: URLSearchParams, defaultAssignee: 'all' | 'me'): TicketFilters
export function serializeFilters(
  filters: TicketFilters,
  defaultAssignee: 'all' | 'me',
): URLSearchParams
// omits status=OPEN, sort=oldest, empty search, null priority, and assignee only when it equals defaultAssignee
// (so on /tickets/mine, "all" is written explicitly as assignee=all)
export function ticketPath(id: string, filters: TicketFilters): string // `/tickets/<id>?…`, serialized with default 'all'
export function listPath(filters: TicketFilters): string
// assignee 'me' → `/tickets/mine?…` (serialized with default 'me'), otherwise `/tickets?…` (default 'all')
export function toListQuery(filters: TicketFilters, currentUserId: string): Record<string, string>
// status 'all' → omitted; assignee 'me' → currentUserId, 'none' → 'none', 'all' → omitted;
// sort oldest → orderBy=createdAt&order=asc, newest → createdAt/desc, priority → priority/desc
```

- Produces (hooks), query keys: `['tickets', 'list', query]`, `['tickets', 'detail', id]`, `['users']`:
  - `useTicketList(query: Record<string, string>)` — `useInfiniteQuery`, `initialPageParam: 1`, `getNextPageParam: (last) => last.page * last.limit < last.total ? last.page + 1 : undefined`, limit 25. Returns the query plus `tickets: TicketListItem[]`: pages flattened and **deduplicated by `id`** (first occurrence wins), because offset paging repeats a row when a new ticket arrives between pages.
  - `useTicket(id: string | undefined)` — disabled without id.
  - `useUpdateTicket(id)` and `useCreateReply(id)` — mutations; on success invalidate `['tickets']` (list + detail by prefix).
  - `useUsers()` — `staleTime: 5 * 60_000`.
- Produces (`api-error.ts`): `apiErrorKey(error: unknown)` → `errors.network` (no response) | `errors.notFound` (404) | `errors.validation` (422) | `errors.generic`.

- [ ] **Step 1: Write failing tests** (`ticket-filters.test.ts`):

```ts
it('defaults: open, oldest first, all assignees on /tickets', () => {
  expect(parseFilters(new URLSearchParams(''), 'all')).toEqual({
    status: 'OPEN',
    priority: null,
    assignee: 'all',
    search: '',
    sort: 'oldest',
  })
})
it('falls back to defaults for invalid values', () => {
  expect(parseFilters(new URLSearchParams('status=FOO&priority=bar&sort=x'), 'all')).toEqual(
    parseFilters(new URLSearchParams(''), 'all'),
  )
})
it('round-trips through the URL', () => {
  /* serialize(parse(x)) for status=all&priority=URGENT&assignee=none&search=faktura&sort=priority */
})
it('on /tickets/mine, choosing "all" survives the URL round-trip', () => {
  const all = { ...parseFilters(new URLSearchParams(''), 'me'), assignee: 'all' as const }
  const params = serializeFilters(all, 'me')
  expect(params.get('assignee')).toBe('all')
  expect(parseFilters(params, 'me').assignee).toBe('all')
})
it('listPath sends "me" back to /tickets/mine and keeps the other filters', () => {
  expect(listPath({ ...defaults, assignee: 'me', priority: 'URGENT' })).toBe(
    '/tickets/mine?priority=URGENT',
  )
  expect(ticketPath('t1', { ...defaults, assignee: 'me' })).toBe('/tickets/t1?assignee=me')
})
it('toListQuery maps me/none/all and sort keys', () => {
  expect(
    toListQuery(
      { status: 'all', priority: null, assignee: 'me', search: '', sort: 'priority' },
      'u1',
    ),
  ).toEqual({ assigneeId: 'u1', orderBy: 'priority', order: 'desc' })
})
```

and `useTickets.test.tsx`: `it('requests the next page only while page * limit < total')`, `it('invalidates the list and detail after a reply')`, `it('drops a ticket repeated on the next page')`.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter client test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(client): ticket API types, query hooks and URL filter codec`

---

### Task 9: Tickets page — inbox layout, filters and list

**Files:**

- Create: `client/src/pages/TicketsPage.tsx` (+ test), `components/tickets/{TicketFilters,TicketList,TicketRow}.tsx`
- Modify: `client/src/App.tsx` (routes), translations

**Interfaces:**

- Consumes: Task 8 hooks/codec, Task 7 badges/formatters, Task 6 `useCurrentUser`, `usePageTitle`.
- Produces:
  - Routes inside `AppShell`: `/tickets` → `<TicketsPage defaultAssignee="all" />`, `/tickets/:id` → same, `/tickets/mine` → `<TicketsPage defaultAssignee="me" />`. Page title: `nav.tickets` or `nav.mine` (heading text `Tickety` / `Moje`).
  - `TicketsPage` reads `:id` and the query string, renders `<TicketList>` left and `<TicketPanel ticketId={id}>` (Task 10; until then an empty placeholder with `tickets.selectPrompt`) right. Clicking a row navigates to `ticketPath(id, filters)`; filter changes `replace` the query string (serialized with the page's `defaultAssignee`) and keep the current path.
  - Layout: `lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]`. Below `lg`: with `:id` only the panel is shown (with a back link `lg:hidden` to `listPath(filters)`, so a ticket opened from Moje returns to `/tickets/mine`); without `:id` only the list.
  - `TicketFilters`: status select (4 statuses + all), priority select (4 + any), assignee select (`all`, `me`, `none`, then non-blocked users from `useUsers`; a blocked user appears only when they are the current value, like in `TicketControls`), search input (300 ms debounce, `type="search"`), sort select (oldest/newest/priority).
  - `TicketRow`: age (`formatAge`), subject (truncate), `customerName ?? customerEmail`, priority badge, assignee initials or nothing; selected row has `aria-current="true"` and the accent background; whole row is a link (≥ 44 px).
  - States: loading skeleton rows; error with `common.retry` button (`refetch`); empty with `tickets.empty` + `tickets.clearFilters` (navigates to the path without query); `tickets.loadMore` button while `hasNextPage`.

- [ ] **Step 1: Write failing tests** (`TicketsPage.test.tsx`, mock `@/lib/api`):

```ts
it('requests open tickets oldest first by default', async () => {
  renderRoute('/tickets')
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith('/tickets', {
      params: expect.objectContaining({
        status: 'OPEN',
        orderBy: 'createdAt',
        order: 'asc',
        page: 1,
      }),
    }),
  )
})
it('on /tickets/mine filters by the current user', async () => {
  /* params.assigneeId === 'u1' */
})
it('offers Unassigned and non-blocked agents in the assignee filter', async () => {
  /* blocked user absent */
})
it('shows a blocked agent selected via the URL as the current filter value', async () => {})
it('back link from a ticket opened in Moje returns to /tickets/mine', async () => {})
it('keeps filters in the URL when a ticket is opened', async () => {
  /* after click, location is /tickets/t1?priority=URGENT */
})
it('shows "Pokaż więcej" only while more pages exist and appends the next page', async () => {})
it('shows the empty state with a clear-filters action', async () => {})
it('shows a retry button when the list fails to load', async () => {})
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter client test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(client): inbox-style ticket list with URL-driven filters`

---

### Task 10: Ticket panel — controls, thread, reply

**Files:**

- Create: `components/tickets/{TicketPanel,TicketControls,TicketThread,ReplyForm}.tsx` (+ tests), `client/src/lib/timeline.ts` (+ test)
- Modify: `TicketsPage.tsx` (use the panel), translations

**Interfaces:**

- Consumes: `useTicket`, `useUpdateTicket`, `useCreateReply`, `useUsers`, badges, `formatDateTime`, `apiErrorKey`.
- Produces:
  - `type TimelineItem = { kind: 'message'; at: string; ticket: TicketDetail } | { kind: 'reply'; at: string; reply: TicketReply } | { kind: 'history'; at: string; entry: TicketHistoryEntry }`
  - `buildTimeline(ticket: TicketDetail): TimelineItem[]` — the customer message first, then replies and history sorted by time ascending; on equal time `reply` before `history`; stable otherwise.
  - `historyText(entry, users: AppUser[], t): string` — uses the Global Constraints formats; values via `status.*` / `priority.*`; assignee ids → names from `users`, `null` → unassigned label, unknown id → unknown-user label; missing `entry.user` → unknown-user label.
  - `TicketPanel({ ticketId })`: loading, 404 → `tickets.notFound`, other error → `apiErrorKey` + retry. Header: subject (`h2`), `customerName <customerEmail>`, created date. `TicketControls`: three selects (status, priority, assignee incl. `Nieprzypisany`; blocked users hidden unless currently assigned) calling `useUpdateTicket` with only the changed field; disabled while pending; error shown inline.
  - `TicketThread`: customer message and replies as bubbles (reply bubbles accent-tinted, aligned right on `sm+`), history as `text-xs text-muted-foreground` lines; text rendered with `whitespace-pre-wrap`, never as HTML.
  - `ReplyForm({ ticketId })`: auto-growing textarea (`aria-label={t('reply.label')}`), send button disabled for whitespace-only input and while pending; Ctrl/Cmd+Enter submits; clears on success; keeps text and shows `apiErrorKey` message on error; a note `reply.threadOnlyNote` (pl: `Odpowiedź trafia na razie tylko do wątku — klient nie dostanie maila.`, en: `For now the reply is saved to the thread only — the customer won't get an email.`).

- [ ] **Step 1: Write failing tests**:

```ts
// timeline.test.ts
it('puts the customer message first and orders the rest by time', () => {})
it('orders a reply before a history entry with the same timestamp', () => {
  const at = '2026-10-30T10:42:00.000Z'
  const items = buildTimeline(ticketWith({ replies: [reply(at)], history: [statusChange(at)] }))
  expect(items.map(i => i.kind)).toEqual(['message', 'reply', 'history'])
})
it('historyText resolves assignee ids, unassigned and unknown users', () => {
  expect(historyText(assign(null, 'u2'), users, t)).toBe(
    'Anna Kowalska · Przypisanie: Nieprzypisany → Tomasz Nowak',
  )
  expect(historyText(assign('gone', null), users, t)).toContain('nieznany użytkownik')
})

// ReplyForm.test.tsx
it('disables send for whitespace and while pending; one POST per click', async () => {})
it('Ctrl+Enter sends', async () => {})
it('keeps the text and shows an error when the request fails', async () => {})
it('clears the field and shows the reply and status line after success', async () => {})

// TicketPanel.test.tsx
it('shows "Nie znaleziono ticketu" for a 404 while the list still renders', async () => {})
it('keeps the ticket open after a reply drops it out of the OPEN list', async () => {
  /* list refetch omits t1; panel still shows t1 */
})
it('changing status sends PATCH with only { status }', async () => {})
it('renders HTML in a message as text', async () => {
  /* body '<b>x</b>' → text '<b>x</b>', no <b> element */
})
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter client test && pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(client): ticket panel with controls, interleaved thread and reply form`

---

### Task 11: E2E and API contract coverage

**Files:**

- Modify: `server/prisma/e2e-fixtures.ts`, `e2e/fixtures/users.ts`, `e2e/fixtures/tickets.ts` (keep in sync), `e2e/api/tickets.api.spec.ts`
- Create: `e2e/api/users.api.spec.ts`, `e2e/pages/TicketsPage.ts`, `e2e/tests/tickets.spec.ts`, `e2e/tests/language.spec.ts`

**Interfaces:**

- Fixtures add: user `e2e-locale@helpdesk.local` (`Lucyna Język`, AGENT, key `locale`) used only by the language test; tickets `api-reply` (`E2E API odpowiedź`, OPEN, MEDIUM), `ui-reply` (`E2E Do odpowiedzi`, OPEN, MEDIUM) and `ui-assign` (`E2E Do przypisania w UI`, OPEN, LOW). **One mutating test per ticket:** the API reply test uses only `api-reply`, the UI reply test only `ui-reply`, the assign test only `ui-assign` (the suite is `fullyParallel` with retries on CI). UI tests locate tickets via search with `status=all`, so a retry finds a ticket the first attempt already moved to W toku; assertions must hold on a retry (the history line from attempt 1 still counts).
- `TicketsPage` POM: `goto(query?)`, `search(text)`, `row(subject)`, `open(subject)`, `statusSelect`, `prioritySelect`, `assigneeSelect`, `reply(text)`, `thread`, `backToList`.

- [ ] **Step 1: Write the specs**:
  - API (on `api-reply`): `POST /api/tickets/:id/replies` → 201 and status `IN_PROGRESS`; empty body → 422; `GET /api/tickets?assigneeId=none` returns only unassigned; `GET /api/users` as agent → 200 with the 5 public fields; unauthenticated → 401.
  - UI (`tickets.spec.ts`, agent storage state): `?status=all`, search `E2E Do odpowiedzi` → open → reply `Dzień dobry, sprawdzamy.` → status control shows `W toku`, the reply bubble and the line `Adam Agent · Status: Otwarty → W toku` appear, URL still `/tickets/<id>?…`; assign `E2E Do przypisania w UI` to `Ewa Admin` → history line visible; `?priority=URGENT&status=all` + reload → filters and selection restored; mobile viewport 390×844: list → ticket → back keeps the query string.
  - Language (`language.spec.ts`, fresh context, `locale` user): log in (PL) → user menu → `EN` → header shows `Good morning,` → log out → login page in English → new browser context (empty storage) → log in → UI in English (from the account).
- [ ] **Step 2: Run** `pnpm e2e` (dev server reused or started by Playwright) — expect PASS for the whole suite, including the pre-existing specs.
- [ ] **Step 3: Commit** `test(e2e): ticket inbox, replies, assignment and language persistence`

---

## Known limitation (out of scope)

`updateTicket` (PATCH) reads the ticket and writes without a version check, so two agents editing at once can overwrite each other (lost update). Plan 06 does not change it; optimistic locking (`updatedAt` in PATCH) is a candidate for a later plan.

## Done when

- `pnpm --filter server test`, `pnpm --filter client test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e` all pass.
- Manual check at 1280 px and 360 px in both languages: no raw keys, no untranslated codes, no horizontal scroll.
- Spec "Decyzje podjęte przeze mnie" items 1–15 are visible in the behavior.
