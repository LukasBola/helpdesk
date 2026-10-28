# Design: Migracja autentykacji na Better Auth

**Data:** 2026-07-28 (rewizja 2: 2026-10-28)
**Status:** Zaakceptowany, plan: `docs/superpowers/plans/2026-07-28-better-auth-migration.md`

## Kontekst i cel

Obecna autentykacja (Plan 02) jest w pełni zaimplementowana i działająca: `express-session` + `connect-pg-simple` (sesje w Postgresie), `bcrypt` do haseł, role `AGENT`/`ADMIN`, flaga `isBlocked`. Zero prawdziwych użytkowników produkcyjnych — jedynie seedowany admin (`admin@helpdesk.local`).

Cel migracji: **mniej własnego kodu do utrzymania**. Oddajemy zarządzanie sesją, hashowaniem haseł i mechaniką logowania/wylogowania bibliotece Better Auth, zamiast utrzymywać własną implementację.

Zakres: **1:1 zamiennik** — tylko email + hasło, zachowując role (`AGENT`/`ADMIN`) i `isBlocked`. Bez OAuth i bez 2FA w tej migracji (mogą być dodane później jako osobne pluginy Better Auth, bez zmiany fundamentu).

**Timing:** osobny branch/worktree, **po** zamknięciu Planu 04 (ticket-api). Plan 04 jest już zmergowany (`b8ec8e7`), więc `routes/tickets.ts` i jego testy **wchodzą w zakres** tej migracji (używają `req.session.userId` i logowania przez `/api/auth/login`).

Frontend nie ma jeszcze żadnych stron — migracja obejmuje tylko backend. Wpływ na plany 05/08/09/11 opisany w sekcji „Wpływ na kolejne plany”.

## Model danych

Wariant: **Better Auth przejmuje istniejący model `User`** (bez osobnej tabeli profilu) — najmniejszy blast radius, żadne FK się nie zmieniają.

- Model Prisma nazywa się `User` (accessor `prisma.user`), co jest domyślną nazwą oczekiwaną przez adapter Prisma Better Auth — **nie potrzeba** `user.modelName` ani mapowania pól. `@@map("users")` dotyczy tylko nazwy tabeli w SQL i adaptera nie interesuje.
- Do `User` dochodzi `emailVerified Boolean @default(false)` (wymagane przez Better Auth) oraz relacje `sessions`/`accounts`.
- `role` (enum `AGENT`/`ADMIN`) i `isBlocked` jako `user.additionalFields` z `input: false` — trafiają do `session.user` zwracanego przez `getSession`, a nie da się ich ustawić przez publiczne API.
- `passwordHash` znika z `User` — hash hasła żyje w tabeli `account` (`providerId: 'credential'`).
- `Ticket.assigneeId`, `Reply.userId`, `TicketHistory.userId` **bez zmian**.
- Stary model `Session` (`connect-pg-simple`: `sid`/`sess`/`expire`) zastąpiony modelem Better Auth (`token`, `expiresAt`, `ipAddress`, `userAgent`, `userId`) — ta sama nazwa tabeli `session`.
- Nowe tabele `account` i `verification` (wymagane przez adapter).
- `advanced.database.generateId: false` — ID generuje Prisma (`@default(cuid())`), spójnie z resztą schematu. _(zweryfikowane w docs Better Auth)_

## Wiring po stronie serwera

### `server/src/lib/auth.ts` (nowy)

```ts
betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  advanced: { database: { generateId: false } },
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    additionalFields: {
      role: { type: ['AGENT', 'ADMIN'], required: false, defaultValue: 'AGENT', input: false },
      isBlocked: { type: 'boolean', required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    session: { create: { before: /* odrzuć, jeśli user.isBlocked */ } },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
})
```

**Decyzje (rewizja 2):**

1. **`disableSignUp: true`** — bez tego Better Auth wystawia publiczne `POST /api/auth/sign-up/email` i każdy mógłby założyć konto AGENT i czytać tickety. Dziś rejestracji nie ma, więc to byłaby regresja bezpieczeństwa. _Zweryfikowane:_ flaga jest sprawdzana w handlerze sign-up, więc blokuje **także** `auth.api.signUpEmail()` wywołane po stronie serwera — seed i testy nie mogą go używać.
2. **Tworzenie użytkowników: `server/src/lib/users.ts` → `createCredentialUser()`** — hashuje hasło przez `(await auth.$context).password.hash()` (ten sam hasher, którego Better Auth używa przy logowaniu) i w transakcji Prisma tworzy `User` + `Account { providerId: 'credential', accountId: user.id, password }`. To ten sam wzorzec, którego używa plugin `admin` Better Auth (`createUser` + `password.hash` + `linkAccount`). Używają go: seed, testy, a w przyszłości Plan 09 (zarządzanie użytkownikami).
3. **Blokada logowania przez `databaseHooks.session.create.before`**, a nie `hooks.before` na `/sign-in/email`. Hook bazodanowy odpala się dopiero **po** poprawnej weryfikacji hasła, tuż przed utworzeniem sesji. Dzięki temu:
   - nie ma timing leaka (wersja z `hooks.before` odpowiadała szybciej dla zablokowanych kont — stary kod celowo robił `bcrypt.compare` na `DUMMY_HASH`),
   - blokada obejmuje **każdą** ścieżkę tworzenia sesji (także przyszłe OAuth/pluginy), nie tylko `/sign-in/email`.
     Hook rzuca `APIError('UNAUTHORIZED', { message: 'Invalid credentials' })`. _(zweryfikowane: rzucenie `APIError` z hooka bazodanowego przerywa operację)_
