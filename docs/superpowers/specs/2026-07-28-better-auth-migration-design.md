# Design: Migracja autentykacji na Better Auth

**Data:** 2026-07-28
**Status:** Zaakceptowany, gotowy do `/writing-plans`

## Kontekst i cel

Obecna autentykacja (Plan 02) jest w pełni zaimplementowana i działająca: `express-session` + `connect-pg-simple` (sesje w Postgresie), `bcrypt` do haseł, role `AGENT`/`ADMIN`, flaga `isBlocked`. Zero prawdziwych użytkowników produkcyjnych — jedynie seedowany admin (`admin@helpdesk.local`).

Cel migracji: **mniej własnego kodu do utrzymania**. Oddajemy zarządzanie sesją, hashowaniem haseł i mechaniką logowania/wylogowania bibliotece Better Auth, zamiast utrzymywać własną implementację.

Zakres: **1:1 zamiennik** — tylko email + hasło, zachowując role (`AGENT`/`ADMIN`) i `isBlocked`. Bez OAuth i bez 2FA w tej migracji (mogą być dodane później jako osobne pluginy Better Auth, bez zmiany fundamentu).

**Timing:** migracja wykonywana jako osobny branch/worktree, **po** zamknięciu obecnego Planu 04 (ticket-api) — to zmiana przekrojowa (middleware `requireAuth`/`requireRole` używane w każdym chronionym endpoincie), więc robienie jej równolegle z ticket-api groziłoby konfliktami mieszającymi dwa niezwiązane cele w jednym branchu.

Frontend nie ma jeszcze żadnych stron (login itd. nie zbudowany) — ta migracja obejmuje tylko backend; wpływ na przyszły Plan 05 (frontend-core) jest odnotowany w sekcji "Poza zakresem".

## Model danych

Wariant: **Better Auth przejmuje istniejący model `User`** (nie tworzymy osobnej tabeli profilu) — najmniejszy blast radius, żadne FK się nie zmieniają.

- Model `User` w Prisma zostaje tym samym modelem, ale mapowanym na potrzeby Better Auth: `user: { modelName: "users", fields: {...} }` w konfiguracji.
- `role` (enum `AGENT`/`ADMIN`) i `isBlocked` dodane jako `additionalFields` na modelu `user` — trafiają automatycznie do sesji zwracanej przez `getSession`/`useSession`, bez potrzeby dodatkowego pluginu (`customSession` niepotrzebny w tym wariancie).
- `passwordHash` znika z modelu `User` — dane logowania (hash hasła) przenoszą się do tabeli `Account`, generowanej i zarządzanej przez Better Auth.
- `Ticket.assigneeId`, `Reply.userId`, `TicketHistory.userId` **nie zmieniają się** — nadal FK do `User.id`, bo to wciąż ten sam model/tabela.
- Stary custom model `Session` (`connect-pg-simple`, `@@map("session")`) zostaje usunięty. Better Auth generuje własną tabelę `session` (inny układ kolumn: `token`, `expiresAt`, `ipAddress`, `userAgent` zamiast `sid`/`sess`/`expire` JSON blob).
- Better Auth dodaje też tabele `Account` (credentials/OAuth) i `Verification` (tokeny weryfikacji email/reset hasła) — obecnie nieużywane funkcjonalnie poza przechowywaniem hasła, ale wymagane przez adapter.

## Wiring po stronie serwera

- **`server/src/lib/auth.ts` (nowy)** — instancja Better Auth:
  ```ts
  betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: { enabled: true },
    user: {
      modelName: 'users',
      fields: {
        /* mapowanie na istniejące kolumny */
      },
      additionalFields: {
        role: { type: ['AGENT', 'ADMIN'], required: false, defaultValue: 'AGENT', input: false },
        isBlocked: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    hooks: {
      before: [
        /* patrz niżej: blokada logowania */
      ],
    },
  })
  ```
