# Odpowiedzi — Inbound Email → Ticket Creation (Plan 03)

Pytania i odpowiedzi dotyczące implementacji pipeline'u email z PR #6.

---

## Pytanie 1

> Dlaczego webhook Postmarka zwraca natychmiastowe `200 OK` i enqueue'uje job, zamiast od razu tworzyć ticket w bazie synchronicznie?

**Trzy powody, dla których asynchroniczna kolejka jest właściwym wyborem:**

**(a) Postmark oczekuje szybkiej odpowiedzi.**
Postmark wysyła webhook z timeoutem — jeśli serwer nie odpowie w ciągu kilku sekund, Postmark uznaje dostarczenie za nieudane i retryuje. Tworzenie ticketu wymaga zapisu do Postgresa i potencjalnie dalszych operacji (AI summarization, powiadomienia). Gdybyśmy to robili synchronicznie podczas handlowania webhookiem, ryzykujemy timeout i duplikaty z retry Postmarka.

**(b) Odporność na awarie bazy.**
Jeśli Postgres jest chwilowo niedostępny, synchroniczne podejście zwróciłoby `500` — a Postmark straciłby email (albo retrynąłby z duplikatem). Z kolejką: webhook zwraca `200`, job czeka w `pgboss` aż baza wróci, retry jest zarządzany przez kolejkę.

**(c) Separacja odpowiedzialności.**
Webhook route robi jedno: walidacja + enqueue. Worker robi drugie: parsing + zapis. Każdy element testuje się niezależnie — webhook test mockuje kolejkę, worker test używa prawdziwej bazy.

```
Postmark → POST /api/webhooks/postmark → 200 OK (natychmiast)
                    ↓
              queue.send()  ←  pg-boss zapisuje job w Postgresie
                    ↓
           [worker polling co ~2s]
                    ↓
          prisma.ticket.create()
```

---

## Pytanie 2

> Wyjaśnij krok po kroku jak działa mechanizm `startPromise` w singletonie pg-boss. Jaki race condition blokuje?

```typescript
let boss: PgBoss | null = null
let startPromise: Promise<PgBoss> | null = null

export async function getQueue(): Promise<PgBoss> {
  if (!startPromise) {
    startPromise = (async () => {
      boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' })
      await boss.start()
      return boss
    })()
  }
  return startPromise
}
```

**Race condition bez `startPromise`:**
`boss.start()` to operacja asynchroniczna (łączy się z Postgresem, tworzy schemat `pgboss`). Gdybyś używał tylko `let boss: PgBoss | null`:

1. Request A wywołuje `getQueue()` → `boss === null` → tworzy nową instancję, zaczyna `await boss.start()`
2. Zanim A skończy, request B wywołuje `getQueue()` → `boss` nadal `null` → tworzy **drugą** instancję, zaczyna drugi `boss.start()`
3. Teraz masz dwie instancje PgBoss połączone z tą samą bazą — dwie sesje PostgreSQL, dwie listy workerów, potencjalne konflikty w tablicach `pgboss.job` i `pgboss.queue`

**Jak `startPromise` blokuje race condition:**
`startPromise` jest przypisywany **natychmiast** (zanim `await boss.start()` się wykona). Promise jest tworzony synchronicznie. Każde kolejne wywołanie `getQueue()` podczas startu dostaje **ten sam Promise** i czeka razem na jego rozwiązanie. Nie ma drugiej instancji — jest jeden `boss.start()`, wielu czekających na wynik.

---

## Pytanie 3

> Dlaczego `boss.createQueue(EMAIL_JOB)` musi być wywołane przed `boss.work()` i `boss.send()` w pg-boss v12? Co by się stało bez tego wywołania?

**pg-boss v12 zmienił model zarządzania kolejkami:**
W starszych wersjach pg-boss tworzył kolejkę automatycznie przy pierwszym `send()` lub `work()`. W v12 kolejka musi istnieć **zanim** ktokolwiek do niej pisze lub z niej czyta — jest to jawna operacja DDL (`INSERT INTO pgboss.queue`).

**Co bez `createQueue()`:**
`boss.send('process-email', payload)` rzuciłby błąd:

```
Error: Queue "process-email" not found
```

**Dlaczego wywołujemy `createQueue` w dwóch miejscach:**

- **W `registerEmailWorker`** — przy starcie serwera, zanim worker zacznie nasłuchiwać
- **W handleru `/api/webhooks/postmark`** — defensywnie, na wypadek gdyby worker nie zdążył uruchomić się przed pierwszym webhookiem

Wywołanie `createQueue` gdy kolejka już istnieje jest **idempotentne** — nie rzuca błędu, po prostu nic nie robi. To safe guard, nie błąd.

---

## Pytanie 4

> Co to jest anti-loop detection w `parsePostmarkPayload` i dlaczego jest konieczny? Jaki scenariusz uniemożliwia?

```typescript
const senderDomain = payload.FromFull.Email.split('@')[1]?.toLowerCase()

if (options.ownDomain && senderDomain === options.ownDomain.toLowerCase()) {
  return null
}
```

**Scenariusz pętli:**

1. Klient wysyła email na `support@helpdesk.com`
2. System tworzy ticket i wysyła automatyczny potwierdzenie: `"Twój ticket #123 został przyjęty"` — z adresu `noreply@helpdesk.com`
3. Postmark dostarcza to potwierdzenie do skrzynki klienta
4. Klient odpowiada: `"Dziękuję"` — system tworzy nowy ticket
5. System wysyła kolejne potwierdzenie — do klienta, i do nas (jeśli `To` zawiera nasz adres)
6. Postmark może dostarczyć ten email z powrotem na nasz webhook — tworząc ticket z naszego własnego adresu
7. System wysyła potwierdzenie z `noreply@helpdesk.com` — trafia na webhook — i tak w koło

**Co robi detekcja:**
Sprawdza domenę nadawcy (`FromFull.Email`). Jeśli pasuje do `OWN_DOMAIN` (np. `helpdesk.com`), zwraca `null`. Worker widzi `null` → loguje info → kończy job bez tworzenia ticketu. Pętla jest przerwana.

**Ważne:** `mailer-daemon@example.com` (raporty dostawy) NIE jest blokowany — bo `example.com !== helpdesk.com`. To poprawne zachowanie — raport dostawy od zewnętrznego serwera jest innym przypadkiem.

---

## Pytanie 5

> Jak działa idempotency przez unique constraint i Prisma error `P2002`? Co by się stało gdybyś zamiast tego sprawdzał `findFirst` przed `create`?

**Unique constraint w Prisma schema:**

```prisma
model Ticket {
  messageId String @unique
}
```

Postgres gwarantuje na poziomie bazy danych, że dwa tickety nie mogą mieć tego samego `messageId`. Każdy email od Postmarka ma unikalny `MessageID`.

**Jak worker obsługuje duplikat:**

```typescript
try {
  await prisma.ticket.create({ data: { messageId: parsed.messageId, ... } })
} catch (err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    logger.info({ messageId: parsed.messageId }, 'Duplicate messageId, skipping')
    return  // cicha ignoracja — NIE rzucamy dalej
  }
  throw err  // inne błędy — rzucamy, job zostanie zretrynowany
}
```

**Dlaczego nie `findFirst` + `create`:**
To **TOCTOU race condition** (Time Of Check To Time Of Use).

1. Worker A: `findFirst` → brak ticketu → OK, kontynuuje
2. Worker B: `findFirst` → brak ticketu → OK, kontynuuje
3. Worker A: `create` → ticket stworzony
4. Worker B: `create` → **DUPLIKAT** — mimo że sprawdzał!

Unikalna ograniczenie bazodanowe jest atomowe — albo insert przejdzie, albo nie, bez race condition. `P2002` to właściwa warstwa do obsługi duplikatów.

---

## Pytanie 6

> Dlaczego `timingSafeEqual` zamiast zwykłego `===` do weryfikacji tokenu webhook? Jaki atak mityguje?

```typescript
valid =
  token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected))
```

**Timing attack:**
Zwykłe porównanie stringów (`token === expected`) kończy się przy **pierwszym niespasowanym znaku**. Czas odpowiedzi zależy od tego ile znaków pasuje:

- `"AAAA"` vs `"ZZZZ"` → kończy się na pierwszym znaku → ~nanosekunda
- `"ZAAA"` vs `"ZZZZ"` → kończy się na drugim znaku → trochę dłużej
- `"ZZZA"` vs `"ZZZZ"` → kończy się na czwartym znaku → najdłużej

Atakujący wysyłając tysiące requestów z różnymi tokenami i mierząc czas odpowiedzi może **odgadnąć token znak po znaku**. Przy tokenie 32-znakowym zamiast 36^32 kombinacji, testuje 36×32 = 1152 kombinacje.

**`timingSafeEqual` działa w stałym czasie** — zawsze porównuje wszystkie bajty niezależnie od miejsca niezgodności. Mierzenie czasu nie daje atakującemu żadnej informacji.

**Dlaczego sprawdzamy długość osobno:**
`timingSafeEqual` rzuca błąd gdy bufory mają różną długość — nie możesz jej wywołać bez wcześniejszego sprawdzenia `token.length === expected.length`. Ten length check jest wykonywany w stałym czasie przez V8.

---

## Pytanie 7

> Co oznaczają opcje `TextBody: z.string().default('')` i `HtmlBody: z.string().default('')` w Zod schema? Co by się stało bez `.default('')`?

```typescript
const PostmarkWebhookSchema = z.object({
  TextBody: z.string().default(''),
  HtmlBody: z.string().default(''),
})
```

**Dlaczego `.default('')` jest konieczne:**
Nie każdy email ma oba pola. Postmark może wysłać payload bez `TextBody` (email tylko HTML) lub bez `HtmlBody` (email tylko tekstowy). W tym przypadku pole będzie **`undefined`**, nie pustym stringiem.

Bez `.default('')`:

- `z.string()` failuje na `undefined` — zwróci błąd walidacji `422`
- Webhook odrzuca legitymny email od klienta

Z `.default('')`:

- Brakujące pole → `''` (pusty string)
- Walidacja przechodzi
- `parsePostmarkPayload` widzi `TextBody = ''` → fallback do `HtmlBody`

**Logika fallback w workerze:**

```typescript
const body = payload.TextBody?.trim() || stripHtml(payload.HtmlBody || '')
```

Jeśli `TextBody` jest pustym stringiem (po `.trim()` → `''` → falsy), sięga po `HtmlBody` i strippuje tagi HTML. Jeśli oba są puste → `body = ''`. Ticket nadal jest tworzony — nie odrzucamy pustych emaili, to decyzja biznesowa.

---

## Pytanie 8

> Opisz krok po kroku pełny przepływ od odebrania emaila przez Postmarka do zapisu ticketu w bazie. Ile jest warstw i co każda robi?

```
[1] Klient wysyła email na support@helpdesk.com
         ↓
[2] Postmark odbiera email, parsuje i wywołuje:
    POST /api/webhooks/postmark
    X-Postmark-Token: <secret>
    Body: { MessageID, From, FromFull, Subject, TextBody, HtmlBody, To }
         ↓
[3] verifyPostmarkToken()
    - Sprawdza header X-Postmark-Token
    - timingSafeEqual() z POSTMARK_WEBHOOK_TOKEN
    - Niepoprawny token → 401, koniec
         ↓
[4] PostmarkWebhookSchema.safeParse(req.body)
    - Walidacja Zod (typy, email format, default '')
    - Niepoprawne dane → 400, koniec
         ↓
[5] getQueue() — pobiera singleton PgBoss
    queue.createQueue(EMAIL_JOB) — idempotentne
    queue.send(EMAIL_JOB, parsed.data)
    — job zapisany w tabeli pgboss.job w Postgresie
    res.json({ ok: true })  ← Postmark dostaje 200
         ↓
[6] pg-boss polling (co ~2s)
    — fetchuje dostępne joby z pgboss.job
    — blokuje job (UPDATE ... WHERE state = 'created')
         ↓
[7] registerEmailWorker callback: ([job]) => { ... }
    parsePostmarkPayload(job.data, { ownDomain })
    — anti-loop check (null jeśli własna domena)
    — ekstrahuje customerEmail, customerName, body (TextBody || stripped HTML)
         ↓
[8] prisma.ticket.create({ data: parsed })
    — INSERT INTO tickets (messageId UNIQUE, ...)
    — P2002 → silent skip (duplikat)
    — inne błędy → throw → pg-boss retrynuje job
         ↓
[9] Ticket widoczny w bazie, gotowy dla agentów
```

