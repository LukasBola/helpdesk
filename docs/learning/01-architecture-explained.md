# Architektura Helpdesk — Omówienie i Pytania

Omówienie przepływów i kluczowych decyzji architektonicznych w projekcie helpdesk.

---

## 1. Architektura: Monorepo i pnpm Workspaces

### Co to jest monorepo?

Wyobraź sobie, że budujesz dom. Masz dwa zespoły: jeden buduje fundamenty (backend), drugi wykańcza wnętrza (frontend). Możesz dać każdemu zespołowi osobny magazyn z narzędziami (osobne repozytoria git — **polyrepo**), ale wtedy:

- Jak jeden zespół zmieni rozmiar drzwi, drugi się o tym nie dowie
- Każdy zespół ma własny zestaw narzędzi (osobne `node_modules`)
- Trudno koordynować zmiany dotyczące obu

**Monorepo** to jeden wielki magazyn, w którym oba zespoły pracują. Wspólne narzędzia leżą na środku.

```
helpdesk/                     ← jedno repo git
├── package.json              ← root: wspólne narzędzia (ESLint, Prettier, Husky)
├── client/                   ← pakiet frontendu
│   └── package.json
└── server/                   ← pakiet backendu
    └── package.json
```

**Dlaczego monorepo dla helpdesk?**

1. **Współdzielone typy** — w przyszłości będziesz miał `shared/types.ts` z definicją `Ticket`, której użyje i React, i Express. Jedna zmiana, oba miejsca widzą.
2. **Atomic commits** — jeden commit może zmienić API w backendzie ORAZ jego użycie w frontendzie.
3. **Spójne narzędzia** — jeden ESLint, jeden Prettier, jedne reguły.

**pnpm workspaces** mówi pnpm: "Hej, w tym repo jest kilka pakietów. Zarządzaj nimi razem."

- **Wspólne zależności dzielone na dysku** — jeśli `client` i `server` używają `typescript`, pnpm trzyma jedną kopię, w każdym pakiecie tworzy symlink.
- **Filtrowanie komend** — `pnpm --filter server test` uruchamia testy tylko w `server/`.

**Analogia:** pnpm workspaces to jak wspólna kuchnia w bursie studenckiej. Jeden ekspres do kawy dla wszystkich zamiast 50 ekspresów w 50 pokojach.

---

## 2. Request Flow: `GET /health`

Co się dzieje krok po kroku gdy przeglądarka odpytuje backend:

```
1. PRZEGLĄDARKA
   curl http://localhost:3000/health
   Tworzy pakiet HTTP: GET /health HTTP/1.1

2. SYSTEM OPERACYJNY (TCP/IP)
   Pakiet trafia przez localhost na port 3000
   Tam nasłuchuje proces Node.js (uruchomiony przez tsx)

3. NODE.JS EVENT LOOP
   Node odbiera pakiet, dekoduje HTTP, tworzy obiekty `req` i `res`
   Wywołuje callback zarejestrowany przez Express

4. EXPRESS APP — łańcuch middleware:
   4a. express.json()    → parsuje body (tu puste, GET request)
   4b. router matching   → szuka trasy pasującej do GET /health
   4c. handler           → wykonuje funkcję, zwraca { status: "ok" }

5. RESPONSE
   res.json({ status: "ok" })
   HTTP/1.1 200 OK
   Content-Type: application/json
   { "status": "ok" }

6. PRZEGLĄDARKA
   Odbiera, parsuje JSON, wyświetla
```

### Co to jest "middleware chain"?

Wyobraź sobie taśmę produkcyjną. Każdy pracownik (middleware) coś robi z paczką (request) i przekazuje dalej przez `next()`. Jeśli powie "stop" (`res.send()` bez `next()`), taśma się zatrzymuje.

```javascript
app.use(express.json()) // pracownik 1: parsuje JSON
app.use('/health', handler) // pracownik 2: obsługuje /health
app.use(errorHandler) // pracownik 3: łapie błędy
```

### Dlaczego error handler ma 4 parametry?

Express patrzy na liczbę parametrów funkcji middleware:

- `(req, res, next)` → normalny middleware
- `(err, req, res, next)` → error handler

To sprytny hack — jeśli pominiesz `err`, Express nie rozpozna funkcji jako error middleware.

### Dlaczego `res.headersSent` w error handlerze?

```javascript
if (res.headersSent) {
  next(err)
  return
}
```

