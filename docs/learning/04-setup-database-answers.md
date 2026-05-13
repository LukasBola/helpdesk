# Odpowiedzi — Setup & Database (Plan 01)

Pytania i odpowiedzi dotyczące implementacji fundamentów projektu z PR #2.

---

## Pytanie 1

> Dlaczego `pnpm-workspace.yaml` zamiast npm workspaces lub Yarn? Jakie konkretne zalety daje pnpm w monorepo z `client/` i `server/`?

**`pnpm-workspace.yaml`** deklaruje pakiety wchodzące w skład monorepo:

```yaml
packages:
  - 'client'
  - 'server'
```

**Trzy zalety pnpm nad npm/Yarn:**

**(a) Hard links zamiast kopiowania:**
npm i Yarn kopiują każdą zależność osobno do każdego `node_modules`. pnpm trzyma jeden globalny cache i tworzy **hard linki** — `client/node_modules/typescript` i `server/node_modules/typescript` wskazują na ten sam plik na dysku. Monorepo z `typescript` w obu pakietach: npm = 2 kopie ~50MB, pnpm = 1 kopia + 2 linki.

**(b) Phantom dependencies prevention:**
npm/Yarn hoistują pakiety do root `node_modules` — możesz przypadkowo użyć zależności, która nie jest w twoim `package.json` (phantom dependency). pnpm izoluje `node_modules` przez symlinki — każdy pakiet widzi tylko to, co ma zadeklarowane. Błąd pojawi się natychmiast w dev, nie po deploy na produkcję.

**(c) `pnpm --filter` do selektywnego wykonywania:**

```bash
pnpm --filter server test   # tylko testy serwera
pnpm --filter client dev    # tylko dev serwer klienta
```

npm workspaces wymaga `npm -w server run test` — nieco mniej ergonomiczne, ale podobne. Kluczowa różnica to wydajność i izolacja.

---

## Pytanie 2

> Wyjaśnij różnicę między `prisma migrate dev` a `prisma migrate deploy`. Kiedy używasz którego i dlaczego projekt testowy używa `migrate deploy`?

**`prisma migrate dev`** — narzędzie dla dewelopera:

1. Porównuje aktualny `schema.prisma` ze stanem bazy danych
2. Tworzy nowy plik migracji SQL w `prisma/migrations/` z timestampem
3. Wykonuje SQL na bazie dev
4. Regeneruje Prisma Client (`prisma generate`)
5. Opcjonalnie uruchamia seed (`prisma db seed`)

Modyfikuje schemat bazy **i** tworzy artefakty migracji. Wymaga interakcji (potwierdza zmiany niszczące).

**`prisma migrate deploy`** — narzędzie dla produkcji/CI:

1. Bierze pliki z `prisma/migrations/` (już wygenerowane)
2. Sprawdza które migracje nie zostały jeszcze zaaplikowane na danej bazie
3. Wykonuje tylko brakujące SQL
4. NIE generuje nowych migracji, NIE uruchamia seeda

**Dlaczego `migrate deploy` w testowym `setup.ts`:**

```typescript
execSync(`node ${prismaPath} migrate deploy`, {
  cwd: serverDir,
  env: { ...process.env, DATABASE_URL: url },
})
```

Test startuje świeżą bazę PostgreSQL (testcontainer). Chcemy dokładnie ten sam schemat co produkcja — czyli te same pliki migracji. `migrate dev` próbowałoby tworzyć nowe pliki i pytać o potwierdzenie. `migrate deploy` po prostu aplikuje istniejące migracje — deterministycznie, bez interakcji, szybko.

---

## Pytanie 3

> Docker Compose ma sekcję `volumes:`. Usuń ją i uruchom kontener. Następnego dnia uruchom ponownie. Co się stanie z danymi?

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    volumes:
      - postgres_data:/var/lib/postgresql/data # ← po co?

volumes:
  postgres_data: # ← named volume