---

## Pytanie 9

> Dlaczego `localConcurrency` zamiast uruchamiania wielu procesów (`teamSize`) do równoległego przetwarzania emaili?

```typescript
// queue.test.ts
await queue.work<{ id: string }>('concurrency-test', { localConcurrency: 2 }, handler)
```

**`localConcurrency`** — uruchamia N równoległych wywołań handlera **w obrębie jednego procesu Node.js**. Współdzielą event loop, heap, połączenie z bazą.

**`teamSize`** (alternatywa) — pg-boss uruchamia N osobnych workerów procesowych. Każdy ma własny proces Node.js, własne połączenie z bazą, własny event loop.

**Dlaczego `localConcurrency` jest właściwym wyborem dla helpdesk:**

- Przetwarzanie emaili jest **I/O-bound** (zapis do Postgresa, opcjonalne API calls). Event loop Node.js świetnie radzi sobie z I/O współbieżnie — nie potrzebujemy osobnych procesów.
- `teamSize` = 4 oznacza 4 procesy Node.js z 4 połączeniami do Postgresa — koszty zasobowe. `localConcurrency: 4` = 4 równoległe operacje przez jedno połączenie (connection pooling Prisma).
- Przy awarii procesu z `teamSize`, tracisz worker — trzeba restartować. Przy `localConcurrency` wszystko w jednym procesie — recovery jest prostszy.

**Kiedy `teamSize` byłby lepszy:** Przetwarzanie CPU-bound (np. enkrypcja, kompresja) gdzie GIL-like blocking w jednym procesie Node.js byłby wąskim gardłem.

---

## Pytanie 10

> Wyjaśnij kolejność kroków w graceful shutdown: `server.close()` → `stopQueue()` → `process.exit(0)`. Co by się stało gdybyś odwrócił kolejność?

```typescript
const shutdown = () => {
  server.close(() => {
    // [1]
    stopQueue() // [2]
      .then(() => {
        process.exit(0) // [3]
      })
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

**Krok 1 — `server.close()`:**
Zatrzymuje Express od akceptowania nowych połączeń HTTP. Istniejące requesty (np. webhook Postmarka w trakcie przetwarzania) **dokańczają się** — callback jest wywołany dopiero gdy wszystkie połączenia są zamknięte.

Gdybyś pominął `server.close()` i od razu zatrzymał kolejkę: webhook mógłby próbować `queue.send()` na zatrzymanym pg-boss → uncaught error → proces crashuje zamiast zamykać się czysto.

**Krok 2 — `stopQueue()`:**
`boss.stop()` czeka aż aktualnie przetwarzane joby skończą się (domyślnie z timeoutem). Resetuje `boss = null` i `startPromise = null`. Połączenie PgBoss z Postgresem jest zamykane.

Gdybyś zrobił to przed `server.close()`: nowe requesty mogłyby wciąż trafiać do Express i próbować `getQueue()` — ale `boss` jest zatrzymany → błędy.

**Krok 3 — `process.exit(0)`:**
Tylko po upewnieniu się że HTTP jest zamknięty i kolejka zatrzymana. Kod `0` = sukces (ważne dla systemów orchestracji jak Kubernetes, które sprawdzają exit code).

Gdybyś wywołał `process.exit()` pierwszy: żadne cleanup nie zajdzie — joby w trakcie przetwarzania zostaną porzucone, połączenia z Postgresem nie będą zamknięte elegancko.

---

## Pytanie 11

> Dlaczego `retryLimit` ustawia się na `send()`, a nie na `work()` w pg-boss v12? Co się stanie gdy worker rzuci wyjątek?

```typescript
// queue.test.ts — POPRAWNIE
await queue.send('retry-test-job', { attempt: 1 }, { retryLimit: 2, retryDelay: 1 })