Jeśli poprzedni middleware już zaczął wysyłać odpowiedź (np. strumieniowanie danych), nie możemy wywołać `res.status(500).json(...)` — nagłówki są już wysłane. Sprawdzamy to i przekazujemy błąd dalej.

---

## 3. Backend Startup Flow: `tsx watch --env-file=../.env src/index.ts`

```
1. tsx WATCH START
   tsx = TypeScript Execute — uruchamia TS bez kompilacji do .js
   --watch obserwuje pliki i restartuje przy zmianach (hot reload)

2. LOAD ENV VARS
   --env-file=../.env wczytuje zmienne z pliku do process.env
   (wbudowane w Node.js od v20.6, nie trzeba dotenv!)
   WAŻNE: używamy --env-file=../.env (z =), nie --env-file ../.env (ze spacją)
   bo tsx traktuje argument po spacji jako nazwę pliku wejściowego

3. import { env } from './env'
   Plik env.ts wykonuje się:
   3a. Zod schema parsuje process.env
   3b. Brak DATABASE_URL → throw new Error(...)
   3c. PORT = "abc" → Zod coerce zamienia na NaN → throw new Error(...)
   3d. Wszystko OK → eksportuje typed object: env.DATABASE_URL, env.PORT

   WAŻNE: jeśli walidacja failuje, aplikacja NIE startuje.
   "Fail fast" — lepiej crashować przy starcie niż produkować błędy w runtime.

4. import { app } from './app'
   Tworzy instancję Express, rejestruje middleware

5. app.listen(env.PORT)
   Otwiera socket TCP na porcie 3000

6. logger.info('Server started')
   Pino loguje: { msg: "Server started", port: 3000, time: ... }
   W dev → pino-pretty (kolorowe, czytelne)
   W prod → czysty JSON (świetne dla Datadog, CloudWatch, Grafana)
```

### Dlaczego `app.ts` i `index.ts` są osobnymi plikami?

`index.ts` odpowiada za **infrastrukturę** (uruchamia serwer, obsługuje sygnały OS).
`app.ts` odpowiada za **logikę aplikacji** (Express, middleware, routes).

Dzięki temu w testach możesz zaimportować `app` bez uruchamiania prawdziwego serwera HTTP:

```javascript
// W teście — importujesz app bez nasłuchiwania na porcie
import { app } from '../app'
const res = await request(app).get('/health')
```

### Dlaczego `throw new Error()` zamiast `process.exit(1)` w env.ts?

`process.exit(1)` to _atomic bomb_ — zabija wszystko, w tym proces testowy:

```javascript
// Z process.exit(1) — niemożliwe do testowania
// Vitest crashuje razem z aplikacją

// Z throw new Error() — działa:
expect(() => loadEnv()).toThrow('Invalid environment variables')
```

W produkcji efekt jest identyczny (aplikacja umiera). Ale w testach masz pełną kontrolę.

### Dlaczego Prisma singleton z `globalThis`?

W hot reload dzieje się to bez singletona:

```
1. Zapisujesz plik → tsx restartuje moduł
2. Nowy moduł importuje Prisma → new PrismaClient() → otwiera 10 połączeń do DB
3. Stary PrismaClient jeszcze nie zwolnił połączeń (GC nie zdążył)
4. Po 50 przeładowaniach w ciągu godziny:
   PostgreSQL: "ERROR: too many connections"
```

Rozwiązanie: `globalThis` przeżywa hot reload modułów (tsx restartuje moduły, nie cały proces). Prisma jest tworzona raz.

```javascript
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

W produkcji nie używamy tego — nie ma hot reloadu, proces startuje raz.

**Analogia:** jeden recepcjonista w hotelu, nie nowy przy każdym wejściu gościa.

---

## 4. Frontend Flow: `http://localhost:5173`

```
1. PRZEGLĄDARKA: GET http://localhost:5173

2. VITE DEV SERVER
   To nie zwykły serwer plików — to "module dev server"
   Kompiluje pliki ES modules na żądanie, nie z góry
   Brak "build step" w dev

3. VITE ZWRACA index.html
   <script type="module" src="/src/main.tsx"></script>

4. PRZEGLĄDARKA: GET /src/main.tsx
   Vite transpiluje TSX → JS na żywo używając esbuild
   Zwraca gotowy JavaScript

5. PRZEGLĄDARKA: GET /node_modules/.vite/deps/react.js
   Vite pre-bundle'uje zależności (npm packages) raz i cache'uje
   Twój kod aplikacji NIE jest bundle'owany w dev — każdy plik osobno

6. REACT START
   ReactDOM.createRoot(...).render(<App />)
   React buduje virtual DOM, renderuje do real DOM

7. TANSTACK QUERY (gdy fetchujesz dane)
   useQuery({ queryKey: ['tickets'], queryFn: ... })
   Sprawdza cache → jeśli brak → Axios request do backendu port 3000
   Wynik w cache → komponent się re-renderuje

8. HMR (Hot Module Replacement)
   WebSocket między Vite a przeglądarką
   Zmiana pliku .tsx → Vite wysyła tylko zmieniony moduł
   React Fast Refresh aktualizuje komponent BEZ utraty stanu
```