```

**Bez `volumes:`:**
PostgreSQL przechowuje dane w `/var/lib/postgresql/data` wewnątrz kontenera. Kontener Docker to efemeryczny — gdy go usuniesz (`docker compose down`) lub zrestartuje się po awarii, katalog wewnątrz kontenera znika razem z nim. Wszystkie tabele, migracje, rekordy — usunięte.

**Krok po kroku bez volumes:**

1. `docker compose up` — PostgreSQL startuje, pusty
2. `prisma migrate dev` — tworzysz tabele, wpisujesz dane
3. `docker compose down` — kontener zatrzymany **i usunięty**
4. `docker compose up` — nowy kontener, pusta baza
5. Musisz ponownie uruchomić migracje i seed

**Z named volume `postgres_data`:**
Docker tworzy wolumin zarządzany przez Docker Engine poza cyklem życia kontenera. `/var/lib/postgresql/data` jest zmountowany z tego woluminu. `docker compose down` zatrzymuje kontener, ale wolumin zostaje. Następne `docker compose up` używa tych samych danych.

Aby faktycznie wyczyścić bazę: `docker compose down -v` (flaga `-v` usuwa woluminy).

---

## Pytanie 4

> Co robi `prisma generate` i kiedy musisz go uruchomić? Skąd `server/package.json` ma `"postinstall": "prisma generate"`?

**`prisma generate`** czyta `schema.prisma` i generuje TypeScript kod **Prisma Client** do `node_modules/@prisma/client`. To co widzisz jako `prisma.user.findMany()` — metody typowane pod konkretny schemat bazy danych.

Wygenerowany klient zawiera:

- Typy TypeScript dla każdego modelu (`User`, `Ticket`, `Reply`...)
- Enumy (`Role`, `TicketStatus`, `TicketPriority`...)
- Typowane metody (`findUnique`, `create`, `update`, `delete`...)

**Kiedy musisz go uruchomić:**

1. Po każdej zmianie `schema.prisma` (nowe pole, nowy model, nowy enum)
2. Po świeżym `pnpm install` na nowej maszynie
3. Po `prisma migrate dev` (robi to automatycznie)

**Dlaczego `"postinstall": "prisma generate"`:**
`postinstall` to npm/pnpm lifecycle hook — wykonuje się automatycznie po każdym `pnpm install`. Bez tego: developer klonuje repo, robi `pnpm install`, próbuje uruchomić serwer — TypeScript nie może zaimportować `@prisma/client` bo klient nie istnieje. Z `postinstall`: jeden krok `pnpm install` i wszystko gotowe.

Na CI też działa: `pnpm install --frozen-lockfile` → automatycznie `prisma generate`.

---

## Pytanie 5

> Dlaczego `strict: true` w `tsconfig.json`? Które konkretnie opcje włącza i jakie kategorie błędów łapie każda z nich?

```json
{ "compilerOptions": { "strict": true } }
```

`strict: true` to skrót włączający rodzinę flag. Kluczowe z nich:

**`strictNullChecks`** — najważniejsza:

```typescript
const user = prisma.user.findUnique(...)
// Bez: user.email — OK (TS nie wie o null)
// Z:   user.email — Error: 'user' is possibly 'null'
```

Wymusza obsługę `null` i `undefined`. W helpdesk: `assigneeId` może być `null` — TypeScript nie pozwoli ci wywołać `ticket.assignee.name` bez sprawdzenia.

**`noImplicitAny`:**

```typescript
function handler(req, res) { ... } // Error: req ma typ 'any'
```

Wszystkie parametry muszą mieć jawne typy. Łapie niezamierzone `any` które maskują błędy typowania.

**`strictFunctionTypes`:**
Sprawdza zgodność typów przy callbackach — kontrawariantność parametrów funkcji. Łapie subtelne błędy przy przekazywaniu handlerów jako argumentów.

**`strictPropertyInitialization`:**
Właściwości klasy muszą być inicjalizowane w konstruktorze lub oznaczone `!` (non-null assertion).

**Dlaczego warto:**
W projekcie z Prismą (zwracającą nullable relacje) i Express (dynamiczne `req.body`) `strict: true` eliminuje całą klasę błędów runtime zanim kod wyjdzie z edytora.

---

## Pytanie 6

> `Ticket` ma `@@index([customerEmail])` i `@@index([status, assigneeId])`. Czym różni się indeks złożony od dwóch osobnych? Kiedy indeks złożony pomaga, a kiedy nie?

```prisma
@@index([customerEmail])
@@index([status, assigneeId])
```

**Indeks złożony `[status, assigneeId]`:**
Jeden indeks B-tree z kluczem `(status, assigneeId)`. PostgreSQL sortuje rekordy po `status` najpierw, potem po `assigneeId` wewnątrz każdego statusu.

**Kiedy pomaga:**

```sql
-- Optymalny: oba pola w WHERE, pierwsze pole jest lewym prefiksem
SELECT * FROM tickets WHERE status = 'OPEN' AND assigneeId = 'u1'