// Nie ma retryLimit na work():
await queue.work<...>('retry-test-job', async ([_job]) => {
  throw new Error('Simulated failure')
})
```

**Architektura pg-boss v12:**
Polityka retry jest właściwością **joba** (danych w kolejce), nie handlera. Kiedy `send()` zapisuje job w `pgboss.job`, zapisuje wraz z nim `retry_limit`, `retry_delay`, `retry_backoff`. Worker nie ma pojęcia o retry policy — wie tylko jak przetworzyć job.

**Gdy worker rzuca wyjątek:**

1. pg-boss przechwytuje odrzucony Promise
2. Sprawdza `retry_limit` joba w bazie
3. Jeśli `attempts < retry_limit` → ustawia `state = 'retry'`, inkrementuje `attempts`, czeka `retry_delay` sekund
4. Po `retry_delay` → job wraca do `state = 'created'` → polling go pobiera
5. Jeśli `attempts >= retry_limit` → `state = 'failed'` — job jest martwy

**Dlaczego to dobry design:**
Nadawca (webhook) wie ile razy warto retryować email. Różne typy emaili mogły mieć różne `retryLimit` — krytyczne wiadomości VIP: `retryLimit: 5`, spam: `retryLimit: 1`. Worker jest bezstanowy i nie musi o tym wiedzieć.

---

## Pytanie 12

> W jaki sposób `parsePostmarkPayload` radzi sobie z emailami tylko HTML (bez `TextBody`)? Prześledź logikę `stripHtml`.

```typescript
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ') // zastąp każdy tag spacją
    .replace(/\s+/g, ' ') // kolaps wielokrotnych spacji do jednej
    .trim() // usuń spacje z początku i końca
}

