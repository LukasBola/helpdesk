# Odpowiedzi — Architektura Helpdesk

Odpowiedzi do pytań z `01-architecture-explained.md`.

---

## Pytanie 1

> Zamieniasz `throw new Error()` w `env.ts` na `process.exit(1)`. Aplikacja działa identycznie w produkcji. Podaj dwie konkretne sytuacje, w których ta zmiana powoduje problem.

**Problem techniczny — testy:**
`process.exit(1)` zabija proces testowy Vitest. Test:

```javascript
expect(() => importEnv()).toThrow('Invalid environment variables')
```

nie ma szansy złapać wyjątku — proces jest martwy zanim assertion się wykona. Cały suite testów crashuje bez żadnego sensownego komunikatu.

**Problem organizacyjny — debugowanie:**
`throw new Error()` produkuje stack trace z numerem linii i opisem. `process.exit(1)` produkuje tylko `$ Exited with code 1` w logach. Nowy deweloper w zespole, który nie zna projektu, nie ma pojęcia dlaczego aplikacja umarła — musi sam szukać miejsca walidacji.

---

## Pytanie 2

> Kolega pisze test z mockiem Prismy. Test zielony. Po deployu tickets nie zapisują się. Co mock nie sprawdził?

**Trzy rzeczy, których mock nie sprawdził:**

1. **Poprawność migracji** — mock nie uruchamia bazy. Migracja mogła mieć błąd SQL (np. `NOT NULL` bez `DEFAULT` na istniejących rekordach), który wykryłby się dopiero przy próbie zapisu do realnej bazy.

2. **Unique constraint** — jeśli schema ma `@@unique([userId, title])`, mock zwróci sukces przy każdym wywołaniu. Realna baza odrzuci drugi insert z tym samym userId i title z błędem `P2002 Unique constraint failed`.

3. **Niezgodność nazw pól** — jeśli w kodzie piszesz `prisma.ticket.create({ data: { authorId: userId } })` ale schema ma `createdById`, mock zaakceptuje wszystko. Realny Prisma client rzuci błąd typów w runtime lub TypeScript złapie to przy kompilacji — ale mock tego nie widzi.

Bonus (4): **Transakcje** — mock nie testuje czy operacja wewnątrz `prisma.$transaction()` faktycznie robi rollback przy błędzie.

---

## Pytanie 3

> Usuwasz singleton z globalThis. Po godzinie hot reloadu PostgreSQL crashuje z "too many connections". Dlaczego?

Krok po kroku:

1. `tsx watch` obserwuje system plików. Gdy zapisujesz `.ts`, tsx **restartuje moduły** — ale nie cały proces Node.js. Proces żyje dalej.

2. Moduł `db.ts` jest usuwany z cache modułów Node.js i ładowany od nowa.

3. Przy ponownym załadowaniu wykonuje się `export const prisma = new PrismaClient()` — tworzy nową instancję, która otwiera **connection pool** (domyślnie 10 połączeń do DB).

4. Stara instancja `PrismaClient` nadal istnieje w pamięci — inne moduły mogły trzymać do niej referencje. Garbage Collector nie może jej zebrać natychmiast. Połączenia do DB nie są zamykane.

5. Po 50 przeładowaniach: 50 × 10 = **500 otwartych połączeń**. PostgreSQL domyślnie akceptuje max 100. Crash.

**Dlaczego `globalThis` to rozwiązuje?** `globalThis` nie jest resettowany przy hot reload modułów — to globalny obiekt procesu. Singleton sprawdza `globalForPrisma.prisma ?? new PrismaClient()` — jeśli już istnieje, używa starego, nie tworzy nowego.

---

## Pytanie 4

> PM: "połącz 3 joby CI w jeden". Dwa argumenty techniczne z liczbami.

**Argument 1 — Czas wykonania:**
Joby działają **równolegle** na osobnych maszynach. Czasy: lint 31s, typecheck 23s, testy 33s.

- 3 osobne joby: total = max(31, 23, 33) = **33 sekundy**
- 1 wspólny job: total = 31 + 23 + 33 = **87 sekund**

Przy 20 commitach dziennie w zespole: 20 × 54s = **18 minut dziennie zmarnowane na czekanie**.

**Argument 2 — Fast feedback loop:**
Przy oddzielnych jobach lint failuje w 31s — deweloper dostaje feedback natychmiast i poprawia. Testy jeszcze działają w tle (33s), ale już wiesz co naprawić.