- **Blokada logowania:** hook `hooks.before` dopasowany do ścieżki `/sign-in/email` odrzuca próbę logowania, jeśli `user.isBlocked === true` — odpowiednik dzisiejszego sprawdzenia w `routes/auth.ts`.
- **Mount handlera:** `app.all("/api/auth/*", toNodeHandler(auth))`, zarejestrowany **przed** `express.json()` (Better Auth wymaga tej kolejności — inaczej klient wisi na "pending"). Całkowicie zastępuje `server/src/routes/auth.ts`; endpointy `/api/auth/sign-in/email`, `/api/auth/sign-out`, `/api/auth/get-session` itd. dostarcza sama biblioteka.
- **`server/src/middleware/auth.ts` (przepisany):**

  ```ts
  requireAuth: pobiera session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
    brak sesji -> 401
    session.user.isBlocked -> 401 (chroni przed zablokowaniem w trakcie trwania sesji)
    inaczej req.currentUser = session.user; next()

  requireRole(role): jak requireAuth + session.user.role !== role -> 403
  ```

  Sygnatura (`(req, res, next)`) i miejsca użycia w innych routach (Plan 04, Plan 09) się nie zmieniają.

- **Usuwane pliki:** `server/src/lib/session.ts`, `server/src/types/session.d.ts`, `server/src/routes/auth.ts`, `server/src/routes/auth.test.ts`.
- **`app.ts`:** usunięcie `sessionMiddleware`, `authRouter`; dodanie mount handlera Better Auth przed `express.json()`.

## Env

`server/src/env.ts`:

- Usunięcie `SESSION_SECRET`.
- Dodanie `BETTER_AUTH_SECRET: z.string().min(32)`.
- Dodanie `BETTER_AUTH_URL: z.string().min(1)` (baseURL, np. `http://localhost:3000` lokalnie).
- Aktualizacja `.env.example` zgodnie z powyższym.

## Migracja bazy danych i seed

Reset + reseed (brak prawdziwych danych produkcyjnych do zachowania):

1. `npx @better-auth/cli generate` dopisuje do `schema.prisma` modele `Session`, `Account`, `Verification` oraz konfigurację `additionalFields` na `User`.
2. Ręczne usunięcie starego modelu `Session` (connect-pg-simple) i pola `passwordHash` z `User`.
3. `prisma migrate dev -n better-auth-migration` — jedna migracja (drop starej tabeli `session`, nowe tabele `account`/`verification`, zmiana `users`).

`server/prisma/seed.ts`:

- Zamiast `bcrypt.hash` + `prisma.user.upsert`, wywołanie `auth.api.signUpEmail({ body: { email, password, name } })`, a następnie `prisma.user.update({ where: { email }, data: { role: 'ADMIN' } })` — `role` ma `input: false` (nieustawiane przez publiczne API), więc seed ustawia je bezpośrednio w bazie po utworzeniu konta.

## Testy

- `server/src/middleware/auth.test.ts`: mockujemy `auth.api.getSession` (zamiast `req.session`) — zwraca `{ user: { role, isBlocked } } | null`. Asercje 401/403 bez zmian w logice testowej.
- `server/src/routes/auth.test.ts` → usuwany, zastąpiony przez `server/src/lib/auth.test.ts` (integracyjny, supertest), uderzający w zamontowane endpointy:
  - `POST /api/auth/sign-in/email` — sukces (200 + cookie), błędne hasło (401), nieznany email (401).
  - `POST /api/auth/sign-out` — niszczy sesję.
  - `GET /api/auth/get-session` — zwraca dane sesji z `role`/`isBlocked` gdy zalogowany, `null`/401 gdy nie.
  - Test na odrzucenie logowania zablokowanego użytkownika (hook `before`).
- Brak innych plików w `server/src` odwołujących się dziś do `/api/auth/login`, `req.session` czy `express-session` poza wymienionymi wyżej (zweryfikowane grepem) — Plan 04 (ticket-api) jeszcze nie ma testów zależnych od starych endpointów logowania.

## Poza zakresem

- OAuth (Google itp.) i 2FA — możliwe do dodania później jako pluginy Better Auth bez zmiany fundamentu z tego designu.
- Frontend (Plan 05/06/09) — nie istnieje jeszcze żadna strona logowania ani hook `useAuth`. Gdy te plany będą realizowane, powinny użyć `createAuthClient`/`useSession` z `better-auth/react` zamiast budować własny klient auth od zera — to naturalna konsekwencja tej migracji, ale nie jest częścią obecnego planu implementacji.
- Migracja istniejących haseł/sesji użytkowników — nie dotyczy, baza jest resetowana (brak prawdziwych kont poza seedem).
