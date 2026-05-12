# Ścieżka nauki: QA → DEV

Materiał oparty na rzeczywistych decyzjach w tym projekcie. Każdy temat tłumaczy jeden koncept od zera — z przykładem kodu, opisem co się psuje i ćwiczeniem do samodzielnego wykonania.

**Omówione tematy:** wszystkie 10 pytań z pliku `01-architecture-explained.md`.

---

## Temat 1 — Dlaczego frontend nie może po prostu wywołać backendu

> _Pytanie 5: Frontend na porcie 5173 wywołuje `/api/tickets`. Backend jest na porcie 3000. Request nie dociera. Dlaczego?_

### Koncepcja prostymi słowami

Gdy przeglądarka wysyła request, sprawdza: _czy to idzie do tego samego miejsca, z którego pochodzi strona?_ Strona pochodzi z `localhost:5173`. API jest na `localhost:3000`. Inny port = inny "origin" w oczach przeglądarki.

Przeglądarki domyślnie blokują takie zapytania między różnymi originami. To się nazywa **CORS** — Cross-Origin Resource Sharing. To reguła bezpieczeństwa wbudowana w każdą przeglądarkę, która zapobiega sytuacji, w której złośliwa strona po cichu wywołuje API twojego banku w twoim imieniu.

Serwer musi explicite powiedzieć "tak, akceptuję requesty z tamtego originu" — inaczej przeglądarka odmawia zanim request w ogóle wyjedzie.

### Przykład kodu

```ts
// ❌ To się cicho wysypuje w przeglądarce — CORS zablokowany
fetch('http://localhost:3000/api/tickets')

// ✅ Opcja A — proxy w Vite (tylko dla devu)
// vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:3000'
  }
}
// Przeglądarka wywołuje localhost:5173/api/tickets
// Vite po cichu przekazuje to do localhost:3000/api/tickets
// Przeglądarka widzi jeden origin — zero problemu z CORS

// ✅ Opcja B — nagłówek CORS w Express (działa wszędzie)
// server/src/app.ts
import cors from 'cors'
app.use(cors({ origin: 'http://localhost:5173' }))
```

### Co się psuje, gdy zrobisz to źle

**Scenariusz:** Usuwasz proxy w Vite przed deployem, ale zapominasz dodać nagłówki CORS w Express.

Efekt: u ciebie na lokalnym devie wszystko działa (proxy Vite aktywne), ale na produkcji frontend dostaje `CORS policy: No 'Access-Control-Allow-Origin' header`. Użytkownicy widzą białą stronę, brak sensownego błędu w UI. To jeden z najczęstszych bugów "u mnie działa".

**Której opcji użyć na produkcji?**

Proxy Vite istnieje tylko w dev serwerze — znika po `pnpm build`. Na produkcji zbudowany frontend to folder ze statycznymi plikami serwowanymi przez nginx lub CDN. Vite tam nie istnieje. Dlatego:

- **Dev:** proxy Vite (zero konfiguracji na backendzie)
- **Produkcja:** nagłówki CORS w Express, albo jeszcze lepiej — serwuj frontend z tej samej domeny co API, żeby miały jeden origin i CORS w ogóle nie był problemem

### Ćwiczenie

Otwórz `client/vite.config.ts` i znajdź konfigurację proxy. Tymczasowo ją usuń i wywołaj `fetch('/api/health')` z konsoli przeglądarki pod adresem `localhost:5173`. Przeczytaj dokładny komunikat błędu. Potem przywróć proxy.

### Pytanie kontrolne

Jeśli użytkownik otwiera aplikację pod `https://helpdesk.example.com`, a API również jest pod `https://helpdesk.example.com/api` — czy potrzebujesz nagłówków CORS? Dlaczego tak lub nie?

---

## Temat 2 — Co się dzieje z body requesta, gdy zapomnisz parsera

> _Pytanie 6: Usuwasz `app.use(express.json())`. Klient wysyła `POST /tickets` z JSON body. Opisz krok po kroku co Express zrobi._

### Koncepcja prostymi słowami