Przy jednym jobie sekwencyjnym: lint startuje, trwa 31s, potem typecheck 23s, potem testy 33s. Jeśli lint failuje po 31s, zmarnowałeś 0s na testy — ale informacja o błędzie lintingu dotarła dopiero po 31s i dopiero wtedy możesz działać. Gorszy UX.

---

## Pytanie 5

> Frontend port 5173, backend port 3000. `fetch('/api/tickets')` nie działa. Dlaczego i jak naprawić?

**(a) Dlaczego nie działa:**
`fetch('/api/tickets')` jest **relative URL** — przeglądarka robi request do `http://localhost:5173/api/tickets` (ten sam origin co strona). Vite dev server nie zna żadnego `/api/tickets` i zwróci 404. Request nigdy nie trafi do Express na porcie 3000.

Dodatkowo: nawet gdyby użyć `fetch('http://localhost:3000/api/tickets')`, przeglądarka zablokuje request przez **CORS** — origin `5173` próbuje odpytać serwer na `3000`, a Express nie wysyła nagłówka `Access-Control-Allow-Origin`.

**(b) Dwie opcje:**

**Opcja 1 — Vite proxy (dev only):**

```javascript
// vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:3000'
  }
}
```

Vite przechwytuje requesty do `/api/*` i forwarduje do backendu. Przeglądarka widzi jeden origin (5173) — brak problemu CORS. Działa **tylko w dev**.

**Opcja 2 — CORS middleware w Express (produkcja):**

```javascript
import cors from 'cors'
app.use(cors({ origin: process.env.CLIENT_URL }))
```

Express dodaje nagłówki CORS do odpowiedzi. Frontend może teraz robić requesty cross-origin.

**Na produkcji używasz opcji 2** (lub jeszcze lepiej: serwujesz built frontend z tego samego serwera/domeny co API — zero problemu CORS, bo same-origin). Vite proxy istnieje tylko w dev — w produkcji Vite nie istnieje.

---

## Pytanie 6

> Usuwasz `app.use(express.json())`. Klient wysyła `POST /tickets` z JSON body. Co się stanie?

Krok po kroku:

1. Request dociera do Express.
2. Express nie ma parsera body — `req.body` jest `undefined`.
3. Handler próbuje odczytać `req.body.title` → JavaScript: `Cannot read properties of undefined (reading 'title')`.
4. To rzuca `TypeError` — błąd trafia do Express error handler (przez `next(err)` jeśli masz try/catch, lub Express łapie go automatycznie w async handlers).
5. Error handler zwraca `500 Internal Server Error`.

Szczegół: Express nie parsuje body automatycznie. `express.json()` to middleware, które odczytuje surowy Buffer z requesta, deserializuje JSON i zapisuje do `req.body`. Bez niego `req.body` jest `undefined` niezależnie od tego co wysłał klient.

Alternatywnie: możesz użyć `express.urlencoded({ extended: true })` dla formularzy HTML (body jako `key=value&key2=value2`), ale do REST API z JSON potrzebujesz `express.json()`.

---

## Pytanie 7

> `embedding Unsupported("vector(1536)")` — czym jest, dlaczego Unsupported(), do czego służy?

**(a) Czym jest `vector(1536)`:**
To **embedding wektorowy** — reprezentacja numeryczna tekstu jako tablica 1536 liczb zmiennoprzecinkowych. Każda liczba opisuje jeden "wymiar" znaczenia tekstu. Podobne teksty mają podobne wektory (małą odległość cosinus). `1536` to rozmiar wektorów generowanych przez model OpenAI `text-embedding-ada-002` / `text-embedding-3-small`.

Przykład: zdanie "mój komputer się zawiesił" i "laptop przestał działać" mają wektory, których cosine similarity wynosi ~0.92. Zdanie "przepis na ciasto" miałoby ~0.15.

**(b) Dlaczego `Unsupported()`:**
`vector` to typ dodany przez rozszerzenie pgvector — nie jest częścią standardowego PostgreSQL. Prisma nie zna tego typu, nie potrafi go wygenerować ani zarządzać nim automatycznie. `Unsupported()` mówi Prismie: "wiem że to pole istnieje, ale nie generuj dla niego kodu TypeScript — obsłużę to ręcznie przez raw queries (`$queryRaw`)."

**(c) Do czego służy w helpdesk:**
Semantic search po ticketach — zamiast szukać po słowach kluczowych (`LIKE '%crashed%'`), wyszukujesz po znaczeniu. "Znajdź tickety podobne do tego opisu" → generujesz embedding opisu → szukasz w bazie wektorów najbliższych sąsiadów (`<->` operator pgvector). AI może automatycznie grupować podobne zgłoszenia, sugerować rozwiązania na podstawie historycznych ticketów, wykrywać duplikaty.