-- Też pomaga: tylko lewe pole
SELECT * FROM tickets WHERE status = 'OPEN'
-- ("left prefix rule" — można używać częściowo od lewej)
```

**Kiedy NIE pomaga:**

```sql
-- Pominięcie lewego pola — indeks złożony NIE jest używany
SELECT * FROM tickets WHERE assigneeId = 'u1'
-- PostgreSQL musi robić full table scan lub osobny indeks na assigneeId
```

**Dlaczego nie dwa osobne indeksy:**
Dwa oddzielne indeksy (`[status]` i `[assigneeId]`) obsługują każde pole osobno, ale zapytanie łączące oba warunki wymaga operacji `index merge` — PostgreSQL musi pobrać wyniki z obu indeksów i znaleźć część wspólną. Indeks złożony wykonuje to w jednym przejściu.

**Helpdesk use case:** Agenci filtrują tickety po statusie i przypisaniu — klasyczne zapytanie `WHERE status = 'OPEN' AND assigneeId = $currentAgent`. Indeks złożony obsługuje to bezpośrednio.

---

## Pytanie 7

> `messageId String @unique` na modelu `Ticket` — po co? Jaką duplikację danych to zapobiega i co by się stało bez tego pola?

```prisma
model Ticket {
  messageId String @unique
  ...
}
```

**Co to jest `messageId`:**
Email ma nagłówek `Message-ID` — unikalny identyfikator nadany przez serwer pocztowy (np. `<20260511@mail.postmarkapp.com>`). Jest globalnie unikalny — każdy email ma inny.

**Jaką duplikację zapobiega:**
Inbound email workflow: Postmark webhookuje każdy przychodzący email. Sieciowe retry, ponowne deliveries, problemy z siecią mogą spowodować, że ten sam webhook zostanie wysłany dwukrotnie. Bez `@unique` na `messageId`:

1. Webhook 1: email z `Message-ID: <abc>` → tworzymy ticket #1
2. Webhook 2 (retry tego samego emaila): ten sam `Message-ID: <abc>` → tworzymy ticket #2
3. Klient dostaje dwa tickety zamiast jednego, agent odpowiada na oba

**Z `@unique`:**
Drugie `prisma.ticket.create({ data: { messageId: '<abc>', ... } })` rzuci `P2002 Unique constraint failed`. Handler webhooka może złapać ten błąd i zwrócić 200 (idempotent) zamiast tworzyć duplikat.

Bez tego pola cały inbound email system byłby niestabilny przy jakichkolwiek problemach sieciowych.

---

## Pytanie 8

> Dlaczego `onDelete: Cascade` na relacji `TicketHistory → Ticket` i `Reply → Ticket`, ale `onDelete: SetNull` na `Ticket → User` (assignee)?

```prisma
model TicketHistory {
  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
}

model Reply {
  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
}