HTTP to tekst lecący przez sieć. Gdy przeglądarka wysyła POST request, body dociera jako surowy strumień bajtów — Express nie ma pojęcia czy to JSON, formularz, plik czy losowe śmieci.

`express.json()` to middleware, które odczytuje ten surowy strumień, konwertuje go na obiekt JavaScript i zapisuje do `req.body`. Bez niego `req.body` jest po prostu `undefined`. Express nic nie parsuje automatycznie — musisz mu powiedzieć jakiego formatu się spodziewać.

Wyobraź sobie list w obcym języku. Koperta dociera (request), ale dopóki ktoś tego nie przetłumaczy (middleware), nie możesz odczytać treści.

### Przykład kodu

```ts
// Bez express.json()
app.post('/tickets', (req, res) => {
  console.log(req.body) // undefined
  const title = req.body.title // TypeError: Cannot read properties of undefined
})

// Z express.json()
app.use(express.json())

app.post('/tickets', (req, res) => {
  console.log(req.body) // { title: "Bug w logowaniu" }
  const title = req.body.title // "Bug w logowaniu" ✅
})
```

### Co się psuje, gdy zrobisz to źle

Krok po kroku gdy `express.json()` jest usunięte:

1. POST request dociera do Express z body `{ "title": "Bug w logowaniu" }`
2. Express pomija body w całości — brak parsera
3. `req.body` jest `undefined`
4. Handler próbuje odczytać `req.body.title` → JavaScript rzuca `TypeError: Cannot read properties of undefined (reading 'title')`
5. Jeśli masz try/catch, błąd trafia do error handlera i klient dostaje `500 Internal Server Error`
6. Jeśli nie masz try/catch, Express sam łapie unhandled rejection i też zwraca 500

Klient wysłał poprawny JSON. Serwer zwrócił 500. Żadnego pomocnego komunikatu. To typ buga trudnego do wykrycia, bo request _wygląda_ normalnie w network tabie przeglądarki.

### Ćwiczenie

Otwórz `server/src/app.ts`. Znajdź linię z `express.json()`. Tymczasowo zakomentuj ją i uruchom serwer. Użyj curl lub klienta REST:

```bash
curl -X POST http://localhost:3000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{"title": "test"}'
```

Przeczytaj odpowiedź. Potem odkomentuj linię i spróbuj znowu.

### Pytanie kontrolne

Co myślisz — co się dzieje gdy klient wysyła POST z `Content-Type: application/json`, ale body jest niepoprawnym JSON-em, np. `{ title: broken }`? Czy `express.json()` zaakceptuje to czy odrzuci?

---

## Temat 3 — Dlaczego kod pliku wykonuje się raz, nawet jeśli importujesz go z 10 miejsc

> _Pytanie 8: `env.ts` jest importowane w `index.ts` i `logger.ts`. Ile razy Node.js wykona kod w środku? Co by się stało, gdyby każdy import tworzył nową instancję?_

### Koncepcja prostymi słowami

Gdy Node.js po raz pierwszy napotka `import { env } from './env'`, wykonuje plik i zapisuje wynik w cache (coś jak tabela przeglądowa). Gdy inny plik zrobi ten sam import — Node pomija wykonanie pliku i zwraca zapisany wynik z cache.

Nazywa się to **module cache**. To jedna z najważniejszych rzeczy do zrozumienia w Node.js, bo wpływa na testowanie, zarządzanie stanem i wydajność.

Wyobraź sobie bibliotekę publiczną. Pierwsza osoba, która prosi o książkę, czeka aż bibliotekarz przyniesie ją z magazynu. Bibliotekarz kładzie kopię na ladzie. Każda kolejna osoba dostaje ją od razu — nikt nie wraca do magazynu.

### Przykład kodu

```ts
// env.ts
console.log('env.ts się uruchamia') // ile razy to zobaczysz?

const result = schema.safeParse(process.env)
if (!result.success) throw new Error('Niepoprawne zmienne środowiskowe')

export const env = result.data

// index.ts
import { env } from './env' // "env.ts się uruchamia" pojawia się raz

// logger.ts
import { env } from './env' // nic — zwracany jest wynik z cache

// Efekt: "env.ts się uruchamia" pojawia się dokładnie raz w logach
```