const body = payload.TextBody?.trim() || stripHtml(payload.HtmlBody || '')
```

**Przykład z fixture `html-only.json`:**

```
HtmlBody: "<html><body><p>I need <strong>urgent</strong> help with my account.</p></body></html>"
TextBody: ""
```

Krok po kroku `stripHtml`:

1. `"<html><body><p>I need <strong>urgent</strong> help with my account.</p></body></html>"`
2. → `" I need  urgent  help with my account. "` (tagi → spacje)
3. → `" I need urgent help with my account. "` (kolaps spacji)
4. → `"I need urgent help with my account."` (trim)

**Dlaczego `payload.TextBody?.trim() || ...`:**
`TextBody` po Zod `.default('')` nigdy nie jest `undefined`, ale `?.trim()` jest bezpieczny. Pusty string po `.trim()` to `''` → falsy → wchodzi w `||` → `stripHtml(HtmlBody)`.

**Ograniczenia tego podejścia:**
Prosty regex nie radzi sobie z: `<style>` i `<script>` (zostawia ich zawartość), HTML entities (`&amp;` → `&amp;` nie `&`), nested tagami z atrybutami zawierającymi `>`. Dla MVP jest wystarczający.

---

## Pytanie 13

> Dlaczego testy `webhooks.test.ts` mockują `getQueue`, ale `queue.test.ts` używa prawdziwego Postgresa przez testcontainers? Co każde podejście weryfikuje?

**`webhooks.test.ts` — mock:**

```typescript
vi.mock('../jobs/queue', () => ({
  getQueue: vi.fn().mockResolvedValue({
    createQueue: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue('job-id'),
  }),
}))
```

Testy webhook route testują **kontrakt HTTP** — czy handler poprawnie:

- Weryfikuje token (timingSafeEqual)
- Waliduje payload Zod
- Zwraca `200 { ok: true }` po sukcesie
- Zwraca `401` przy złym tokenie
- Przekazuje błąd kolejki do error middleware (`next(err)`) → `500`

Kolejka to **zależność zewnętrzna** dla route. Mock izoluje route od PgBoss. Test jest deterministyczny, szybki (<100ms), nie potrzebuje Postgresa.

**`queue.test.ts` — real Postgres (testcontainers):**
Testy kolejki weryfikują **integrację pg-boss z bazą**:

- Czy job faktycznie trafia do `pgboss.job` tabeli
- Czy worker faktycznie go pobiera i przetwarza
- Czy idempotency (P2002 unique constraint) działa end-to-end
- Czy retry policy (`retryLimit` w `send()`) naprawdę retrynuje

Tych właściwości nie można zweryfikować mockiem — pg-boss polling, row locking, retry state machine to zachowania bazy danych. Mock `send()` zawsze zwracałby `'job-id'` bez żadnego rzeczywistego wykonania.

---

## Pytanie 14

> Co robi `boss.work<PostmarkPayload>(EMAIL_JOB, async ([job]) => { ... })` — dlaczego `[job]` (destrukturyzacja tablicy)?

```typescript
await boss.work<PostmarkPayload>(EMAIL_JOB, async ([job]) => {
  // job to jeden obiekt, nie tablica
})
```

**pg-boss v12 batch API:**
`boss.work()` wywołuje handler z **tablicą jobów** — nawet gdy przetwarza jeden job na raz. Tablica pozwala pg-boss wywoływać handler z batch'em (np. `batchSize: 5` → handler dostaje 5 jobów naraz, przetwarza je razem).

Destrukturyzacja `([job])` to skrót dla:

```typescript
async jobs => {
  const job = jobs[0]
  // ...
}
```

**Dlaczego tablica jest lepszym API:**
Handler emailowy przetwarza jeden job, ale handler do bulk operations (np. wysyłanie raportu) mógłby przetworzyć 100 ticketów w jednej transakcji Prisma. Ujednolicone API pozwala pg-boss wywołać handler bez wiedzy o tym ile jobów handler chce przetwarzać — to konfiguracja (`batchSize`), nie typ handlera.

**TypeScript generic `<PostmarkPayload>`:**
Typuje `job.data` jako `PostmarkPayload`, więc TypeScript wie że `job.data.MessageID` istnieje. Bez generic: `job.data` byłoby `unknown`.

---

## Pytanie 15

> Jak `customerName` jest ustawiane gdy `FromFull.Name` jest pustym stringiem? Jaki fixture to testuje?

```typescript
customerName: payload.FromFull.Name || payload.FromFull.Email,
```

**Logika:**
`payload.FromFull.Name` jest pustym stringiem `''` → falsy → wchodzi w `||` → fallback na `payload.FromFull.Email`.

**Fixture `no-name.json`:**

```json
{
  "FromFull": { "Email": "anon@example.com", "Name": "" }
}
```

Test:

```typescript
it('falls back to email address as name when Name is empty', () => {
  const result = parsePostmarkPayload(noName as PostmarkPayload)
  expect(result?.customerName).toBe('anon@example.com')
})
```

**Dlaczego to ważna decyzja:**
Email jest wymaganym polem w `FromFull` (Zod: `z.string().email()`). Nawet jeśli użytkownik nie ma wyświetlanej nazwy, zawsze mamy email jako identyfikator. Ticket stworzony przez `anon@example.com` bez nazwy nadal jest użyteczny — agent widzi adres email.

**Alternatywne podejście:** `customerName: payload.FromFull.Name.trim() || payload.FromFull.Email` — dla przypadku gdy Name to `"  "` (same spacje). PR tego nie implementuje, bo Postmark normalnie wysyła pusty string, nie whitespace.

---

## Pytanie 16

> Dlaczego w `index.ts` `main()` jest funkcją `async` zamiast bezpośrednio `await getQueue()` na poziomie modułu?

```typescript
async function main() {
  const queue = await getQueue()
  await registerEmailWorker(queue)
  const server = app.listen(...)
  // ...
}

