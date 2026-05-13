# Odpowiedzi — Autentykacja (Plan 02)

Pytania i odpowiedzi dotyczące implementacji session-based authentication z PR #5.

---

## Pytanie 1

> Dlaczego użyto sesji w PostgreSQL zamiast JWT? Podaj dwie konkretne sytuacje, w których JWT byłoby problematyczne dla helpdesk.

**Sesja w Postgresie można unieważnić natychmiast** — `DELETE FROM session WHERE sess->>'userId' = ?`. JWT żyje do wygaśnięcia (`exp` claim) nawet po wylogowaniu użytkownika lub zablokowaniu konta.

**Sytuacja 1 — blokowanie agenta:**
Admin blokuje agenta po incydencie bezpieczeństwa. Przy JWT: agent nadal ma ważny token przez kolejne N godzin i może dalej korzystać z API. Przy sesjach: `isBlocked` sprawdzane przy każdym `/me` → sesja niszczona natychmiast → następny request zwraca 401.

**Sytuacja 2 — kradzież tokena:**
JWT wykradzione z localStorage jest ważne do wygaśnięcia — nie możesz go unieważnić bez budowania blacklisty (co anuluje główną zaletę JWT: bezstanowość). Sesje rozwiązują to natywnie — `session.destroy()` usuwa rekord z bazy, skradziony cookie staje się bezużyteczny.

---

## Pytanie 2

> Co robi `connect-pg-simple` i dlaczego ustawiono `createTableIfMissing: false`?

**`connect-pg-simple`** to adapter, który podłącza express-session do PostgreSQL zamiast domyślnego store'a w pamięci (MemoryStore). Zapisuje sesje jako JSON w tabeli `session` w bazie.

Schemat tabeli:

```sql
-- tabela zarządzana przez Prisma migration, nie przez connect-pg-simple
CREATE TABLE session (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);
```

**Dlaczego `createTableIfMissing: false`:**
Tabela `session` jest zarządzana przez **Prisma migration** (plan 01). `createTableIfMissing: true` pozwoliłoby connect-pg-simple tworzyć tabelę samodzielnie — poza kontrolą systemu migracji. To złamałoby zasadę "jedno źródło prawdy dla schematu". Migracje byłyby niepełne, a tabela mogłaby mieć inny schema niż reszta bazy.

---

## Pytanie 3

> Co oznaczają opcje `saveUninitialized: false` i `resave: false` w express-session? Co by się stało gdybyś je odwrócił?

**`saveUninitialized: false`:**
Nie zapisuj sesji do bazy dopóki nie zostanie zmodyfikowana. Anonimowy użytkownik odwiedzający `/` nie generuje rekordu w tabeli `session`.

Gdybyś ustawił `true`: każdy request od niezalogowanego użytkownika (crawlery, health checks, ataki) tworzyłby rekord w bazie. Po miesiącu: tysiące niepotrzebnych rekordów, wolniejsze queries, potencjalny problem z GDPR (przechowujesz dane bez zgody).

**`resave: false`:**
Nie zapisuj sesji przy każdym requeście jeśli nie było modyfikacji. Domyślnie `true` powoduje zapis do bazy przy każdym `/api/auth/me` nawet gdy nic się nie zmieniło.

Gdybyś ustawił `true`: każdy authenticated request generuje INSERT/UPDATE w tabeli `session`. Przy 100 użytkownikach robiących request co sekundę = 100 niepotrzebnych zapisów/s do Postgresu.

---

## Pytanie 4

> Opisz każdą z czterech opcji cookie: `httpOnly`, `secure`, `maxAge`, `sameSite`. Co by się stało bez każdej z nich?

**`httpOnly: true`:**
Cookie niedostępne przez `document.cookie` w JavaScript. Bez tego: skrypt XSS może odczytać session cookie i przesłać atakującemu (`document.cookie` → HTTP request). Z `httpOnly` JavaScript w ogóle nie widzi ciasteczka.

**`secure: env.NODE_ENV === 'production'`:**
Przeglądarka wysyła cookie **tylko przez HTTPS**. W dev `false` — bo `localhost` nie ma HTTPS. W produkcji `true` — bez tego cookie lecą plaintext przez HTTP, podatne na man-in-the-middle.