### Co się psuje, gdy zrobisz to źle

Gdyby module cache nie istniał (wyobraź sobie, że każdy import uruchamia plik od nowa):

**Problem 1 — Testy stają się nieprzewidywalne**

```ts
// Plik testowy stubuje zmienną dla jednego testu
vi.stubEnv('DATABASE_URL', 'postgresql://test')

// Ale env.ts już wcześniej się uruchomił zanim stub został ustawiony
// Wyeksportowany env.DATABASE_URL ma nadal starą wartość
// Twój stub nie wpływa na to, czego kod faktycznie używa
```

**Problem 2 — Rozbieżność konfiguracji**

```ts
// logger.ts dostaje env z DATABASE_URL = "postgresql://prod"
// app.ts — zaimportowane 50ms później — dostaje env z DATABASE_URL = "postgresql://test"
// (bo test przeszedł stub między tymi dwoma importami)
// Dwie części aplikacji używają teraz różnej konfiguracji
```

**Problem 3 — Marnowanie CPU przy każdym requeście** — walidacja Zod działa raz przy starcie. Bez cachowania działałaby przy każdym załadowaniu modułu, co może się zdarzać przy każdym hot reloadzie.

### Ćwiczenie

Dodaj `console.log('env.ts załadowany')` na górze `server/src/env.ts`. Uruchom serwer przez `pnpm dev`. Policz ile razy pojawia się w terminalu. Potem usuń tę linię.

### Pytanie kontrolne

Skoro module cache oznacza, że `env.ts` uruchamia się tylko raz, to co się dzieje w testach gdy chcesz przetestować, że `env.ts` rzuca błąd przy brakującej zmiennej? Jak testujesz coś, co jest już w cache?

---

## Temat 4 — Jak Zod obsługuje niepoprawne dane zanim aplikacja w ogóle wystartuje

> _Pytanie 10: Schema Zod ma `PORT: z.coerce.number().default(3000)`. Ktoś wpisuje w `.env` wartość `PORT=trzy_tysiące`. Opisz krok po kroku co Zod robi._

### Koncepcja prostymi słowami

**Zod** to biblioteka walidacji. Opisujesz kształt i typ danych, których oczekujesz, a Zod sprawdza czy rzeczywiste dane się zgadzają. Jeśli nie — dostajesz czytelny błąd zamiast tajemniczego crashu gdzieś głęboko w kodzie.

`z.coerce.number()` to sposób Zoda na obsługę faktu, że zmienne środowiskowe są zawsze stringami. `PORT=3000` w `.env` trafia do Node jako string `"3000"`, nie liczba `3000`. Koercja oznacza "spróbuj najpierw skonwertować, potem zwaliduj".

Wyobraź sobie formularz z polem "Wiek (tylko cyfry)". Gdy wpiszesz "dwadzieścia pięć", formularz nie zapisuje cicho `NaN` do bazy — podświetla pole na czerwono i mówi co jest nie tak, zanim wyślesz.

### Przykład kodu

```ts
const schema = z.object({
  PORT: z.coerce.number().default(3000),
})

// Przypadek 1: poprawny string z liczbą
schema.parse({ PORT: '3000' }) // → { PORT: 3000 } (liczba, nie string)

// Przypadek 2: brak wartości — default wchodzi w życie
schema.parse({}) // → { PORT: 3000 }

// Przypadek 3: string, którego nie da się skonwertować
schema.parse({ PORT: 'trzy_tysiące' })
// Number('trzy_tysiące') === NaN
// NaN nie jest poprawną liczbą → rzucony ZodError
```

### Co się psuje, gdy zrobisz to źle (krok po kroku)

Co faktycznie się dzieje gdy w `.env` jest `PORT=trzy_tysiące`:

1. Node czyta `.env` → `process.env.PORT = "trzy_tysiące"` (zawsze string)
2. `coerce` w Zodzie uruchamia `Number("trzy_tysiące")` → `NaN`
3. Walidator `number()` sprawdza: czy `NaN` jest skończoną liczbą? Nie → walidacja failuje
4. `.default(3000)` jest sprawdzane — ale default działa tylko gdy wartość jest `undefined`. Wartość istnieje, jest tylko niepoprawna. Default nie ratuje sytuacji.
5. `safeParse` zwraca:

```ts
{
  success: false,
  error: ZodError {
    issues: [{ path: ['PORT'], message: 'Expected number, received nan' }]
  }
}
```

6. Kod w `env.ts` widzi `result.success === false`, rzuca `new Error('Niepoprawne zmienne środowiskowe')`
7. Aplikacja nigdy nie dochodzi do `app.listen()` — crashuje przy starcie z czytelnym komunikatem wskazującym na `PORT`

To wzorzec **fail fast**: crashuj natychmiast z czytelnym błędem zamiast startować i wysypywać się tajemniczo przy pierwszym requeście próbującym użyć `process.env.PORT` jako liczby.

### Ćwiczenie

Otwórz `server/src/env.ts` i znajdź linię ze schematem dla `PORT`. Tymczasowo dodaj `console.log` żeby wypisać `result` przed sprawdzeniem success. Ustaw `PORT=abc` w `.env` i uruchom `pnpm --filter server dev`. Przeczytaj co faktycznie zwraca Zod. Potem napraw `.env` i usuń log.

### Pytanie kontrolne

Schema ma `.default(3000)`. Jaką wartość ma `env.PORT` gdy całkowicie usuniesz linię `PORT` z `.env` — i dlaczego? Co by się stało bez `.default(3000)`?

---

## Temat 5 — Dlaczego `throw` jest lepsze niż `process.exit`

> _Pytanie 1: Zamieniasz `throw new Error()` w `env.ts` na `process.exit(1)`. Aplikacja działa tak samo w produkcji. Podaj dwie sytuacje, w których ta zmiana powoduje problem._

### Koncepcja prostymi słowami

`process.exit(1)` to atomowa bomba — natychmiast zabija cały proces Node.js. Nie ma odwołania, nie ma czasu na posprzątanie.

`throw new Error()` to rzucenie wyjątku — błąd "leci w górę" przez kod i może zostać złapany przez `try/catch`. Jeśli nikt go nie złapie, aplikacja i tak crashuje — ale po drodze masz szansę zareagować.

W produkcji oba kończą się tak samo: aplikacja umiera. Różnica wychodzi w testach i przy debugowaniu.

### Przykład kodu

```ts
// ❌ process.exit — niemożliwe do testowania
function loadEnv() {
  const result = schema.safeParse(process.env)
  if (!result.success) process.exit(1) // zabija proces Vitest
}

// Test który nigdy nie przejdzie:
expect(() => loadEnv()).toThrow() // proces jest martwy zanim assertion się wykona

// ✅ throw — w pełni testowalny
function loadEnv() {
  const result = schema.safeParse(process.env)
  if (!result.success) throw new Error('Niepoprawne zmienne środowiskowe')
}

// Test działa:
expect(() => loadEnv()).toThrow('Niepoprawne zmienne środowiskowe') // ✅
```

### Co się psuje, gdy zrobisz to źle

**Problem 1 — testy:**
`process.exit(1)` zabija proces Vitest. Cały suite testów crashuje bez żadnego komunikatu o błędzie. Widzisz tylko `Exit status 1` w terminalu i nie masz pojęcia który test to spowodował.

**Problem 2 — debugowanie:**
`throw new Error()` produkuje stack trace z numerem linii, opisem i ścieżką przez kod. `process.exit(1)` produkuje tylko `Exited with code 1`. Nowy deweloper w zespole spędza godzinę szukając gdzie aplikacja umiera, zamiast od razu zobaczyć: `Error: Invalid env at env.ts:12`.

### Ćwiczenie