main().catch(err => {
  logger.error({ err }, 'Fatal startup error')
  process.exit(1)
})
```

**Top-level `await` i obsługa błędów:**
`await` na poziomie modułu ES2022 jest możliwy, ale:

1. **Obsługa błędów jest trudniejsza.** Niezłapany błąd z top-level `await` rzuca `UnhandledPromiseRejection` — Node.js może zakończyć proces z kodem 1, ale nie masz kontroli nad komunikatem błędu ani logowaniem.

2. **Logowanie przed śmiercią procesu.** `main().catch(err => { logger.error(...); process.exit(1) })` gwarantuje że błąd startowy (np. Postgres niedostępny, pg-boss nie może się połączyć) zostanie zalogowany przez Pino w formacie JSON z pełnym stack trace — zanim proces umrze.

3. **Enkapsulacja.** `main()` definiuje jasną granicę startu — wszystko co potrzebne do uruchomienia serwera jest w jednym miejscu. Shutdown handler, error handler na `server.on('error')`, signal handlers — wszystko w kontekście tej funkcji.

4. **Testowalność.** Funkcja `main` mogłaby być importowana i testowana niezależnie od modułu (choć w tym projekcie nie jest).

---

## Pytanie 17

> Wyjaśnij dlaczego `TextBody` i `HtmlBody` w interfejsie `PostmarkPayload` (w `processEmail.ts`) nie mają `.default('')`, podczas gdy Zod schema w `webhooks.ts` je ma.

```typescript
// processEmail.ts — interfejs TypeScript
export interface PostmarkPayload {
  TextBody: string // ← nie ma default
  HtmlBody: string // ← nie ma default
}

// webhooks.ts — Zod schema
const PostmarkWebhookSchema = z.object({
  TextBody: z.string().default(''), // ← ma default
  HtmlBody: z.string().default(''), // ← ma default
})
```

**Podział odpowiedzialności:**

`PostmarkWebhookSchema` (Zod) to **granica wejściowa** — waliduje dane z zewnątrz (od Postmarka). Może przyjść payload bez `TextBody` — Zod uzupełnia go `''`. Po walidacji wynik (`parsed.data`) jest typem TypeScript gdzie `TextBody: string` (nie `string | undefined`).

`PostmarkPayload` to interfejs opisujący **dane po walidacji** — kontrakt wewnętrzny między webhook route a parserem. W tym kontekście `TextBody` zawsze jest stringiem (Zod to zagwarantował).

**Gdybyś dodał `?` do interfejsu (`TextBody?: string`):**
Parser musiałby obsługiwać `undefined` w środku logiki: `payload.TextBody?.trim() || ...` — ale to już robi. Kod działałby, ale byłby mniej precyzyjny typowo — interfejs kłamałby że pole jest opcjonalne, gdy w praktyce (po Zod) zawsze jest dostępne.

---

## Pytanie 18

> W `queue.test.ts` test `idempotency` wysyła dwa joby z tym samym `MessageID` i czeka 5 sekund. Dlaczego test musi czekać? Co by się stało bez `await new Promise(res => setTimeout(res, 5000))`?

```typescript
await queue.send(EMAIL_JOB, VALID_PAYLOAD)
await queue.send(EMAIL_JOB, { ...VALID_PAYLOAD }) // spread = nowy obiekt, ten sam MessageID

await new Promise(res => setTimeout(res, 5000))