**`maxAge: 7 * 24 * 60 * 60 * 1000`:**
Czas życia cookie w milisekundach (7 dni). Bez tego: session cookie wygasa po zamknięciu przeglądarki (session cookie). Zalogowany użytkownik musiałby logować się przy każdym otwarciu okna.

**`sameSite: 'lax'`:**
Przeglądarka wysyła cookie przy nawigacji na stronę (kliknięcie linka), ale NIE przy cross-site requestach z innych domen (formularz POST, AJAX). Mityguje CSRF — bez tego złośliwa strona mogłaby wysyłać requesty do API w imieniu zalogowanego użytkownika.

---

## Pytanie 5

> Co to jest session fixation attack? Krok po kroku wyjaśnij jak `req.session.regenerate()` go blokuje.

**Session fixation:** Atakujący zna session ID ofiary (np. wstrzyknął go wcześniej przez URL lub subdomenę). Ofiara loguje się — jeśli serwer **nie zmieni** session ID po zalogowaniu, atakujący nadal używa tego samego ID i jest zalogowany jako ofiara.

**Jak `regenerate()` blokuje:**

1. Ofiara ma cookie `connect.sid=STARY_ID` (przed logowaniem, nieuprawniona sesja)
2. Ofiara wysyła `POST /login` z poprawnymi danymi
3. `req.session.regenerate(callback)`:
   - Usuwa `STARY_ID` z tabeli `session` w Postgresie
   - Tworzy nowy rekord z `NOWY_ID` (kryptograficznie losowy)
   - `Set-Cookie: connect.sid=NOWY_ID` w odpowiedzi
4. Atakujący próbuje użyć `STARY_ID` → brak rekordu w bazie → 401
5. Ofiara dostaje `NOWY_ID` i jest zalogowana

Bez `regenerate()`: po zalogowaniu session ID się nie zmienia. Atakujący ze `STARY_ID` jest de facto zalogowany.

---

## Pytanie 6

> Co to jest `DUMMY_HASH` w login route i jaki atak mityguje?

```typescript
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh3u'

if (!user || user.isBlocked) {
  await bcrypt.compare(password, DUMMY_HASH) // ← po co?
  res.status(401).json({ error: 'Invalid credentials' })
  return
}
```

**Timing attack (user enumeration):**
`bcrypt.compare()` zajmuje ~100ms (cost factor 10). Bez `DUMMY_HASH`:

- Email istnieje → `bcrypt.compare()` → odpowiedź po ~100ms
- Email NIE istnieje → od razu `return 401` → odpowiedź po ~1ms

Atakujący mierzy czas odpowiedzi i wie czy email istnieje w systemie. Może zbierać listę ważnych emaili do ataku phishingowego lub credential stuffing.

**Z `DUMMY_HASH`:** Gdy użytkownik nie istnieje (lub jest zablokowany), serwer nadal wykonuje `bcrypt.compare()` na fikcyjnym hashu — co zajmuje ~100ms. Atakujący nie może odróżnić "zły email" od "złe hasło" po czasie odpowiedzi.

---

## Pytanie 7

> Dlaczego `POST /login` zwraca `401 Invalid credentials` zarówno dla złego hasła jak i nieistniejącego emaila? Czy nie powinno być inaczej?

**User enumeration attack:** Gdyby odpowiedzi były różne:

- `404 User not found` dla nieistniejącego emaila
- `401 Invalid password` dla złego hasła

Atakujący może zebrać listę ważnych emaili testując po kolei `user1@company.com`, `user2@company.com`... Nieistniejące → 404. Istniejące → 401. Teraz ma listę celów do ataku.

**Zasada:** Zawsze zwracaj ten sam błąd (`401 Invalid credentials`) niezależnie od powodu. Użytkownik i tak może się domyślić — "sprawdź email i hasło" — ale atakujący nie może odróżnić obu przypadków automatycznie.

Dotyczy to też HTTP status code — 401 dla obu, nie 422 (to zostawione dla brakujących pól przy walidacji).

---

## Pytanie 8

> Narysuj ścieżkę requesta `GET /api/auth/me` gdy użytkownik jest zalogowany. Jakie middleware mija po drodze?