Otwórz `server/src/env.ts` i znajdź linię z `throw new Error(...)`. Tymczasowo zamień na `process.exit(1)`. Uruchom testy: `pnpm --filter server test`. Przeczytaj co się stało z procesem testowym. Potem przywróć `throw`.

### Pytanie kontrolne

Czy jest jakaś sytuacja, w której `process.exit(1)` byłoby właściwym wyborem zamiast `throw`? Podaj przykład.

---

## Temat 6 — Czego nie sprawdza mock bazy danych

> _Pytanie 2: Kolega pisze test z mockiem Prismy. Test zielony. Po deployu tickety nie zapisują się do bazy. Co mock przeoczył?_

### Koncepcja prostymi słowami

Mock to podróbka. Zamiast prawdziwej bazy danych tworzysz obiekt, który "udaje" Prismę i zwraca to co mu każesz. Test sprawdza czy Twój kod wywołał mock z właściwymi argumentami — ale nie sprawdza czy prawdziwa baza w ogóle przyjęłaby te dane.

To jak testowanie kierowcy na symulatorze, który nigdy nie opada paliwo i zawsze ma dobrą pogodę. Symulator zdany — ale pierwsza prawdziwa jazda może być niespodzianką.

### Przykład kodu

```ts
// ❌ Test z mockiem — zawsze zielony
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    ticket: {
      create: vi.fn().mockResolvedValue({ id: '1', title: 'Test' }),
    },
  })),
}))

it('tworzy ticket', async () => {
  const ticket = await createTicket({ title: 'Test', userId: 'abc' })
  expect(ticket.id).toBe('1') // ✅ zielony — ale co to sprawdza?
})

// ✅ Test z testcontainers — testuje prawdziwą bazę
it('tworzy ticket w realnej bazie', async () => {
  const ticket = await createTicket({ title: 'Test', userId: user.id })
  const fromDb = await prisma.ticket.findUnique({ where: { id: ticket.id } })
  expect(fromDb?.title).toBe('Test') // ✅ zapisało się naprawdę
})
```

### Co się psuje, gdy zrobisz to źle

Trzy rzeczy, których mock nie sprawdza:

**1. Błędy w migracjach** — migracja mogła dodać kolumnę `NOT NULL` bez wartości domyślnej. Mock przyjmie insert bez tej kolumny. Prawdziwa baza odrzuci z błędem `null value in column violates not-null constraint`.

**2. Unique constraints** — jeśli schema ma `@@unique([userId, ticketNumber])`, mock zwróci sukces przy każdym wywołaniu. Prawdziwa baza odrzuci drugi insert z tym samym userId+ticketNumber błędem `P2002 Unique constraint failed`.

**3. Niezgodne nazwy pól** — piszesz `{ authorId: userId }` ale schema ma pole `createdById`. Mock zaakceptuje wszystko. Prisma client w runtime rzuci błąd albo TypeScript złapie to przy kompilacji — ale test z mockiem nie widzi ani jednego.

### Ćwiczenie

Otwórz `server/src/db.test.ts`. Przeczytaj jak testcontainers startuje bazę i jak migracje są aplikowane przed testami. Spróbuj dodać nowy prosty test, który zapisuje i odczytuje rekord.

### Pytanie kontrolne

Mocki są szybsze (100ms vs 5s na start kontenera). Czy jest sytuacja, w której mock Prismy byłby jednak właściwym wyborem? Kiedy szybkość ważniejsza jest niż realizm?

---

## Temat 7 — Dlaczego hot reload zabija bazę danych

> _Pytanie 3: Usuwasz singleton z `globalThis`. Po godzinie kodowania PostgreSQL crashuje z "too many connections". Dlaczego?_

### Koncepcja prostymi słowami

`tsx watch` obserwuje pliki i restartuje moduły gdy je zmieniasz. Ale "restartowanie modułów" to nie to samo co restartowanie całego procesu Node.js.

Wyobraź sobie sklep, który co godzinę wymienia kasjerów (moduły), ale budynek pozostaje ten sam (proces). Jeśli każdy nowy kasjer otwiera nowe konto bankowe (połączenie do bazy) bez zamykania starego — po jakimś czasie masz 500 otwartych kont bez właściciela.