const count = await prisma.ticket.count({
  where: { messageId: VALID_PAYLOAD.MessageID },
})
expect(count).toBe(1)
```

**Dlaczego wait jest konieczny:**
pg-boss działa asynchronicznie przez polling. Cykl życia joba:

1. `queue.send()` → job pojawia się w `pgboss.job` z `state = 'created'`
2. pg-boss polling loop (domyślnie co 2 sekundy) → fetchuje joby
3. Worker callback jest wywołany
4. `prisma.ticket.create()` → INSERT do bazy
5. pg-boss oznacza job `state = 'completed'`

Bez wait, test sprawdzałby `prisma.ticket.count()` zanim pg-boss zdążyłby zpollować i przetworzyć joby. Wynik byłby `0` — nie `1` — i test failowałby fałszywie.

**5 sekund:**
Dwa polling cykle (2s + 2s) + buffer na przetwarzanie = ~5s. To minimalny czas żeby oba joby mogły być zpollowane, pierwszy stworzył ticket, drugi trafił na P2002 i zignorował.

**Alternatywy bez sleep:**
Można by użyć `waitUntil()` z polling w teście, ale to dodatkowa złożoność. W tym kontekście (integracyjny test z pg-boss) sleep jest akceptowalnym trade-offem.

---

## Pytanie 19

> Jak `OWN_DOMAIN` jest przekazywane z env do `parsePostmarkPayload`? Prześledź ścieżkę od `.env` do funkcji parsującej.

**Krok 1 — `.env.example` i `env.ts`:**

```
OWN_DOMAIN="helpdesk.com"
```

```typescript
// env.ts
const schema = z.object({
  OWN_DOMAIN: z.string().optional(),
})
export const env = schema.parse(process.env)
```

Pole jest opcjonalne — w dev możesz nie ustawiać `OWN_DOMAIN` i anti-loop detection nie zadziała (gdybyś chciał testować bez filtrowania).

**Krok 2 — Worker czyta `env` w runtime:**

```typescript
// processEmail.ts
export async function registerEmailWorker(boss: PgBoss): Promise<void> {
  await boss.work<PostmarkPayload>(EMAIL_JOB, async ([job]) => {
    const ownDomain = env.OWN_DOMAIN  // ← czytane przy każdym jobie
    const parsed = parsePostmarkPayload(job.data, { ownDomain })
```

`env.OWN_DOMAIN` jest czytane przy każdym wywołaniu handlera, nie przy `registerEmailWorker`. Teoretycznie gdybyś przeładował env w runtime (co nie jest tu implementowane), worker by to widział.

**Krok 3 — Testy:**

```typescript
// processEmail.test.ts — przekazane jako opcja
const result = parsePostmarkPayload(payload, { ownDomain: 'helpdesk.com' })
```

Testy jednostkowe `parsePostmarkPayload` nie polegają na `env` — przekazują `ownDomain` bezpośrednio. To dobry design: funkcja jest czysta, testowalna bez mockowania modułu `env`.

---

## Pytanie 20

> Musisz dodać nowy typ webhooków od innego dostawcy (np. SendGrid zamiast Postmarka). Co konkretnie zmieniasz w kodzie i co możesz pozostawić bez zmian?

**Co zostaje bez zmian:**

- `server/src/jobs/queue.ts` — pg-boss singleton działa dla dowolnych jobów
- `server/src/jobs/processEmail.ts` — parser i worker działają na znormalizowanej strukturze `ParsedEmail`
- Prisma schema — ticket ma generyczne pola, niezależne od dostawcy emaili
- `server/src/index.ts` — `registerEmailWorker` jest dostawca-agnostyczny
- Logika idempotency (P2002), anti-loop, stripHtml — niezależne od dostawcy

**Co zmieniasz:**

**(a) Nowy Zod schema dla SendGrid payload:**

```typescript
// webhooks.ts
const SendGridWebhookSchema = z.object({
  // SendGrid używa innego formatu — np. envelope, headers
  envelope: z.object({ from: z.string() }),
  subject: z.string(),
  text: z.string().optional().default(''),
  html: z.string().optional().default(''),
  'message-id': z.string(),
})
```

**(b) Nowa weryfikacja tokenu (SendGrid używa HMAC-SHA256):**

```typescript
function verifySendGridSignature(req: Request, res: Response): boolean {
  // SendGrid podpisuje payload HMAC-SHA256 zamiast prostego tokenu
  const signature = req.headers['x-twilio-email-event-webhook-signature']
  // ...
}
```

**(c) Nowy endpoint w `webhooks.ts`:**

```typescript
router.post('/sendgrid', async (req, res, next) => {
  if (!verifySendGridSignature(req, res)) return
  // parsowanie SendGrid → SendGrid payload → queue.send(EMAIL_JOB, normalizedData)
})
```

**(d) Nowa normalizacja w `processEmail.ts`:**
Funkcja `parseSendGridPayload` → zwraca `ParsedEmail` w tym samym formacie co `parsePostmarkPayload`. Worker jest niezmieniony — przetwarza `ParsedEmail` niezależnie od źródła.

Dobra architektura tego PR polega na tym, że normalizacja do `ParsedEmail` dzieje się **przed** kolejką — worker nigdy nie widzi formatu dostawcy.