```
GET /api/auth/me
        ↓
[express-session middleware]
  Odczytuje connect.sid z cookie
  Pobiera sesję z tabeli session w Postgresie
  Ustawia req.session = { userId: 'u1', role: 'AGENT' }
        ↓
[requireAuth middleware]
  Sprawdza req.session.userId → istnieje → next()
        ↓
[handler GET /me]
  prisma.user.findUnique({ where: { id: req.session.userId } })
  Sprawdza czy user.isBlocked
  Jeśli OK → res.json({ id, email, name, role })
```

Gdyby użytkownik był niezalogowany:

- express-session tworzy pustą sesję (bez zapisu do bazy bo `saveUninitialized: false`)
- `req.session.userId` → `undefined`
- `requireAuth` zwraca `401`, handler nigdy się nie wykonuje

---

## Pytanie 9

> Jak działa hierarchia ról z liczbami całkowitymi? Dlaczego to lepsze niż porównanie stringów?

```typescript
const ROLE_HIERARCHY: Record<'AGENT' | 'ADMIN', number> = { AGENT: 1, ADMIN: 2 }

const userLevel = ROLE_HIERARCHY[req.session.role ?? 'AGENT'] ?? 0
const requiredLevel = ROLE_HIERARCHY[role]
if (userLevel < requiredLevel) {
  res.status(403).json({ error: 'Forbidden' })
}
```

**Dlaczego liczby:**

- `ADMIN` (poziom 2) automatycznie przechodzi przez `requireRole('AGENT')` (wymagany poziom 1): `2 < 1` = false → `next()`.
- Gdybyś porównywał stringi: `'ADMIN' === 'AGENT'` = false → 403 dla admina próbującego wykonać akcję agenta. Musiałbyś listy wyjątków lub osobne sprawdzenia.
- Nową rolę `SUPERVISOR` dodajesz jako `SUPERVISOR: 1.5` — automatycznie przechodzi przez AGENT check, ale nie przez ADMIN check. Zero zmian w logice middleware.

**Fallback `?? 'AGENT'`:** Jeśli `req.session.role` jest `undefined` (brakujący klucz), zakłada role AGENT (poziom 1) — bezpieczne domyślne minimum.

---

## Pytanie 10

> Co to jest TypeScript declaration merging? Dlaczego `session.d.ts` jest potrzebny?

```typescript
// server/src/types/session.d.ts
import 'express-session'

declare module 'express-session' {
  interface SessionData {
    userId?: string
    role?: 'AGENT' | 'ADMIN'
  }
}
```

**Declaration merging:** TypeScript pozwala "dokleić" nowe pola do istniejącego interfejsu z zewnętrznej biblioteki. `SessionData` jest interfejsem z `@types/express-session` — bez mergingu ma tylko pola zdefiniowane przez bibliotekę.

**Dlaczego potrzebny:**
Bez tego pliku TypeScript nie wie że `req.session` może mieć `userId` lub `role`:

```typescript
req.session.userId // TS Error: Property 'userId' does not exist on type 'Session & Partial<SessionData>'
```

Z `session.d.ts` TypeScript widzi `userId?: string` i `role?: 'AGENT' | 'ADMIN'` jako legalne pola sesji — z pełnym type-checking. Przeliterowujesz `userID` zamiast `userId`? Błąd w edytorze od razu.

**`import 'express-session'`** na górze pliku jest konieczny — bez niego plik byłby traktowany jako globalny skrypt, nie moduł, i merge by nie działał.

---

## Pytanie 11

> Jak bcrypt haszuje hasło? Co oznacza cost factor 10 i jak go dobrać?

```typescript
const hash = await bcrypt.hash('password123', 10)
// Wynik: '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh3u'
```

**Anatomia wyniku:**

- `$2b$` — wersja algorytmu bcrypt
- `$10$` — cost factor (rounds = 2^10 = 1024 iteracji)
- Następne 22 znaki — **sól** (losowa, generowana automatycznie)
- Reszta — właściwy hash

**Cost factor 10:**
Bcrypt celowo jest powolny. Przy cost=10: hashowanie zajmuje ~100ms na współczesnym CPU. Atakujący z kartą GPU łamiący hasła metodą brute force:

- Cost 10: ~10ms/hash na GPU → ~100 hash/s przy mocnym sprzęcie
- Cost 12: ~400ms/hash → ~2.5 hash/s
- Cost 14: ~1.6s/hash → ~0.6 hash/s

**Jak dobrać:** Reguła kciuka — tyle ile pozwala na ~100-300ms na rejestrację/logowanie przy aktualnym sprzęcie serwerowym. Przy zmianie hardware co kilka lat podnosisz o 1 lub 2.

---

## Pytanie 12

> Jak `bcrypt.compare()` wie czy hasło się zgadza skoro hash jest inny przy każdym wywołaniu `hash()`?

```typescript
const valid = await bcrypt.compare(password, user.passwordHash)
```

**Sól jest zakodowana w hashu.** Wynik `bcrypt.hash()` zawiera sól jako część stringa (pierwsze 22 znaki po cost factor).

Przy `compare()`:

1. Wyciąga sól z `user.passwordHash` (tej samej co przy rejestracji)
2. Haszuje podane `password` używając **tej samej soli**
3. Porównuje wynikowy hash z zapisanym

Efekt: to samo hasło + ta sama sól = ten sam hash. Różne hasła = różne hashe nawet z tą samą solą.

**Dlaczego sól jest ważna:**
Bez soli: `hash('password123')` zawsze daje ten sam wynik. Atakujący z rainbow table (pre-computed hashes dla milionów haseł) łamie wszystkie `password123` jednocześnie.

Z solą: każdy użytkownik ma unikalną sól → unikalny hash. Rainbow table musiałaby być obliczona osobno dla każdej możliwej soli → niewykonalne.

---

## Pytanie 13

> Co dzieje się gdy użytkownik jest zablokowany po zalogowaniu? Prześledź ścieżkę requesta `GET /api/auth/me`.

```typescript
router.get('/me', requireAuth, async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    select: { id: true, email: true, name: true, role: true, isBlocked: true },
  })
  if (!user || user.isBlocked) {
    req.session.destroy(() => {
      res.status(401).json({ error: 'Unauthorized' })
    })
    return
  }
  ...
})
```

Krok po kroku:

1. Agent jest zalogowany, sesja istnieje w bazie
2. Admin ustawia `isBlocked = true` w bazie
3. Agent wysyła `GET /api/auth/me`
4. `requireAuth` przepuszcza — `req.session.userId` nadal istnieje
5. Handler pobiera usera z bazy — `user.isBlocked = true`
6. `req.session.destroy()` — usuwa rekord sesji z tabeli `session` w Postgresie
7. Odpowiedź: `401 Unauthorized`
8. Kolejny request agenta z tym samym cookie → express-session nie znajdzie rekordu → pusta sesja → `requireAuth` zwraca 401

**Dlaczego nie wystarczy sprawdzić tylko przy logowaniu:**
`isBlocked` ustawiony po zalogowaniu musi działać natychmiast. Bez sprawdzenia w `/me` zablokowany agent działałby do wygaśnięcia sesji (7 dni).

---

## Pytanie 14

> Dlaczego logout używa `session.destroy()` zamiast `req.session.userId = undefined`?

```typescript
router.post('/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) {
      next(err)
      return
    }
    res.clearCookie(SESSION_COOKIE_NAME)
    res.json({ message: 'Logged out' })
  })
})
```

**`userId = undefined` — co by się stało:**

- Usuwa `userId` z obiektu w pamięci
- express-session zapisuje zmodyfikowaną sesję z powrotem do Postgresu (pusty rekord)
- Rekord sesji nadal istnieje w tabeli!
- Atakujący ze skradzionym cookie może nadal wysyłać requesty — empty session, ale `sess` w bazie zawiera puste dane
- Jeśli ktoś przez błąd nadpisze `userId` z powrotem, sesja znowu będzie aktywna

**`session.destroy()` — co robi:**

- Usuwa rekord z tabeli `session` całkowicie (`DELETE FROM session WHERE sid = ?`)
- Dowolny request z tym `connect.sid` → brak rekordu → pusta sesja → `requireAuth` zwraca 401
- Dodatkowe `clearCookie()` usuwa cookie z przeglądarki — "czyste zerwanie" po obu stronach