`PrismaClient` przy tworzeniu otwiera **connection pool** — zazwyczaj 10 połączeń do bazy. PostgreSQL ma limit (domyślnie 100). Jeśli tworzysz nowy `PrismaClient` przy każdym przeładowaniu modułu, szybko go przekroczysz.

### Przykład kodu

```ts
// ❌ Bez singletona — każde przeładowanie tworzy nowe połączenia
export const prisma = new PrismaClient() // 10 nowych połączeń przy każdym zapisie pliku

// Po 15 przeładowaniach: 15 × 10 = 150 połączeń → PostgreSQL crashuje

// ✅ Z singletonem na globalThis
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma // zapisz do globalThis żeby przeżył reload
}
// Pierwsze załadowanie: tworzy PrismaClient i zapisuje w globalThis
// Każde kolejne: znajduje istniejący w globalThis, nie tworzy nowego
```

### Co się psuje, gdy zrobisz to źle

Krok po kroku przy hot reloadzie bez singletona:

1. Zapisujesz plik → `tsx watch` usuwa `db.ts` z cache modułów
2. Następny import `db.ts` wykonuje `new PrismaClient()` → otwiera 10 połączeń
3. Stara instancja `PrismaClient` wisi w pamięci — inne moduły mogą ją trzymać przez referencję
4. Garbage collector nie może jej zebrać, połączenia nie są zamykane
5. Po 10 przeładowaniach: 100 otwartych połączeń → PostgreSQL odrzuca nowe
6. Efekt: `Error: too many clients already` przy pierwszym requeście do bazy

W produkcji ten problem nie istnieje — serwer startuje raz, nie ma hot reloadu. Dlatego singleton zapisujemy do `globalThis` tylko gdy `NODE_ENV !== 'production'`.

### Ćwiczenie

Otwórz `server/src/db.ts`. Przeczytaj jak wygląda singleton. Sprawdź co jest w `globalThis` w trakcie działania — dodaj `console.log(Object.keys(globalThis))` tymczasowo i uruchom serwer. Potem usuń log.

### Pytanie kontrolne

W produkcji nie używamy `globalThis`. Co chroni nas przed "too many connections" na produkcji, skoro serwer może obsługiwać tysiące równoczesnych requestów?

---

## Temat 8 — Dlaczego CI ma trzy osobne joby zamiast jednego

> _Pytanie 4: PM mówi "połącz 3 joby CI w jeden — będzie prościej". Podaj dwa argumenty techniczne z liczbami._

### Koncepcja prostymi słowami

CI (Continuous Integration) to zautomatyzowany sprawdzian który uruchamia się po każdym pushu. Nasz CI ma 3 joby: lint, typecheck, testy.

Joby w GitHub Actions mogą działać **równolegle** — każdy na osobnej maszynie jednocześnie. To jak trzy osoby sprawdzające różne rzeczy w tym samym czasie, zamiast jedna sprawdzająca wszystko po kolei.

Gdybyś połączył je w jeden job, musiałyby wykonywać się sekwencyjnie — jedna za drugą.

### Przykład kodu

```yaml
# ❌ Jeden job — sekwencyjny
jobs:
  ci:
    steps:
      - run: pnpm lint      # 31s
      - run: pnpm typecheck # 23s — startuje dopiero po lincie
      - run: pnpm test      # 33s — startuje dopiero po typechecku
    # Total: 31 + 23 + 33 = 87 sekund

# ✅ Trzy joby — równoległe
jobs:
  lint:
    steps:
      - run: pnpm lint      # 31s — startuje od razu
  typecheck:
    steps:
      - run: pnpm typecheck # 23s — startuje od razu, równolegle
  test:
    steps:
      - run: pnpm test      # 33s — startuje od razu, równolegle
    # Total: max(31, 23, 33) = 33 sekundy
```

### Co się psuje, gdy zrobisz to źle