### Vite vs Webpack

**Webpack:** bundle'uje wszystko z góry — wolniejsze przy dużym projekcie.
**Vite:** serwuje ES modules on-demand — błyskawiczne. W produkcji używa Rollup do pełnego bundlingu.

### TanStack Query vs useState + useEffect

TanStack Query daje za darmo:

- **Cache'owanie** — drugi komponent z tym samym `queryKey` nie robi drugiego requesta
- **Background refetch** — odświeża dane gdy wracasz do taba
- **Stale-while-revalidate** — pokazuje stare dane, fetchuje świeże w tle
- **Automatyczny retry** — ponawia request przy błędzie sieciowym
- **Optimistic updates** — UI aktualizuje się przed potwierdzeniem z serwera

**Analogia:** `useEffect + fetch` to gotowanie wody na każdą herbatę od nowa. TanStack Query to termos — raz nagrzane, dostępne dla wszystkich, automatycznie się odświeża.

---

## 5. Test Flow: Dlaczego testcontainers, nie mocki

### Z mockiem:

```javascript
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    ticket: { findMany: vi.fn().mockResolvedValue([{ id: 1, title: 'Test' }]) },
  })),
}))
```

Testujesz **że mock zwraca to, co kazałeś mu zwrócić**. Nic więcej.

### Z testcontainers:

```javascript
const container = await new GenericContainer('postgres:16')
  .withEnvironment({ POSTGRES_PASSWORD: 'test' })
  .withExposedPorts(5432)
  .start()

process.env.DATABASE_URL = `postgresql://...${container.getMappedPort(5432)}/postgres`
await execSync('npx prisma migrate deploy')
```

Testujesz:

- Realna baza PostgreSQL w Dockerze
- Realne migracje zaaplikowane
- Realny Prisma client wykonuje realne zapytania
- Unique constraints, foreign keys, indeksy — wszystko działa

| Aspekt                    | Mocki  | Testcontainers        |
| ------------------------- | ------ | --------------------- |
| Szybkość                  | ~100ms | ~5s (start kontenera) |
| Realizm                   | Niski  | Wysoki                |
| Łapanie regresji schematu | Nie    | Tak                   |
| Łapanie błędów migracji   | Nie    | Tak                   |

**Analogia:** testowanie samochodu na symulatorze vs jazda próbna. Symulator szybszy, ale czy ABS naprawdę zadziała?

### Dlaczego `GenericContainer` zamiast `PostgreSqlContainer`?

`@testcontainers/postgresql` to osobny pakiet z helper'ami. `GenericContainer` daje pełną kontrolę nad obrazem Dockera — potrzebne gdy chcesz np. `pgvector` extension dla AI embeddings. Nisko-poziomowe, ale elastyczne.

---

## 6. CI Flow: `git push`

```
git push → GitHub wykrywa trigger → spawn 3 Ubuntu runners (równolegle):

├── Job 1: LINT & FORMAT (~31s)
│   checkout → pnpm install → eslint → prettier check

├── Job 2: TYPESCRIPT CHECK (~23s)
│   checkout → pnpm install → tsc --noEmit

└── Job 3: TESTS (~33s)
    checkout → pnpm install → server tests (testcontainers) → client tests