---

## Pytanie 8

> Ile razy Node.js wykona kod w `env.ts`? Co by się stało gdyby każdy import tworzył nową instancję?

**(a) Ile razy:**
**Jeden raz.** Node.js cache'uje moduły — pierwszy `import` wykonuje kod i zapisuje eksporty w cache. Każdy kolejny `import { env } from './env'` zwraca **tę samą referencję** z cache, nie wykonuje kodu ponownie. To jest fundamentalna cecha systemu modułów Node.js (zarówno CommonJS jak i ESM).

**(b) Co by się stało bez cache'owania:**
Każdy import `env.ts` uruchamiałby `schema.safeParse(process.env)` od nowa:

- **Problem walidacji:** jeśli w teście stubbujesz `process.env.DATABASE_URL`, ale `env` jest już zaimportowane gdzie indziej z poprzedniej instancji — różne części kodu mają różne wartości `env`. Stan się rozjeżdża.
- **Problem wydajności:** walidacja Zod to praca CPU. 50 importów w różnych plikach = 50 wywołań walidacji przy każdym uruchomieniu.
- **Problem tożsamości:** `import { env } from './env'` w `logger.ts` i w `app.ts` dałoby dwa różne obiekty. Zmiana jednego nie wpłynęłaby na drugi. Trudne do debugowania.

---

## Pytanie 9

> Husky + lint-staged. Deweloper A ma ESLint wyłączony w edytorze. Co się stanie przy `git commit`? Jak może ominąć?

**(a) Co się stanie:**
Husky rejestruje git hook `pre-commit`. Gdy deweloper A robi `git commit`, git automatycznie uruchamia hook przed stworzeniem commita. Hook wywołuje lint-staged, który uruchamia ESLint i Prettier na staging'owanych plikach. Jeśli ESLint znajdzie naruszenie reguł:

- lint-staged wychodzi z kodem != 0
- Husky blokuje commit
- Deweloper widzi w terminalu listę błędów ESLint
- Commit **nie zostaje stworzony**

To działa niezależnie od ustawień edytora — ESLint uruchamia się przez terminal, nie przez plugin VS Code.

**(b) Jak ominąć:**

```bash
git commit --no-verify -m "message"
```

Flaga `--no-verify` pomija wszystkie git hooks (pre-commit, commit-msg, etc.). Każdy z dostępem do repozytorium może to zrobić — hooks to konwencja, nie wymuszenie.

**Dlaczego CI jest ostatnią linią obrony:**
CI uruchamia się na serwerze GitHub, poza kontrolą dewelopera. Nie można tam użyć `--no-verify`. Jeśli kod narusza reguły, CI failuje i PR nie może być merge'owany do maina (branch protection). Husky to wygodna ochrona lokalna (szybki feedback), ale CI to jedyne wymuszenie, którego nie można obejść bez uprawnień admina.

---

## Pytanie 10

> `PORT: z.coerce.number().default(3000)`. W `.env`: `PORT=trzy_tysiące`. Co zrobi Zod?

Krok po kroku przez pipeline Zod:

1. **`process.env.PORT`** = string `"trzy_tysiące"`

2. **`z.coerce.number()`** — `coerce` konwertuje wartość używając `Number()`:

   ```javascript
   Number('trzy_tysiące') === NaN
   ```

3. **`number()` validator** — sprawdza czy wynik jest skończoną liczbą. `NaN` nie jest skończoną liczbą → **walidacja failuje**.

4. **`.default(3000)`** — default stosuje się tylko gdy wartość jest `undefined`. Tutaj wartość istnieje (`"trzy_tysiące"`), tylko jest niepoprawna. Default **nie ratuje** sytuacji.

5. **`safeParse` zwraca:**

   ```javascript
   {
     success: false,
     error: ZodError {
       issues: [{ code: 'invalid_type', path: ['PORT'], message: 'Expected number, received nan' }]
     }
   }
   ```

6. **`result.success` = `false`** → kod w `env.ts` wykonuje:

   ```javascript
   throw new Error('Invalid environment variables')
   ```

7. **Aplikacja NIE startuje.** W logach widzisz:
   ```
   Invalid environment variables:
   { PORT: ['Expected number, received nan'] }
   Error: Invalid environment variables
   ```

**Wniosek:** `z.coerce.number()` obsługuje `"3000"` (string cyfr) → `3000` (number). Nie obsługuje losowych stringów. To celowe — Zod nie zgaduje intencji.