**Argument 1 — czas:**
Przy 3 osobnych jobach całość trwa 33s (najwolniejszy job). Przy 1 łączonym jobie trwa 87s. Przy 20 commitach dziennie w zespole: 20 × 54s różnicy = **18 minut dziennie zmarnowane na czekanie**.

**Argument 2 — feedback:**
Jeśli lint failuje po 31s w osobnym jobie, deweloper wie od razu co naprawić, a testy nadal działają równolegle w tle. Przy jednym sekwencyjnym jobie: lint failuje po 31s i dopiero wtedy wiesz — ale zmarnowałeś te 31s zanim cokolwiek zobaczyłeś, a testy w ogóle nie zdążyły ruszyć.

Przykład praktyczny: popychasz commit z literówką w ESLint. W osobnych jobach: lint czerwony po 31s, reszta nadal biegnie. W jednym jobie: czekasz 31s na wynik linta, który failuje, a testy nawet nie wystartowały.

### Ćwiczenie

Otwórz `.github/workflows/ci.yml`. Policz ile ma jobów i jakie są ich nazwy. Sprawdź czy joby mają `needs:` — to oznacza że jeden czeka na drugi. Zastanów się dlaczego deploy job (jeśli kiedyś będzie) powinien mieć `needs: [lint, typecheck, test]`.

### Pytanie kontrolne

Mamy 3 joby działające równolegle i każdy robi `pnpm install`. Czy to nie marnuje czasu? Jak mógłbyś to zoptymalizować?

---

## Temat 9 — Czym są wektory i dlaczego Prisma ich nie obsługuje

> _Pytanie 7: `embedding Unsupported("vector(1536)")` w schemacie Prismy. Czym jest `vector(1536)`, dlaczego `Unsupported()`, do czego to służy?_

### Koncepcja prostymi słowami

Wyobraź sobie, że chcesz porównać dwa zdania pod względem znaczenia — nie słów, ale sensu. "Mój komputer się zawiesił" i "laptop przestał działać" znaczą to samo, ale nie mają żadnych wspólnych słów.

**Embedding** to sposób na zamianę tekstu na listę liczb, gdzie podobne znaczeniowo teksty dają podobne listy. Model AI (np. Claude lub OpenAI) przetwarza zdanie i produkuje tablicę 1536 liczb — każda liczba opisuje jeden "wymiar" znaczenia.

`vector(1536)` to typ danych PostgreSQL (dodany przez rozszerzenie `pgvector`) który przechowuje taką tablicę i umożliwia szybkie wyszukiwanie podobnych wektorów.

### Przykład kodu

```ts
// Embedding to tablica 1536 liczb wyglądająca mniej więcej tak:
const embedding = [0.023, -0.451, 0.891, 0.002, -0.334, ...] // 1536 wartości

// Zapis do bazy (przez raw query, bo Prisma nie obsługuje vector natywnie)
await prisma.$executeRaw`
  UPDATE tickets
  SET embedding = ${embedding}::vector
  WHERE id = ${ticketId}
`

// Wyszukiwanie podobnych ticketów (operator <-> to odległość wektorowa)
const similar = await prisma.$queryRaw`
  SELECT id, subject
  FROM tickets
  ORDER BY embedding <-> ${queryEmbedding}::vector
  LIMIT 5
`
```

### Co się psuje, gdy zrobisz to źle

**Dlaczego `Unsupported()` zamiast normalnego typu:**
`vector` to typ dodany przez rozszerzenie `pgvector` — nie jest częścią standardowego PostgreSQL. Prisma nie zna tego typu i nie umie go obsłużyć automatycznie.

Gdybyś napisał po prostu `embedding Float[]` (tablica floatów), Prisma by to zaakceptowała, ale:

- Straciłbyś specjalne operatory pgvector (`<->`, `<=>`) do wyszukiwania podobieństwa
- Wyszukiwanie podobieństwa byłoby niemożliwe lub bardzo wolne
- Indeksy wektorowe (HNSW, IVFFlat) nie działałyby