4. **Bez `session.cookieCache`** — przy włączonym cache `getSession` czyta usera z ciasteczka, więc `isBlocked`/`role` byłyby nieaktualne do wygaśnięcia cache. Domyślnie jest wyłączony; nie włączamy go.

### Mount handlera

`app.all('/api/auth/*', toNodeHandler(auth))` **przed** `express.json()` (Express 4 — dla Express 5 byłoby `/api/auth/*splat`). _(zweryfikowane w docs integracji Express)_ Zastępuje `server/src/routes/auth.ts`. Endpointy: `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session` itd. `/api/tickets` i `/api/webhooks` pozostają zamontowane.

### `server/src/middleware/auth.ts` (przepisany)

```text
loadCurrentUser(req):
  jeśli req.currentUser już ustawiony -> zwróć go (requireAuth + requireRole na jednym routerze = 1 zapytanie, nie 2)
  session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  brak sesji lub session.user.isBlocked -> null   (blokada w trakcie trwającej sesji)
  req.currentUser = { id, role }

requireAuth:       null -> 401, inaczej next()
requireRole(role): null -> 401, poziom roli < wymagany -> 403 (hierarchia: ADMIN przechodzi check AGENT), inaczej next()
oba: wyjątek (np. DB down) -> next(err)   (Express 4 nie łapie odrzuconych promise'ów)
```

Sygnatury się nie zmieniają. `req.session.userId` → `req.currentUser.id` (typ w `server/src/types/express.d.ts`).

### Origin / CSRF _(zweryfikowane w docs)_

- Better Auth domyślnie ufa tylko `baseURL`. Requesty bez `Origin`/`Referer` i bez nagłówków Fetch Metadata (supertest, curl) przy logowaniu są przepuszczane.
- Przy requestach z ciasteczkiem Better Auth waliduje `Origin`. Testy supertest dla `sign-out` wysyłają więc `Origin: BETTER_AUTH_URL`.
- Frontend (Plan 05) na innym originie (`http://localhost:5173`) będzie wymagał `trustedOrigins` — poza zakresem tej migracji.

### Pliki usuwane

`server/src/lib/session.ts`, `server/src/types/session.d.ts`, `server/src/routes/auth.ts`, `server/src/routes/auth.test.ts`.

### Pliki zmieniane poza auth (przegapione w rewizji 1)

- `server/src/routes/tickets.ts` — `req.session.userId` → `req.currentUser`.
- `server/src/routes/tickets.test.ts` — user przez `createCredentialUser`, logowanie przez `/api/auth/sign-in/email`.
- `server/src/services/ticketService.test.ts` — usunięcie `passwordHash` z fixture.
- `server/src/db.test.ts` — `prisma.session` nadal istnieje (nowy kształt), dodać `prisma.account`.
- `server/src/env.test.ts`, `server/src/test/setup.ts` — nowe zmienne env.

## Env

`server/src/env.ts`:

- Dodanie `BETTER_AUTH_SECRET: z.string().min(32)` i `BETTER_AUTH_URL: z.string().url()`.
- Usunięcie `SESSION_SECRET` — **dopiero po** usunięciu `lib/session.ts` (inaczej typecheck padnie).
- `server/src/test/setup.ts` (globalSetup Vitest) ustawia nowe zmienne; `.env.example` zaktualizowany.

## Migracja bazy danych i seed

Reset + reseed (brak prawdziwych danych):

1. `prisma migrate reset --force --skip-seed` na lokalnej bazie **przed** zmianą schematu — nowa tabela `session` ma kolumny NOT NULL bez wartości domyślnych, a stary admin bez rekordu w `account` nie mógłby się zalogować.
2. Ręczna edycja `schema.prisma` (modele w planie). `@better-auth/cli generate` nie jest potrzebny — modele są wpisane wprost.
3. `prisma migrate dev -n better-auth-migration` — jedna migracja.
4. Seed (`server/prisma/seed.ts`) używa `createCredentialUser({ ..., role: 'ADMIN' })`; idempotentny (pomija, jeśli email istnieje).