model Ticket {
  assignee User? @relation(fields: [assigneeId], references: [id])
  // domyślnie: onDelete: SetNull bo assigneeId jest optional
}
```

**Cascade na TicketHistory i Reply:**
Historia zmian i odpowiedzi nie mają sensu bez ticketu — to dane podrzędne ściśle powiązane z rodzicem. Jeśli ticket jest usuwany, historia i odpowiedzi tracą kontekst. Orphan records (`ticketId` wskazujący na nieistniejący ticket) to błąd integralności danych. Cascade gwarantuje spójność: usuń ticket → usuń całą jego historię i odpowiedzi automatycznie.

**SetNull na Ticket.assigneeId:**
Ticket może istnieć bez przypisanego agenta (pole `assigneeId String?` — optional). Gdy agent jest usuwany z systemu, nie chcemy usuwać jego ticketów — to historia obsługi klienta. `SetNull` odkłada `assigneeId` na `null` — ticket pozostaje z statusem "nieprzypisany" i może trafić do innego agenta.

Gdybyś użył `Cascade` dla assignee: usunięcie agenta usunęłoby wszystkie jego tickety — utrata historii obsługi klienta, brak widoczności dla klienta który nadal czeka.

---

## Pytanie 9

> Jak `DATABASE_URL` z pliku `.env` trafia do Prismy? Opisz każdy krok przez kod.

**Krok 1 — plik `.env` na dysku:**

```
DATABASE_URL="postgresql://helpdesk:helpdesk@localhost:5432/helpdesk"
```

**Krok 2 — ładowanie przez `tsx --env-file`:**

```json
"dev": "tsx watch --env-file=../.env src/index.ts"
```

tsx (TypeScript executor) przed uruchomieniem kodu parsuje plik `.env` i przepisuje zmienne do `process.env`. Po tym kroku `process.env.DATABASE_URL` zawiera connection string.

**Krok 3 — walidacja przez `env.ts`:**

```typescript
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ...
})
const result = schema.safeParse(process.env)
export const env = result.data
```

Zod pobiera `process.env.DATABASE_URL`, waliduje że istnieje i nie jest pusty. `env.DATABASE_URL` to zwalidowany string.

**Krok 4 — `schema.prisma` czyta zmienną środowiskową:**

```prisma
datasource db {
  url = env("DATABASE_URL")
}
```

Prisma przy starcie (tworzeniu `PrismaClient`) wołuje `env("DATABASE_URL")` — co po prostu czyta `process.env.DATABASE_URL`. Nie korzysta z `env.ts` — czyta bezpośrednio z `process.env`.

**Krok 5 — `PrismaClient` nawiązuje połączenie:**

```typescript
export const prisma = globalForPrisma.prisma ?? new PrismaClient(...)
```

Przy pierwszym użyciu Prisma otwiera connection pool do URL z datasource.

---

## Pytanie 10

> `db.ts` loguje zapytania SQL tylko w `development`. Jakie dwa problemy rozwiązuje to w produkcji?

```typescript
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  })
```

**Problem 1 — wyciek danych (security):**
Logowanie `query` w Prisma drukuje pełne SQL razem z wartościami parametrów:

```
prisma:query SELECT * FROM "users" WHERE email = 'admin@company.com' AND passwordHash = '$2b$10$...'
```

W produkcji logi mogą trafić do zewnętrznego systemu (Datadog, CloudWatch, Splunk). Pracownicy operacji, audytorzy, potencjalnie atakujący z dostępem do logów — widzą emaile, hashowane hasła, identyfikatory sesji. Naruszenie GDPR i bezpieczeństwa.

**Problem 2 — wydajność:**
W helpdeskowym obciążeniu produkcyjnym: setki requestów na minutę = setki lub tysiące zapytań SQL. Każde logowanie `query` to:

- Serializacja obiektu zapytania do stringa
- Zapis do stdout/stderr (I/O)
- Ewentualny eksport do systemu logowania

Overhead per query to kilkanaście-kilkadziesiąt mikrosekund — nieistotny w dev. W produkcji przy 500 req/min = 500+ zbędnych operacji I/O na minutę. Przy drażliwych zapytaniach (np. joinach) logi mogą być kilobajty tekstu na query.

`['error']` loguje tylko błędy SQL — niezbędne minimum do diagnostyki produkcyjnej.

---

## Pytanie 11

> ESLint w projekcie używa tzw. "flat config" (`eslint.config.js` eksportujący tablicę). Jak różni się od starego `.eslintrc`? Co to zmienia dla monorepo?

**Stary format `.eslintrc.json`:**

```json
{
  "extends": ["plugin:@typescript-eslint/recommended"],
  "rules": { "no-unused-vars": "error" },
  "overrides": [{ "files": ["*.tsx"], "rules": { "react/jsx-uses-react": "off" } }]
}
```

Hierarchiczne — ESLint szuka `.eslintrc` w katalogu pliku, potem w rodzicu, aż do root. Merge reguł w górę drzewa. Trudne do debugowania "skąd ta reguła pochodzi?".

**Nowy flat config (`eslint.config.js`):**

```javascript
export default tseslint.config(
  { ignores: ['**/dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { files: ['server/**/*.ts'], languageOptions: { globals: globals.node } },
  { files: ['client/**/*.{ts,tsx}'], plugins: { react: reactPlugin } },
)
```

Jeden plik w root, tablica obiektów konfiguracji. Każdy obiekt to warstwa — stosowane od góry do dołu. Nie ma magicznego merge'u z parent directories — wszystko jest jawne i przewidywalne.

**Co zmienia dla monorepo:**
W starym systemie `server/` i `client/` mogłyby mieć własne `.eslintrc` z różnymi regułami — trudno utrzymać spójność. W flat config jeden `eslint.config.js` w root obsługuje oba pakiety. Sekcja `files: ['server/**/*.ts']` stosuje Node.js globals tylko do serwera, `files: ['client/**/*.{ts,tsx}']` dodaje React plugin tylko do klienta — wszystko w jednym pliku, bez magii.

---

## Pytanie 12

> `lint-staged` w `package.json` ma dwie sekcje: dla `*.{ts,tsx}` i dla `*.{json,md,yaml,yml,css}`. Dlaczego ESLint jest tylko w pierwszej? Co by się stało gdybyś dodał ESLint do drugiej?

```json
"lint-staged": {
  "*.{ts,tsx}": ["prettier --write", "eslint --max-warnings 0"],
  "*.{json,md,yaml,yml,css}": ["prettier --write"]
}
```

**Dlaczego ESLint tylko dla TypeScript:**
ESLint jest analizatorem kodu TypeScript/JavaScript. Nie potrafi parsować JSON, Markdown, YAML ani CSS — próba uruchomienia `eslint --ext .json file.json` skończy się błędem parsera lub "no rules apply". Prettier potrafi formatować wszystkie wymienione formaty — jest agennostyczny co do języka.

**Co by się stało z ESLint na `.json`:**

```bash
# pre-commit hook
prettier --write package.json
eslint --max-warnings 0 package.json
# Error: No files matching the pattern were found: "package.json"
# lub: Parsing error: Unexpected token
```

Hook zrzuciłby błąd przy każdym commitcie z plikiem JSON. Developer nie mógłby commitować zmian w konfiguracji.

**Kolejność ma znaczenie:**
W sekcji TypeScript: najpierw `prettier --write` (formatuje plik), potem `eslint` (lintuje sformatowany plik). Gdyby ESLint był pierwszy, mógłby narzekać na formatowanie, które Prettier zaraz naprawi — fałszywe alarmy. Po Prettier: ESLint sprawdza tylko rzeczywiste problemy logiczne, nie styl.

---

## Pytanie 13

> `pnpm-workspace.yaml` ma sekcję `allowBuilds`. Po co i co by się stało bez niej?

```yaml
allowBuilds:
  '@prisma/client': true
  '@prisma/engines': true
  bcrypt: true
  cpu-features: true
  esbuild: true
  prisma: true
  protobufjs: true
  ssh2: true
```

**Co to są "builds" w pnpm:**
Niektóre pakiety npm mają skrypt `postinstall` który kompiluje natywny kod (C/C++) lub wykonuje inne operacje przy instalacji. pnpm od wersji 9 domyślnie **blokuje** wykonywanie lifecycle skryptów (`postinstall`, `preinstall`) ze względów bezpieczeństwa — supply chain attacks (złośliwy kod w `postinstall` mógłby wykraść klucze SSH).

**Dlaczego te pakiety potrzebują builds:**

- **`@prisma/client` i `prisma`**: `postinstall` uruchamia `prisma generate` — generuje TypeScript client ze schematu
- **`bcrypt`**: Natywny addon Node.js napisany w C++ — musi być skompilowany dla konkretnej platformy (arm64 vs x64, macOS vs Linux)
- **`esbuild`**: Bundler w Go — pobiera/kompiluje binarki dla platformy
- **`ssh2`** i **`cpu-features`**: Natywne addony dla SSH i detekcji CPU

**Bez `allowBuilds`:**
`pnpm install` zainstaluje pakiety, ale pominąłby ich `postinstall`. Efekt: `@prisma/client` nie wygenerowałby TypeScript client (błąd importu), `bcrypt` byłby dostępny jako JS ale bez natywnego C++ acceleratora (10x wolniejszy hashing lub błąd modułu).

---

## Pytanie 14

> `tsconfig.json` ma `"module": "CommonJS"` ale `package.json` monorepo ma `"type": "module"`. Czy to sprzeczność? Wyjaśnij jak to działa razem.

```json
// server/tsconfig.json
{ "module": "CommonJS" }

// /package.json (root)
{ "type": "module" }
```

**Pozornie sprzeczne, faktycznie spójne:**

`"type": "module"` w root `package.json` dotyczy tylko plików `.js` w root monorepo — mówi Node.js że `.js` w root to ESM. Ale `server/` ma własny `package.json` (bez `"type"`) i własny `tsconfig.json`.

TypeScript kompiluje `.ts` do `.js` według swojego `module` ustawienia. `"module": "CommonJS"` oznacza: generuj `require()` i `module.exports` zamiast `import`/`export` w skompilowanym `.js`.

**Dlaczego serwer używa CommonJS:**
Express i jego ekosystem (szczególnie starsza wersja 4.x) historycznie działa w CommonJS. Wiele bibliotek (bcrypt, connect-pg-simple) ma CJS wewnętrznie. Mieszanie ESM i CJS jest możliwe, ale skomplikowane — wymaga `.mjs` rozszerzeń lub `interopRequireDefault` wrapperów.

**W dev działa inaczej:**

```json
"dev": "tsx watch --env-file=../.env src/index.ts"
```

`tsx` bezpośrednio uruchamia TypeScript, pomijając kompilację. Nie patrzy na `"module"` w tsconfig — obsługuje zarówno ESM jak i CJS natywnie. `"module": "CommonJS"` jest używane tylko przy `tsc` (build produkcyjny).

---

## Pytanie 15

> Dlaczego `prisma migrate dev` tworzy dwie osobne migracje (`20260511165002_init` i `20260511165549_add_indexes`) zamiast jednej? Jaka jest filozofia stojąca za tym podziałem?

```
prisma/migrations/
  20260511165002_init/migration.sql       ← tabele, enumy, relacje
  20260511165549_add_indexes/migration.sql ← tylko indeksy
```

**Pierwsza migracja (`_init`):**
Tworzy cały schemat: rozszerzenie pgvector, enumy (`Role`, `TicketStatus`...), wszystkie tabele z constraint'ami i kluczami obcymi, unikalne indeksy wynikające z `@unique` w schema (np. `users_email_key`, `tickets_messageId_key`).

**Druga migracja (`_add_indexes`):**
Tylko indeksy wydajnościowe: `@@index([customerEmail])`, `@@index([status, assigneeId])`, `@@index([ticketId])` dla relacji.

**Filozofia:**
Migracje są atomowe — albo całkowicie się wykonują, albo nie. Podział na dwie umożliwia:

1. **Code review**: Reviewer widzi "ta migracja dodaje tylko indeksy" — mały, zrozumiały diff
2. **Rollback**: Każda migracja ma jasno określony zakres. Cofnięcie tylko indeksów nie wpływa na schemat
3. **Historia**: `git log prisma/migrations/` pokazuje historię zmian schematu — dwie migracje dokumentują dwa etapy myślenia (najpierw zdefiniuj dane, potem zoptymalizuj dostęp)
4. **Produkcja**: Duże tabele z danymi — `CREATE INDEX` na milionach rekordów może trwać minuty i blokować tabelę. Osobna migracja z indeksami może być uruchomiona offline (`CONCURRENTLY`)

---

## Pytanie 16

> `ci.yml` ma `pnpm install --frozen-lockfile`. Co robi flaga `--frozen-lockfile`? Co by się stało bez niej i dlaczego to ważne w CI?

```yaml
- run: pnpm install --frozen-lockfile
```

**Co robi `--frozen-lockfile`:**
Zabrania pnpm modyfikowania `pnpm-lock.yaml`. Instaluje dokładnie te wersje pakietów które są zapisane w pliku lock — nie "upgrade'uje" zależności gdy `package.json` ma zakresy (`^3.24.1`).

**Bez `--frozen-lockfile`:**
`package.json`: `"zod": "^3.24.1"` (karetka = kompatybilna wersja). Tydzień temu ktoś publish'uje `zod@3.25.0`. CI bez `--frozen-lockfile` zainstaluje `3.25.0` — nową, niezatwierdzoną wersję. Jeśli `3.25.0` ma breaking change lub bug, CI może:

- Failować z niezrozumiałym błędem
- Przechodzić z innym zachowaniem niż lokalne env dewelopera
- Deployować kod który nie był testowany z daną wersją zależności

**Z `--frozen-lockfile`:**
CI instaluje dokładnie to co dev committ'ował. Jeśli `pnpm-lock.yaml` nie jest zsynchronizowany z `package.json` (ktoś dodał zależność bez aktualizacji locka), `--frozen-lockfile` rzuci błąd — wymuszając świadome zarządzanie lockiem.

**Dodatkowy efekt — wydajność:**
pnpm cache jest invalidowany gdy lock file nie zmienia się między runami CI (GitHub Actions caches `~/.pnpm-store`). `--frozen-lockfile` gwarantuje reprodukowalność cache'u.

---

## Pytanie 17

> `ci.yml` ma job `test` który uruchamia testy serwera i klienta sekwencyjnie (`pnpm --filter server test` potem `pnpm --filter client test`). Dlaczego `--filter` zamiast `pnpm test` z roota? Co robi `--passWithNoTests` w konfiguracji klienta?

**Dlaczego `--filter` zamiast root `pnpm test`:**
Root `package.json`:

```json
"test": "echo \"No tests yet\""
```

Root nie ma prawdziwych testów — jest pośrednikiem. `pnpm test` w root uruchomiłby ten echo, nie testy pakietów. Trzeba jawnie wskazać pakiet.

Alternatywnie można by użyć `pnpm -r test` (rekursywnie we wszystkich pakietach), ale `--filter server` i `--filter client` dają kontrolę nad kolejnością i izolacją:

- Jeśli `server test` failuje, CI od razu zatrzymuje pipeline bez uruchamiania `client test`
- Jasne raportowanie: "server tests failed" vs "client tests failed"

**Dlaczego `--filter` zamiast `cd server && pnpm test`:**
`pnpm --filter server` działa z root — pnpm rozumie workspace graph, stosuje właściwe PATH, hoisted deps. `cd` zmienia cwd co może powodować problemy z ładowaniem modułów z root workspace.

**`--passWithNoTests` w kliencie:**

```json
"test": "vitest run --config vitest.config.ts --passWithNoTests"
```

Klient nie ma jeszcze żadnych plików testowych (`*.test.ts`). Bez tej flagi Vitest zwróci exit code 1 gdy nie znajdzie testów — CI failowałby. `--passWithNoTests` mówi: "brak testów to nie błąd, wróć 0". Pozwala na budowanie projektu inkrementalnie — testy klienta dojdą później.

---

## Pytanie 18

> `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` — dlaczego ta zmienna środowiskowa jest w każdym jobie CI? Co by się stało bez niej?

```yaml
jobs:
  lint:
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
```

**Kontekst:**
GitHub Actions uruchamiają skrypty w wbudowanym Node.js. `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4` to JavaScript actions — małe Node.js skrypty zarządzane przez GitHub.

Projekt wymaga Node.js 22+ (`"engines": { "node": ">=22 <24" }`). GitHub Actions runner domyślnie używa Node.js 20 (lub niższego) do uruchamiania samych actions — niezależnie od wersji którą instalujesz przez `setup-node`.

**Bez `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`:**
Actions runner uruchamia `actions/checkout`, `pnpm/action-setup` itd. przez wbudowanego Node.js 20. Nowsze wersje tych actions mogą wymagać Node.js 22+ i wyświetlają deprecation warning, a w przyszłości mogą w ogóle odmówić działania na starszym runtime.

**Z `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true`:**
Mówi runner'owi GitHub Actions: użyj Node.js 24 (lub 22+) do uruchamiania samych JavaScript actions (nie kodu projektu). To oddzielna kwestia od `node-version: 22` w `setup-node` — to jest wersja Node.js dla kroków `run:` i testów projektu.

Zmienna ta zapewnia kompatybilność actions ze środowiskiem i eliminuje deprecation warnings w logach CI.

---

## Pytanie 19

> `SIGTERM` i `SIGINT` w `index.ts` — co to są i dlaczego serwer je obsługuje? Co by się stało bez graceful shutdown?

```typescript
const shutdown = () => {
  logger.info('Shutting down...')
  server.close(() => {
    stopQueue().then(() => process.exit(0))
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

**Co to są sygnały:**

- `SIGINT` — "Signal Interrupt" — wysyłany przez terminal gdy użytkownik naciśnie `Ctrl+C`. Domyślne zachowanie Node.js: natychmiastowe `process.exit()`
- `SIGTERM` — "Signal Terminate" — wysyłany przez system operacyjny, Docker, Kubernetes, PM2 przy żądaniu zatrzymania kontenera/procesu. Docker daje 10 sekund na SIGTERM przed wysłaniem SIGKILL (który nie można obsłużyć)

**Bez graceful shutdown — problemy:**

1. **Utrata w-trakcie requestów:** Aktywne requesty HTTP są brutalnie przerywane. Klient dostaje "connection reset" zamiast odpowiedzi. Jeśli request był w trakcie zapisu do bazy — może być niepełny.

2. **Nieukończone zadania kolejki:** `pg-boss` przetwarza emaile inbound. Przerwanie w połowie przetwarzania: email może zostać oznaczony jako "w trakcie" w kolejce, ale ticket nie zostanie stworzony. Potencjalny deadlock w kolejce.

3. **Connection leak:** `PrismaClient` i pula połączeń PostgreSQL nie są zamknięte. Baza musi samodzielnie detectować i czyścić wygasłe połączenia.

**Z `server.close(callback)`:**
Serwer przestaje przyjmować nowe połączenia, ale kończy obsługę aktywnych requestów. Po zakończeniu wywołuje callback → `stopQueue()` → `process.exit(0)`. Czyste wyjście.

---

## Pytanie 20

> `schema.prisma` używa `cuid()` jako domyślną wartość dla ID (`@id @default(cuid())`). Jakie alternatywy były dostępne i dlaczego `cuid()` jest dobrym wyborem dla helpdesk?

```prisma
model User {
  id String @id @default(cuid())
  ...
}
```

**Dostępne alternatywy w Prisma:**

**(a) `autoincrement()` — `INTEGER` sekwencja:**

```prisma
id Int @id @default(autoincrement())
-- Wynikowe SQL: SERIAL PRIMARY KEY
```

Prosto, czytelnie. Problem: numery są przewidywalne i wyliczalne. `GET /tickets/1`, `/tickets/2`, `/tickets/3` — atakujący może iterować tickety i próbować dostępu do cudzych. Mniejszy problem przy autoryzacji, ale ujawnia liczbę rekordów i kolejność tworzenia.

**(b) `uuid()` — UUID v4:**

```prisma
id String @id @default(uuid())
-- np. '550e8400-e29b-41d4-a716-446655440000'
```

Globalnie unikalny, losowy. Problem: UUID v4 jest losowy — nie można go sortować chronologicznie. `ORDER BY id` nie daje kolejności tworzenia. Fragmentacja indeksu B-tree (losowe wstawki wszędzie zamiast na końcu) — pogarsza wydajność insertów na dużych tabelach.

**(c) `cuid()` — Collision-resistant Unique ID:**

```
clh3qhikg0000356lf2g70gy1
```

Zaczyna się od `c`, po nim timestamp (pierwsze znaki), potem losowość. Chronologicznie sortowalny (podobnie jak ULID). Bezpieczny (nieprzewidywalny), czytelny (mniejszy niż UUID), wydajny (B-tree nie fragmentuje się bo nowe ID są zawsze "większe" od starych).

**Dla helpdesk:** Tickety, użytkownicy, odpowiedzi — wszystko ma naturalną kolejność chronologiczną. `cuid()` jako ID pozwala sortować `ORDER BY id` i dostać przybliżoną kolejność tworzenia, bez dodawania osobnego indeksu na `createdAt`.