`Unsupported()` mówi Prismie: "wiem że to pole istnieje w bazie, nie generuj dla niego kodu TypeScript, obsłużę to sam przez `$queryRaw`."

### Ćwiczenie

Otwórz `server/prisma/schema.prisma`. Znajdź pole z `Unsupported`. Przeczytaj cały model — do czego należy, jakie inne pola ma obok? Zastanów się: kiedy w helpdesk generowałbyś embedding — przy tworzeniu ticketu, czy później?

### Pytanie kontrolne

Dlaczego indeks na kolumnie wektorowej jest ważny? Co się stanie z wydajnością wyszukiwania bez indeksu gdy masz 100 000 ticketów?

---

## Temat 10 — Jak git hook pilnuje jakości kodu za każdego dewelopera

> _Pytanie 9: Husky + lint-staged. Deweloper ma ESLint wyłączony w edytorze. Co się stanie przy `git commit`? Jak może to ominąć?_

### Koncepcja prostymi słowami

**Git hooks** to skrypty, które git uruchamia automatycznie przy określonych zdarzeniach — np. przed stworzeniem commita (`pre-commit`). Husky upraszcza zarządzanie tymi skryptami.

**lint-staged** uruchamia ESLint i Prettier tylko na plikach które aktualnie dodajesz do commita — nie na całym projekcie. Dzięki temu sprawdzenie trwa sekundy, nie minuty.

Klucz: git hook działa niezależnie od edytora. Nie interesuje go czy masz ESLint w VS Code włączony czy nie. Hook to skrypt w terminalu — odpala się zawsze.

### Przykład kodu

```bash
# Co się dzieje przy git commit:

# 1. git przygotowuje commit
# 2. Przed zapisaniem wywołuje .husky/pre-commit
# 3. pre-commit wywołuje lint-staged
# 4. lint-staged uruchamia: prettier --write + eslint --max-warnings 0
#    tylko na plikach w staging area

# Jeśli eslint znajdzie błąd:
# ❌ lint-staged kończy z exit code != 0
# ❌ Husky blokuje commit
# ❌ Widzisz w terminalu: "ESLint: 'foo' is defined but never used."
# ❌ Commit NIE zostaje stworzony

# Jak ominąć (każdy może to zrobić):
git commit --no-verify -m "szybki fix"
# --no-verify pomija WSZYSTKIE hooki
```

### Co się psuje, gdy zrobisz to źle

**Co się dzieje bez Husky:**
Deweloper z wyłączonym ESLint pushuje kod który łamie reguły. Inni dostają błędy w swoich edytorach. Cały team traci czas na debugowanie cudzych literówek i niezgodności formatowania.

**Dlaczego `--no-verify` istnieje i dlaczego CI jest ostatnią linią obrony:**
Hooki to konwencja — każdy z dostępem do repozytorium może użyć `--no-verify`. To jak zamek w drzwiach: chroni przed przypadkowymi błędami, ale nie przed kimś kto świadomie chce go ominąć.

CI (GitHub Actions) uruchamia się na serwerze GitHub, poza kontrolą dewelopera. Tam nie ma opcji `--no-verify`. Jeśli kod łamie reguły — CI failuje i PR nie może być zmergowany do maina. Branch protection rules wymuszają to na poziomie repozytorium, nie lokalnego środowiska.

Husky = szybki feedback lokalnie. CI = jedyne prawdziwe wymuszenie.

### Ćwiczenie

Otwórz `.husky/pre-commit`. Przeczytaj co robi ten skrypt. Następnie sprawdź konfigurację `lint-staged` w głównym `package.json` — jakie pliki sprawdza i jakimi narzędziami. Spróbuj napisać w dowolnym pliku `.ts` `const x = 1` bez użycia zmiennej i zrób `git add` + `git commit`. Przeczytaj komunikat błędu.

### Pytanie kontrolne

Prettier i ESLint w lint-staged działają tylko na plikach w staging area. Co to oznacza? Jeśli masz 200 plików w projekcie ale commitusz tylko jeden — ile plików zostanie sprawdzone?