---

## Pytanie 15

> Dlaczego niepoprawne body POST /login zwraca 422 a nie 400 lub 401?

```typescript
const result = loginSchema.safeParse(req.body)
if (!result.success) {
  res.status(422).json({ error: result.error.flatten() })
  return
}
```

**Różnica semantyczna HTTP status codes:**

- **400 Bad Request** — request jest syntaktycznie niepoprawny (np. złe JSON, nagłówki)
- **401 Unauthorized** — brak lub niepoprawna autentykacja
- **422 Unprocessable Entity** — request jest syntaktycznie poprawny (parsuje się), ale logicznie niepoprawny (walidacja failuje)

Gdy brakuje pola `password` w body:

- JSON parsuje się poprawnie → nie 400
- Nie próbujemy autentykacji → nie 401
- Walidacja Zod failuje → 422

**Korzyść dla klienta:**
Frontend może odróżnić "serwer nie rozumie requestu" (400) od "dane nie przeszły walidacji" (422) i wyświetlić szczegóły błędów:

```json
{ "error": { "fieldErrors": { "password": ["Required"] } } }
```

---

## Pytanie 16

> Jak `request.agent(app)` w supertest zachowuje sesję między requestami? Bez tego co by się stało?

```typescript
it('destroys session and returns 200', async () => {
  const agent = request.agent(app) // ← cookie jar
  await agent.post('/api/auth/login').send({ email: 'agent@test.com', password: 'password123' })
  const res = await agent.post('/api/auth/logout')
  expect(res.status).toBe(200)
  const me = await agent.get('/api/auth/me')
  expect(me.status).toBe(401) // ← sesja zniszczona
})
```

**`request.agent(app)` — persistent cookie jar:**
Normalny `request(app).post(...)` nie przechowuje cookies między requestami — każde wywołanie to izolowany HTTP client. Po loginie `Set-Cookie: connect.sid=XYZ` jest odrzucane.

`request.agent(app)` tworzy klienta z wbudowanym cookie jar. Po `POST /login` zapamiętuje `connect.sid=XYZ`. Każdy kolejny request automatycznie dołącza `Cookie: connect.sid=XYZ`. Serwer rozpoznaje sesję — identyczne zachowanie co przeglądarka.

**Bez agent:**

- `POST /login` → sukces, `Set-Cookie` odrzucone
- `POST /logout` → brak cookie → brak sesji → próba `session.destroy()` na pustej sesji
- `GET /me` → zawsze 401 (bez autentykacji) — test zielony z błędnego powodu

---

## Pytanie 17

> Dlaczego testy middleware (`auth.test.ts`) używają mocków zamiast testcontainers jak testy routes?

```typescript
// auth.test.ts — mock
function mockReq(session = {}): Request {
  return { session } as unknown as Request
}

// auth.test.ts (routes) — real DB
const user = await prisma.user.create({ data: { email: 'agent@test.com', ... } })
```

**Middleware testuje logikę, nie integrację:**
`requireAuth` i `requireRole` sprawdzają tylko czy `req.session.userId` i `req.session.role` mają właściwe wartości. Nie dotykają bazy danych, nie wywołują zewnętrznych serwisów.

Testcontainer startuje 3-5 sekund. Test z mockiem: <1ms. Przy 10 testach middleware to różnica między "instant feedback" a "uruchamiam kawę".

**Kiedy mock jest bezpieczny:**
Gdy testowana jednostka ma wyraźne boundary — wejście (`req`) i wyjście (`next()`, `res.status()`). Mock zastępuje dokładnie to co middleware przyjmuje. Ryzyko "mock/prod divergence" = zero, bo middleware nie polega na Prisma.

**Kiedy potrzebujesz real DB (routes):**
Auth routes robią `prisma.user.findUnique()`, `bcrypt.compare()`, `session.regenerate()`. Mocki ukryłyby czy Prisma query jest poprawne, czy hash algorytm działa. Testcontainer gwarantuje end-to-end poprawność.

---

## Pytanie 18

> Co robi `prisma db seed` i dlaczego seed używa `upsert` zamiast `create`?