Wszystkie PASS → można merge'ować do main
Któreś FAIL → GitHub blokuje merge (branch protection rules)
```

**Dlaczego 3 osobne joby?** Równoległość — działają jednocześnie. Total: 33s (max), nie 87s (suma). Plus: jeśli linting failuje, widzisz to od razu bez czekania na testy.

### Dlaczego `--frozen-lockfile` w CI?

```bash
pnpm install --frozen-lockfile
```

Bez tego flagi `pnpm install` może zaktualizować `pnpm-lock.yaml` jeśli `package.json` się zmienił. W CI chcesz deterministycznych buildów — dokładnie te same wersje co w `lockfile`. `--frozen-lockfile` failuje jeśli lockfile jest nieaktualny, zamiast go cicho modyfikować.

---

## Filozofia: Fail Fast

Wzorzec przewija się przez cały projekt:

- **Env walidacja** → aplikacja nie startuje bez poprawnej konfiguracji
- **Zod** → błąd w schemie = błąd przy starcie, nie w runtime
- **CI** → kod failuje natychmiast, nie po wdrożeniu
- **Testcontainers** → testujesz prawdziwą bazę, nie fantazję
- **TypeScript** → błędy typów przy kompilacji, nie w przeglądarce klienta

Im wcześniej coś się popsuje, tym taniej naprawić. Bug w `env.ts` przy starcie = 5 sekund frustracji. Bug na produkcji o 3 w nocy = 5 godzin paniki i utrata danych.

---

## Pytania Sprawdzające Zrozumienie

Odpowiedz bez podglądania kodu — szukam modelu mentalnego, nie idealnej składni.

### Pytanie 1

Zamieniasz `throw new Error()` w `env.ts` na `process.exit(1)`. Aplikacja działa identycznie w produkcji. Podaj **dwie konkretne sytuacje**, w których ta zmiana powoduje problem (jeden techniczny, jeden organizacyjny dla zespołu).

### Pytanie 2

Kolega pisze test integracyjny dla `POST /tickets` z mockiem Prismy. Test jest zielony. Po deployu tickets nie zapisują się do bazy. Co konkretnie test "udawał" że sprawdza, a czego w rzeczywistości nie sprawdził? Wymień co najmniej **3 rzeczy**, które mogły się popsuć, a mock by tego nie wyłapał.

### Pytanie 3

Usuwasz singleton z `globalThis` i piszesz `export const prisma = new PrismaClient()`. Po godzinie kodowania z hot reloadem PostgreSQL crashuje z "too many connections". Wyjaśnij krok po kroku dlaczego — co dokładnie robi tsx watch, że stary PrismaClient nie znika?

### Pytanie 4

PM mówi "połącz 3 joby CI w jeden — będzie prościej." Daj **dwa konkretne argumenty techniczne z liczbami/przykładami** dlaczego osobne joby są lepsze.

### Pytanie 5

Frontend na porcie 5173 robi `fetch('/api/tickets')`. Backend na porcie 3000. Request nie dotrze. Wyjaśnij (a) dlaczego i (b) dwie opcje rozwiązania — jedna w Vite, jedna w Express — i której użyjesz **na produkcji** i dlaczego.

### Pytanie 6

W `app.ts` masz `app.use(express.json())`. Co się stanie, jeśli usuniesz tę linię i klient wyśle `POST /tickets` z body `{ "title": "Bug w logowaniu" }`? Opisz krok po kroku, co Express zrobi z requestem i co dostaniesz w `req.body` w handlerze.

### Pytanie 7

Twój schemat Prisma ma model `AIAnalysis` z polem `embedding Unsupported("vector(1536)")`. Wyjaśnij: (a) czym jest `vector(1536)` — co to za dane i dlaczego mają rozmiar 1536, (b) dlaczego Prisma nie wspiera tego natywnie i wymaga `Unsupported()`, (c) do jakiej funkcji w helpdesk to może służyć.

### Pytanie 8

Masz plik `server/src/env.ts`, który importujesz w `src/index.ts` i `src/lib/logger.ts`. Wyjaśnij: (a) ile razy Node.js wykona kod w `env.ts` i dlaczego, (b) co by się stało gdyby każdy import tworzył nową instancję — jak to wpłynęłoby na walidację i eksportowane `env`.

### Pytanie 9

Husky + lint-staged są skonfigurowane tak, że przy każdym `git commit` uruchamiają ESLint i Prettier na staging'owanych plikach. Deweloper A ma ESLint wyłączony w swoim edytorze. Wyjaśnij (a) co się stanie gdy zrobi `git commit` z kodem naruszającym reguły i (b) jak może ominąć ten mechanizm — i dlaczego CI jest ostatnią linią obrony.

### Pytanie 10

Zod schema dla `PORT` wygląda tak: `PORT: z.coerce.number().default(3000)`. Deweloper wpisuje w `.env` plik: `PORT=trzy_tysiące`. Opisz krok po kroku co Zod zrobi z tą wartością — przez `coerce`, przez `number()`, co zwróci `safeParse`, co trafi do `result.success` i czy aplikacja wystartuje.