## Strategia commitów

`.husky/pre-commit` uruchamia `pnpm typecheck`, więc **każdy commit musi się kompilować**. Konsekwencje:

- Nowe zależności i env dodajemy addytywnie (stare zostają) → commit zielony.
- Zmiana schematu + nowy auth + middleware + wiring + poprawki ticketów to **jedna atomowa zmiana** (jeden commit) — pośrednie stany nie kompilują się (`passwordHash` znika, a stary kod go używa).
- Usunięcie starych zależności i `SESSION_SECRET` — osobny commit po zamianie.

## Testy

- `server/src/middleware/auth.test.ts` — mock `auth.api.getSession`. Przypadki: brak sesji → 401, zablokowany → 401, OK → `next()` + `req.currentUser`, zła rola → 403, ADMIN przechodzi AGENT, `currentUser` już ustawiony → brak drugiego `getSession`, wyjątek → `next(err)`.
- `server/src/lib/auth.test.ts` (przez `auth.api`, bez HTTP): poprawne logowanie, złe hasło, nieznany email, zablokowany user odrzucony, `signUpEmail` zablokowany przez `disableSignUp`.
- `server/src/routes/auth.integration.test.ts` (supertest, nowy plik zastępujący `routes/auth.test.ts`): sign-in 200 + cookie, sign-in 401, `get-session` z `role`/`isBlocked`, `get-session` bez logowania → `null`, sign-out niszczy sesję, **zablokowanie w trakcie sesji → `/api/tickets` zwraca 401**, `POST /api/auth/sign-up/email` → odrzucony.
- Wspólny helper `server/src/test/auth.ts` → `signIn(email, password)` zwraca nagłówek `Cookie`.

## Zmiana kontraktu API (świadoma)

| Przed                              | Po                                                   |
| ---------------------------------- | ---------------------------------------------------- |
| `POST /api/auth/login`             | `POST /api/auth/sign-in/email`                       |
| `POST /api/auth/logout`            | `POST /api/auth/sign-out`                            |
| `GET /api/auth/me` (401 bez sesji) | `GET /api/auth/get-session` (200 + `null` bez sesji) |
| błąd walidacji logowania: 422      | 400 (format błędów Better Auth)                      |
| cookie `connect.sid`               | cookie `better-auth.session_token`                   |

Brak konsumentów (frontend nie istnieje), więc bez warstwy kompatybilności.

## Wpływ na kolejne plany (`plans/`)

Plany z maja zakładają stary auth — przed ich realizacją potrzebny świeży spec (brainstorming) i nowy plan:

- **05 frontend-core** — `AuthContext` z `/auth/me` i login przez axios → `createAuthClient`/`useSession` z `better-auth/react`; dodać `trustedOrigins` dla originu Vite.
- **08 email-replies** — testy z `bcrypt` + `/api/auth/login`, `req.session.userId` → `createCredentialUser`, `signIn()`, `req.currentUser`.
- **09 user-management** — tworzenie userów przez `createCredentialUser` (albo plugin `admin` Better Auth — decyzja w specu Planu 09); blokowanie działa już per-request.
- **11 e2e** — logowanie przez `/api/auth/sign-in/email`.
- **index.md** — wiersz „Auth” w Tech Stack.

## Poza zakresem

- OAuth i 2FA — później jako pluginy.
- Frontend (Plan 05/06/09).
- Rate limiting — Better Auth włącza go domyślnie w produkcji; konfiguracja przy deployu.
- Migracja istniejących haseł/sesji — baza jest resetowana.

## Historia zmian

**Rewizja 2 (2026-10-28)** — po review i weryfikacji w dokumentacji Better Auth (Context7):

- dodano `disableSignUp` + `createCredentialUser` (publiczna rejestracja była luką),
- blokada logowania przeniesiona z `hooks.before` do `databaseHooks.session.create.before` (timing leak),
- usunięto błędne `user.modelName: 'users'` (adapter używa nazwy modelu Prisma, nie tabeli),
- `requireRole` z hierarchią ról (zgodnie z obecnym kodem), a nie `role !== role`,
- uwzględniono pliki Planu 04 (`tickets.ts`, `tickets.test.ts`, `ticketService.test.ts`) oraz `db.test.ts`, `env.test.ts`, `test/setup.ts`,
- dodano reset bazy przed migracją i strategię commitów zgodną z pre-commit `typecheck`,
- obsługa błędów w middleware (`next(err)`), test blokady w trakcie sesji, test nieznanego emaila.