```typescript
await prisma.user.upsert({
  where: { email },
  update: {},
  create: {
    email,
    name: 'Admin',
    passwordHash: await bcrypt.hash(password, 10),
    role: 'ADMIN',
  },
})
```

**`prisma db seed`:**
Uruchamia skrypt `prisma/seed.ts` skonfigurowany w `package.json`:

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

Tworzy pierwszego admina w świeżej bazie. Wywoływany ręcznie (`pnpm prisma db seed`) lub automatycznie po `prisma migrate reset`.

**Dlaczego `upsert`:**

- `create` failuje z `P2002 Unique constraint` jeśli admin już istnieje (ponowny seed po deploy)
- `upsert` sprawdza `where: { email }` — jeśli istnieje, `update: {}` (brak zmian). Jeśli nie — `create`

Seed jest **idempotentny**: możesz go uruchomić 10 razy, zawsze zostanie jeden admin. Nie musisz pamiętać czy baza jest świeża.

**`update: {}`:**
Celowo puste — nie nadpisuj hasła istniejącego admina przy ponownym seeding. Gdyby admin zmienił hasło w produkcji i ktoś uruchomiłby seed → hasło wróci do domyślnego → incydent bezpieczeństwa.

---

## Pytanie 19

> Co to jest CSRF attack i jak `sameSite: 'lax'` go mityguje? Dlaczego nie `sameSite: 'strict'`?

**CSRF (Cross-Site Request Forgery):**
Złośliwa strona `evil.com` ma formularz lub JavaScript który wysyła request do `api.helpdesk.com/api/tickets` w imieniu zalogowanego agenta. Przeglądarka automatycznie dołącza cookie sesji → serwer widzi autoryzowany request.

```html
<!-- evil.com -->
<form action="https://api.helpdesk.com/api/tickets/1/close" method="POST">
  <input type="submit" value="Kliknij aby wygrać!" />
</form>
```

**`sameSite: 'lax'`:**
Przeglądarka wysyła cookie `connect.sid` tylko gdy:

- Użytkownik kliknie link i przejdzie na domenę (top-level navigation GET)
- NIE przy cross-site POST, AJAX, `<img>`, `<script>` z innych domen

Formularz z `evil.com` → POST → przeglądarka blokuje `connect.sid` → serwer widzi pusty cookie → 401.

**Dlaczego nie `strict`:**
`strict` blokuje cookie nawet przy kliknięciu linka z zewnętrznej strony (np. email z linkiem `https://helpdesk.app/tickets/5`). Użytkownik trafia na stronę i jest... wylogowany. Złe UX bez realnej korzyści bezpieczeństwa w porównaniu do `lax`.

---

## Pytanie 20

> Musisz zmienić autentykację na JWT. Co konkretnie zmienia się w kodzie? Jakie dwa nowe problemy musisz rozwiązać?

**Co by zniknęło:**

- `server/src/lib/session.ts` (cały plik)
- `connect-pg-simple`, `express-session` z `package.json`
- Tabela `session` z Prisma schema
- `req.session.*` we wszystkich middleware i routes

**Co by się pojawiło:**

```typescript
// login route
const token = jwt.sign({ userId: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: '7d' })
res.json({ token })

// requireAuth middleware
const decoded = jwt.verify(token, env.JWT_SECRET)
req.userId = decoded.userId
```

**Problem 1 — logout:**
JWT jest bezstanowy — serwer nie trzyma listy tokenów. `DELETE /logout` może tylko powiedzieć klientowi "usuń token". Ale jeśli token wycieknie, jest ważny do `exp`. Rozwiązanie: **blacklista tokenów** (Redis lub Postgres) — ale to de facto sesja, anuluje bezstanowość JWT.

**Problem 2 — natychmiastowe blokowanie:**
`isBlocked = true` w bazie nie wyloguje użytkownika z aktywnym JWT. Token jest ważny do wygaśnięcia. Przy sesjach: `/me` sprawdza DB przy każdym requeście i niszczy sesję. Przy JWT bez blacklisty: zablokowany agent ma pełny dostęp jeszcze przez N godzin (do wygaśnięcia tokena).

Dla helpdesk (zarządzanie agentami, natychmiastowe blokowanie) sesje są właściwym wyborem.
