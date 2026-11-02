# AI Pipeline (Plan 07) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Każdy nowy ticket dostaje w tle trzy wyniki: streszczenie (PL i EN), propozycję priorytetu i szkic pierwszej odpowiedzi w języku klienta z tłumaczeniem. Agent widzi je w panelu ticketu i sam decyduje, czy z nich skorzysta.

**Architecture:**

- Serwis `server/src/ai/` woła model przez interfejs `AiProvider`. Dostępne są dwie implementacje: Ollama (domyślna) i `fake` (testy), a Claude ma na razie tylko szkielet.
- Job pg-boss `ai-triage` startuje po utworzeniu ticketu i po kliknięciu „Analizuj” lub „Wygeneruj ponownie”. Zapisuje wyniki do tabeli `ticket_ai_results` (relacja 1:1 z ticketem), a każde wywołanie modelu loguje w `ai_interactions`.
- Klient odczytuje wyniki z `GET /api/tickets/:id` i odpytuje serwer, dopóki stan to `PENDING`.

**Tech Stack:** Express, Prisma 5, pg-boss 12, Zod 3, `fetch` (Node 22) do Ollamy `/api/chat`, `express-rate-limit`, React + TanStack Query + react-i18next, vitest + testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-ai-pipeline-design.md` (decyzja o dostawcy: `docs/adr/0017-dostawca-ai-ollama-domyslnie.md`). Issue #20, branch `feat/20-ai-pipeline`.

## Global Constraints

- **Env:**
  - `AI_PROVIDER`: `ollama` (domyślnie) | `claude` | `fake`;
  - `OLLAMA_HOST`: domyślnie `http://localhost:11434`;
  - `OLLAMA_MODEL`: domyślnie `qwen3.8:27b-q4_K_M`;
  - `AI_TIMEOUT_MS`: domyślnie `120000`.

  Env nie wymusza żadnej z tych zmiennych dla `NODE_ENV=production`.

- **`AI_PROVIDER=claude`:** serwer startuje normalnie, a każde wywołanie kończy się błędem `AiUnavailableError('Claude provider not implemented')`.
- **AI nigdy nie blokuje przyjęcia maila:** błąd AI lub kolejki AI nie może przerwać ani powtórzyć joba `process-email`.
- **AI niczego nie zmienia w tickecie bez kliknięcia agenta.** Priorytet zmienia się wyłącznie przez istniejący `PATCH /api/tickets/:id`.
- **Języki AI:** tylko `pl` i `en`. Szkic powstaje w języku klienta. Streszczenie i tłumaczenie szkicu liczymy w obu językach.
- **Zasady szkicu (dosłownie ze specu):** szkic potwierdza przyjęcie, krótko powtarza problem i dopytuje o brakujące informacje. Nie obiecuje terminów, zwrotów ani kwot i nie podaje zasad ani procedur firmy.
- **Testy nie wołają prawdziwego modelu.** Jedyny wyjątek to ręczny skrypt z Task 9.
- **Każdy commit przechodzi pre-commit** (`pnpm typecheck` i `prettier --check .`). Commity są w Conventional Commits i kończą się `Refs #20`.
- **Migracje** generuj przez `prisma migrate diff`, bo `migrate dev` nie działa w nieinteraktywnej powłoce.
- **Pliki `.env*`** są objęte regułą deny. Zmianę w `.env.example` wykonaj tylko za zgodą użytkownika (Task 9).
- **Wszystkie teksty UI** idą przez i18n i mają klucze PL i EN. Opisy w `expect` w e2e piszemy po polsku (wymusza to ESLint).

## Review Focus

1. **Ollama nie działa, gdy przychodzi mail.** Ticket i tak powstaje, a stan AI kończy jako `FAILED`. Test: Task 4 `ticket is created even when AI enqueue fails` i `last attempt marks FAILED`.
2. **Model zwraca JSON spoza schematu** (priorytet spoza enuma, język `deu` zamiast `de`, tekst rozumowania przed JSON-em). Kończy się to błędem `AiInvalidOutputError`, wpisem `success=false` w `ai_interactions` i brakiem zapisu wyników. Testy: Task 2 `rejects output that fails the schema` i Task 3 `logs a failed call`.
3. **Mail bez treści albo bardzo długi** (np. 100 000 znaków). Prompt zawsze powstaje, a treść jest przycięta do `MAX_BODY_CHARS = 8000`. Test: Task 3 `truncates long bodies` i `handles an empty body`.
4. **Agent wpisał tekst i klika „Użyj szkicu”.** Pojawia się pytanie o potwierdzenie, a „Anuluj” zostawia tekst bez zmian. Test: Task 7 `asks before replacing typed text`.
5. **Seed e2e usuwa tickety, które mają wyniki AI i wpisy `ai_interactions`.** Usunięcie się udaje: wyniki usuwa kaskada, a `ai_interactions.ticketId` dostaje `null`. Test: Task 1 `deleting a ticket removes its AI result and keeps the log`.

---

### Task 1: Dane i konfiguracja

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20261101120000_ai_pipeline/migration.sql`
- Modify: `server/src/env.ts`, `server/src/env.test.ts`
- Test: `server/src/db.test.ts` (lub nowy `server/src/ai/schema.integration.test.ts`)

**Interfaces:**

- Produces:
  - **enum `AiResultState`**: `PENDING` | `READY` | `FAILED`.
  - **model `TicketAiResult`** (`@@map("ticket_ai_results")`):
    - `ticketId String @id`, relacja do `Ticket` z `onDelete: Cascade`;
    - `state AiResultState`;
    - `error String?`;
    - `suggestedPriority TicketPriority?`;
    - `customerLanguage String?`;
    - `draft String?`;
    - `summaryPl String?`, `summaryEn String?`;
    - `draftTranslationPl String?`, `draftTranslationEn String?`;
    - `completedAt DateTime?` (czas ostatniego udanego wyniku);
    - `updatedAt DateTime @updatedAt`.

    Na `Ticket` dochodzi relacja `aiResult TicketAiResult?`.

  - **`AIInteraction`** dostaje pola:
    - `provider String @default("unknown")`;
    - `model String @default("unknown")`;
    - `success Boolean @default(true)`;
    - `error String?`;
    - `userId String?` (bez relacji).
  - **`User`** dostaje pole `aiLocale String?`.
  - **`env`** dostaje pola `AI_PROVIDER`, `OLLAMA_HOST`, `OLLAMA_MODEL` i `AI_TIMEOUT_MS` (liczba), z wartościami domyślnymi z Global Constraints.

- [ ] **Step 1: Write the failing tests.**
  - W `env.test.ts`:
    - `it('defaults AI settings to local Ollama')`: oczekuje `AI_PROVIDER === 'ollama'`, `OLLAMA_HOST === 'http://localhost:11434'`, `OLLAMA_MODEL === 'qwen3.8:27b-q4_K_M'` i `AI_TIMEOUT_MS === 120000`;
    - `it('rejects an unknown AI_PROVIDER')`: `AI_PROVIDER=gpt` rzuca błąd.

    Wzoruj się na istniejących testach env.

  - Test integracyjny `it('deleting a ticket removes its AI result and keeps the log')` robi kolejno:
    1. tworzy ticket, `ticketAiResult` (`state: 'READY'`) i `aIInteraction` (`type: 'SUMMARY'`);
    2. wykonuje `prisma.ticket.delete`;
    3. oczekuje, że `ticketAiResult.findUnique` zwraca `null`, a interakcja istnieje z `ticketId === null`.

- [ ] **Step 2: Run** `pnpm --filter server test -- env db`. Expected: FAIL (brak pól i modeli).
- [ ] **Step 3: Implement** schemat i env. Migrację wygeneruj tak:

  ```bash
  cd server && npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261101120000_ai_pipeline/migration.sql
  ```

  Jeśli baza dev jest pusta, użyj `--from-migrations prisma/migrations --shadow-database-url …`. Potem uruchom `npx prisma generate`. Sprawdź w SQL, że `ai_interactions_ticketId_fkey` ma `ON DELETE SET NULL`. Jeśli ma `RESTRICT`, dopisz `onDelete: SetNull` do relacji.

- [ ] **Step 4: Run** `pnpm --filter server test -- env db` i `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): AI result table, AI interaction fields and AI env`.

---

### Task 2: Dostawcy AI (Ollama, fake, szkielet Claude)

**Files:**

- Create:
  - `server/src/ai/types.ts`, `server/src/ai/ollamaProvider.ts`, `server/src/ai/fakeProvider.ts`, `server/src/ai/claudeProvider.ts`, `server/src/ai/provider.ts`;
  - fixtures: `server/src/__fixtures__/ollama/chat-ok.json`, `chat-bad-enum.json`, `chat-not-json.json`.
- Test: `server/src/ai/ollamaProvider.test.ts`, `server/src/ai/provider.test.ts`

**Interfaces:**

- Produces (`types.ts`):

  ```ts
  export type AiProviderName = 'ollama' | 'claude' | 'fake'
  export type AiTaskKind = 'analysis' | 'draft'
  export interface StructuredRequest<T> {
    kind: AiTaskKind
    system: string
    user: string
    schema: ZodType<T>
    jsonSchema: Record<string, unknown>
    temperature: number
  }
  export interface AiUsage {
    inputTokens: number
    outputTokens: number
    latencyMs: number
  }
  export interface StructuredResult<T> extends AiUsage {
    data: T
    raw: string
  }
  export interface AiProvider {
    name: AiProviderName
    model: string
    generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>
  }
  export class AiUnavailableError extends Error {} // network, timeout, HTTP error, not implemented
  export class AiInvalidOutputError extends Error {
    constructor(
      message: string,
      readonly raw: string,
      readonly usage: AiUsage,
    ) {
      super(message)
    }
  }
  ```

- Produces:
  - `createOllamaProvider(opts: { host: string; model: string; timeoutMs: number; fetch?: typeof fetch }): AiProvider`;
  - `createFakeProvider(respond?: (req: StructuredRequest<unknown>) => unknown): AiProvider`. Domyślny `respond` zwraca stałe, poprawne dane dla `kind` `analysis` i `draft` (kształty z Task 3);
  - `createClaudeProvider(): AiProvider`. Model to `'claude'`, a `generate` zawsze rzuca `AiUnavailableError('Claude provider not implemented')`;
  - `getAiProvider(): AiProvider`. Wybiera dostawcę według `env.AI_PROVIDER` i zapamiętuje instancję.

- [ ] **Step 1: Write the failing tests** (`ollamaProvider.test.ts`, z wstrzykiwanym `fetch`, który zwraca fixture):
  - **`sends format, think:false, stream:false and temperature`**: ciało żądania do `${host}/api/chat` zawiera `model`, `stream: false`, `think: false`, `format: jsonSchema` i `options.temperature`, a `messages` to `[system, user]`.
  - **`maps content and usage`**: przy `chat-ok.json` (`message.content` z poprawnym JSON-em, `prompt_eval_count: 812`, `eval_count: 143`, `total_duration: 2_500_000_000`) wynik to `data` zgodne ze schematem, `inputTokens 812`, `outputTokens 143` i `latencyMs 2500`.
  - **`defaults missing counters to 0`**.
  - **`rejects output that fails the schema`**: `chat-bad-enum.json` i `chat-not-json.json` dają `AiInvalidOutputError` z `raw` równym treści `content`.
  - **`turns connection errors, timeouts and HTTP errors into AiUnavailableError`**: `fetch` rzuca błąd `ECONNREFUSED`, przerwany `AbortSignal` i HTTP 500.
  - W `provider.test.ts`: **`claude provider fails every call as not implemented`** oraz **`fake provider returns schema-valid data for both kinds`**.
- [ ] **Step 2: Run** `pnpm --filter server test -- src/ai`. Expected: FAIL.
- [ ] **Step 3: Implement.** Ollama woła `fetch` z `signal: AbortSignal.timeout(timeoutMs)`. Gdy pole czasu nie przyjdzie, `latencyMs` liczy z `total_duration / 1e6` albo z zegara. Odpowiedź parsuje przez `JSON.parse(message.content)` i `schema.safeParse`. Fixtures tworzysz teraz ręcznie w kształcie odpowiedzi `/api/chat`, a w Task 9 nagrasz je z prawdziwego modelu.
- [ ] **Step 4: Run** te same testy. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): AI provider interface with Ollama, fake and Claude stub`.

---

### Task 3: Serwis AI: prompty, schematy, log wywołań

**Files:**

- Create: `server/src/ai/schemas.ts`, `server/src/ai/prompts.ts`, `server/src/ai/aiService.ts`
- Test: `server/src/ai/prompts.test.ts`, `server/src/ai/aiService.test.ts`

**Interfaces:**

- Consumes: `AiProvider`, `StructuredRequest`, `AiInvalidOutputError` i `AiUnavailableError` (Task 2), modele z Task 1.
- Produces:
  - **`schemas.ts`:**
    - `analysisSchema = z.object({ priority: z.enum(['LOW','MEDIUM','HIGH','URGENT']), customerLanguage: z.string().regex(/^[a-z]{2}$/), summaryPl: z.string().min(1).max(1000), summaryEn: z.string().min(1).max(1000) })`;
    - `draftSchema = z.object({ draft: z.string().min(1).max(5000), translationPl: z.string().nullable(), translationEn: z.string().nullable() })`;
    - do każdego schematu odpowiadający mu obiekt JSON Schema (`analysisJsonSchema`, `draftJsonSchema`), napisany ręcznie albo przez `zod-to-json-schema` (decyzja buildera).
  - **`prompts.ts`:**
    - `interface TicketInput { subject: string; body: string; customerName: string | null }`;
    - `MAX_BODY_CHARS = 8000`;
    - `buildAnalysisRequest(t: TicketInput): StructuredRequest<Analysis>` z `temperature: 0`;
    - `buildDraftRequest(t: TicketInput, customerLanguage: string): StructuredRequest<Draft>` z `temperature: 0.3`.
  - **`aiService.ts`:**

    ```ts
    export interface TriageOutcome {
      suggestedPriority: TicketPriority
      customerLanguage: string
      summaryPl: string
      summaryEn: string
      draft: string
      draftTranslationPl: string | null
      draftTranslationEn: string | null
    }
    export interface InteractionEntry {
      type: AIInteractionType
      provider: string
      model: string
      prompt: string
      response: string
      inputTokens: number
      outputTokens: number
      latencyMs: number
      success: boolean
      error?: string
    }
    export async function runTriage(
      input: TicketInput,
      provider: AiProvider,
      log: (e: InteractionEntry) => Promise<void>,
    ): Promise<TriageOutcome>
    export async function triageTicket(
      ticketId: string,
      opts?: { provider?: AiProvider; userId?: string },
    ): Promise<TriageOutcome>
    ```

  - **`runTriage`:** najpierw wywołuje `analysis` (zapis w logu jako `CLASSIFICATION`), a potem `draft` (zapis jako `SUGGESTED_REPLY`). Loguje każde wywołanie, także nieudane: `raw` i `usage` bierze z `AiInvalidOutputError`, a przy `AiUnavailableError` wpisuje `response: ''` i zera. Po zalogowaniu błąd rzuca dalej. Tłumaczenie na język klienta ustawia na `null`, nawet gdy model je zwrócił.
  - **`triageTicket`:** ładuje ticket (brak ticketu daje `Error('Ticket not found')`). Woła `runTriage` z `getAiProvider()`, chyba że przekazano inny dostawca. Log zapisuje do `aIInteraction` z `ticketId` i `userId`, a `costUsd` zostaje 0.

- [ ] **Step 1: Write the failing tests:**
  - **`prompts.test.ts`:**
    - `draft prompt states the draft rules`: system zawiera zakazy obietnic, terminów, kwot i zasad firmy oraz trzy zadania szkicu, a język docelowy to `customerLanguage`;
    - `truncates long bodies`: przy treści 100 000 znaków `user.length < MAX_BODY_CHARS + 2000`;
    - `handles an empty body`: przy `body: ''` prompt jest poprawnym stringiem i nie rzuca błędu.
  - **`aiService.test.ts`:**
    - `runs analysis then draft and merges the outcome`: dostawca fake, `customerLanguage: 'de'`, wynik ma oba tłumaczenia;
    - `drops the translation into the customer language`: przy `customerLanguage: 'pl'` pole `draftTranslationPl === null`;
    - `logs a failed call` (integracyjny): fake rzuca `AiInvalidOutputError`, więc `triageTicket` odrzuca, a w bazie jest 1 interakcja z `success=false`, `provider='fake'` i niepustym `error`;
    - `logs both calls with provider and model on success` (integracyjny).
- [ ] **Step 2: Run** `pnpm --filter server test -- src/ai`. Expected: FAIL.
- [ ] **Step 3: Implement.** W treści promptu podaj: temat, nadawcę i treść maila (przyciętą z dopiskiem `[…]`). Analiza prosi o oba streszczenia, po polsku i po angielsku, oraz o język klienta jako kod ISO 639-1. Szkic prosi o tekst w języku klienta i tłumaczenia na `pl` i `en`.
- [ ] **Step 4: Run** te same testy. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): AI triage service with prompts and interaction log`.

---

### Task 4: Job `ai-triage` i podpięcie do przyjmowania maili

**Files:**

- Create: `server/src/jobs/aiTriage.ts`
- Modify: `server/src/jobs/processEmail.ts`, `server/src/index.ts`
- Test: `server/src/jobs/aiTriage.test.ts`, `server/src/jobs/processEmail.test.ts`

**Interfaces:**

- Consumes: `triageTicket` i `TriageOutcome` (Task 3), `getQueue` (`server/src/jobs/queue.ts`).
- Produces:

  ```ts
  export const AI_JOB = 'ai-triage'
  export const AI_JOB_OPTIONS = { retryLimit: 2, retryDelay: 5, retryBackoff: true } as const
  export interface AiJobData {
    ticketId: string
    userId?: string
  }
  export async function requestAiTriage(
    ticketId: string,
    userId?: string,
  ): Promise<'queued' | 'already-pending'>
  export async function handleAiJob(
    job: { data: AiJobData; retryCount: number; retryLimit: number },
    provider?: AiProvider,
  ): Promise<void>
  export async function registerAiWorker(boss: PgBoss): Promise<void>
  ```

- Behaviour:
  - **`requestAiTriage`:**
    1. Ustawia `state: 'PENDING'` przez upsert. Nie czyści wcześniejszych wyników ani `error`.
    2. Gdy wiersz już miał `PENDING`, zwraca `'already-pending'` i nie wysyła joba.
    3. W pozostałych przypadkach wysyła `boss.send(AI_JOB, data, { ...AI_JOB_OPTIONS, singletonKey: ticketId })` i zwraca `'queued'`.
  - **`handleAiJob`, sukces:** zapisuje wszystkie pola wyniku, `state: 'READY'`, `error: null` i `completedAt: now`.
  - **`handleAiJob`, błąd przy `retryCount < retryLimit`:** rzuca błąd, więc pg-boss ponawia próbę, a stan zostaje `PENDING`.
  - **`handleAiJob`, błąd przy ostatniej próbie:** zapisuje `state: 'FAILED'` i `error: err.message` (ucięte do 500 znaków), nie zmienia poprzednich wyników i kończy bez rzucania błędu.
  - **`registerAiWorker`:** wykonuje `boss.createQueue(AI_JOB)`, a potem `boss.work(AI_JOB, { includeMetadata: true }, ([job]) => handleAiJob(job))`.
  - **`process-email`:** po udanym `ticket.create` wywołuje `await requestAiTriage(ticket.id).catch(err => logger.error({ err, ticketId }, 'AI enqueue failed'))`. Przy duplikacie (P2002) nie wywołuje niczego.
  - **`index.ts`:** wywołuje `await registerAiWorker(queue)` obok `registerEmailWorker`.

- [ ] **Step 1: Write the failing tests:**
  - **`aiTriage.test.ts`** (integracyjny, handler wołany bezpośrednio z dostawcą fake):
    - `success stores results as READY`;
    - `non-final failure rethrows and keeps PENDING`;
    - `last attempt marks FAILED and keeps previous results`: wiersz `READY` z draftem, potem porażka przy `retryCount === retryLimit`, więc stan to `FAILED`, a `draft` się nie zmienia;
    - `requestAiTriage does not queue twice while PENDING`.
  - **`processEmail.test.ts`:**
    - `queues AI triage for a new ticket`: po przetworzeniu maila istnieje `ticketAiResult` ze stanem `PENDING`;
    - `ticket is created even when AI enqueue fails`: zrób `vi.spyOn` na eksporcie `requestAiTriage` i odrzuć go, a ticket i tak istnieje.

    Jeśli spy na eksporcie ESM nie zadziała, wstrzyknij `requestAiTriage` jako parametr wewnętrznej funkcji `createTicketFromEmail`.

- [ ] **Step 2: Run** `pnpm --filter server test -- jobs`. Expected: FAIL.
- [ ] **Step 3: Implement** zgodnie z opisem w Behaviour.
- [ ] **Step 4: Run** `pnpm --filter server test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): background AI triage job for new tickets`.

---

### Task 5: API: wyniki w szczegółach ticketu, ponowne liczenie, język AI na koncie

**Files:**

- Modify: `server/src/services/ticketService.ts` (`findTicketById`), `server/src/routes/tickets.ts`, `server/src/lib/auth.ts`, `server/package.json` (`express-rate-limit`)
- Create: `server/src/middleware/aiRateLimit.ts`
- Test: `server/src/routes/tickets.test.ts`, `server/src/lib/auth.test.ts`

**Interfaces:**

- Consumes: `requestAiTriage` (Task 4).
- Produces:
  - `GET /api/tickets/:id` zwraca dodatkowo pole `aiResult`: wszystkie pola `TicketAiResult` albo `null` (w `findTicketById` dodaj `include: { aiResult: true }`);
  - `POST /api/tickets/:id/ai` zwraca 202 `{ state: 'PENDING' }`, 404 dla nieznanego ticketu, 401 bez sesji i 429 `{ error: 'Too many requests' }` po 10 żądaniach na minutę od jednego użytkownika;
  - `aiRateLimit` to `rateLimit({ windowMs: 60_000, limit: 10, keyGenerator: req => req.currentUser!.id, standardHeaders: 'draft-7', legacyHeaders: false, handler })`;
  - pole Better Auth `aiLocale` (`type: ['pl','en']`, `required: false`, `input: true`) z tą samą walidacją w hooku `/update-user` co `locale` (`'Invalid aiLocale'`).

- [ ] **Step 1: Write the failing tests:**
  - **`tickets.test.ts`:**
    - `GET /:id includes aiResult (null when none, fields when present)`;
    - `POST /:id/ai queues triage and returns 202`: w bazie jest stan `PENDING`, a jobem kolejki nie trzeba się zajmować;
    - `POST /:id/ai returns 404 for an unknown ticket`;
    - `POST /:id/ai requires a session`;
    - `POST /:id/ai rate-limits per user`: osobny użytkownik dostaje 429 przy 11. żądaniu.
  - **`auth.test.ts`:**
    - `update-user accepts aiLocale pl/en`;
    - `update-user rejects aiLocale de`.
- [ ] **Step 2: Run** `pnpm --filter server test -- tickets auth`. Expected: FAIL.
- [ ] **Step 3: Implement.** Uruchom `pnpm --filter server add express-rate-limit`. Endpoint wywołuje `requestAiTriage(id, req.currentUser.id)` i oba wyniki (`'queued'` i `'already-pending'`) kończy odpowiedzią 202.
- [ ] **Step 4: Run** `pnpm --filter server test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): AI results in ticket detail, re-run endpoint and AI language setting`.

---

### Task 6: Klient: dane, odpytywanie i ustawienie języka AI

**Files:**

- Modify:
  - `client/src/lib/tickets-api.ts`, `client/src/hooks/useTickets.ts`, `client/src/lib/auth-client.ts`;
  - `client/src/hooks/useLanguage.ts`, `client/src/components/layout/UserMenu.tsx`;
  - `client/src/locales/pl.json`, `client/src/locales/en.json`.
- Create: `client/src/lib/ai.ts`
- Test: `client/src/lib/ai.test.ts`, `client/src/hooks/useTickets.test.tsx`, `client/src/hooks/useLanguage.test.tsx`, `client/src/components/layout/AppShell.test.tsx` (menu)

**Interfaces:**

- Produces:
  - `tickets-api.ts`:
    - `type AiState = 'PENDING' | 'READY' | 'FAILED'`;
    - `interface TicketAiResult` z polami jak w Task 1 (daty jako `string`);
    - w `TicketDetail` pole `aiResult: TicketAiResult | null`;
    - `requestAi(id: string): Promise<void>`.
  - `useTickets.ts`:
    - `AI_POLL_MS = 3000`;
    - `useTicket` dostaje `refetchInterval: q => (q.state.data?.aiResult?.state === 'PENDING' ? AI_POLL_MS : false)`;
    - `useRequestAi(id: string)` to mutacja, która unieważnia `['tickets','detail',id]`.
  - `ai.ts`:
    - `aiLanguage(user: SessionUser | null | undefined): AppLanguage`, czyli `user?.aiLocale ?? currentLanguage()`;
    - `summaryFor(r: TicketAiResult, lng: AppLanguage): string | null`;
    - `draftTranslationFor(r: TicketAiResult, lng: AppLanguage): string | null` (zwraca `null`, gdy `r.customerLanguage === lng`);
    - `hasResults(r: TicketAiResult | null): boolean` (`completedAt !== null`).
  - `useLanguage.ts`: `useChangeAiLanguage(): { change: (lng: AppLanguage) => Promise<void>; error: boolean }`. Zapisuje przez `updateUser({ aiLocale })` i kolejkuje zapisy tak samo jak `useChangeLanguage`.
  - `auth-client.ts`: pole `aiLocale: { type: ['pl','en'], required: false }`.
  - `UserMenu`: druga grupa radio pod etykietą `language.aiLabel` („Język AI” / „AI language”) z wartością `aiLanguage(user)`.

- [ ] **Step 1: Write the failing tests:**
  - **`ai.test.ts`:**
    - `aiLanguage prefers aiLocale over the UI language`;
    - `draftTranslationFor hides the translation in the customer's language`;
    - `summaryFor picks the language`.
  - **`useTickets.test.tsx`:** `polls while AI is PENDING and stops when READY` (fake timers, 2 odpowiedzi mocka).
  - **`useLanguage.test.tsx`:** `useChangeAiLanguage saves aiLocale without changing the UI language`.
  - **Test menu:** `user menu changes AI language independently of UI language`.
- [ ] **Step 2: Run** `pnpm --filter client test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter client test` i `pnpm typecheck`. Expected: PASS. Test zgodności kluczy PL i EN w `locales.test.ts` też przechodzi.
- [ ] **Step 5: Commit** `feat(client): AI result data, polling and AI language setting`.

---

### Task 7: Klient: AI w panelu ticketu (wariant C)

**Files:**

- Create: `client/src/components/tickets/AiSummary.tsx`, `client/src/components/tickets/AiDraft.tsx`
- Modify: `client/src/components/tickets/TicketPanel.tsx`, `TicketControls.tsx`, `ReplyForm.tsx`, `client/src/locales/{pl,en}.json`
- Test: `client/src/components/tickets/TicketPanel.test.tsx`, `ReplyForm.test.tsx`

**Interfaces:**

- Consumes: `useRequestAi`, `aiLanguage`, `summaryFor`, `draftTranslationFor`, `hasResults` (Task 6), `useUpdateTicket` (istniejący), `useSession` (`auth-client`).
- Produces:
  - **`AiSummary({ ticket }: { ticket: TicketDetail })`:** karta `CARD` między nagłówkiem a `TicketThread`.
  - **`AiDraft({ result, onUse }: { result: TicketAiResult; onUse: (text: string) => void })`.**
  - **`ReplyForm`** dostaje opcjonalny prop `aiDraft?: TicketAiResult | null`. `TicketPanel` przekazuje `ticket.replies.length === 0 ? ticket.aiResult : null`.
  - **`TicketControls`** pod siatką pokazuje propozycję priorytetu, gdy `hasResults(ai) && ai.suggestedPriority && ai.suggestedPriority !== ticket.priority`. Tekst: `ai.priority.suggestion` („AI proponuje: {{priority}}”), a przycisk `ai.priority.apply` („Zastosuj”) wywołuje `mutate({ priority })`.
- **Stany `AiSummary`** (klucze i18n pod `ai.*`):

  | Warunek                  | Widok                                                                                   |
  | ------------------------ | --------------------------------------------------------------------------------------- |
  | `aiResult === null`      | tekst `ai.none` + przycisk `ai.analyze` („Analizuj”)                                    |
  | `PENDING` i brak wyników | `role="status"`: `ai.pending` („AI analizuje…”)                                         |
  | `FAILED` i brak wyników  | `role="alert"`: `ai.unavailable` („AI niedostępne”) + `common.retry`                    |
  | są wyniki                | streszczenie w `aiLanguage(user)` + przycisk `ai.regenerate` („Wygeneruj ponownie”)     |
  | są wyniki i `PENDING`    | jak wyżej + `role="status"` `ai.regenerating`, przycisk wyłączony                       |
  | są wyniki i `FAILED`     | jak wyżej + `role="alert"` `ai.regenerateFailed` („Nie udało się wygenerować ponownie”) |

- **`AiDraft`:**
  - pokazuje szkic i, jeśli `draftTranslationFor` nie zwróci `null`, tłumaczenie z etykietą `ai.draft.translation`;
  - ma przycisk `ai.draft.use` („Użyj szkicu”);
  - w `ReplyForm` kliknięcie wywołuje `onUse`, a ten, gdy `text.trim() !== ''`, najpierw pyta `window.confirm(t('ai.draft.replaceConfirm'))`, a po „Anuluj” nic nie zmienia.

- [ ] **Step 1: Write the failing tests:**
  - **`TicketPanel.test.tsx`:**
    - `shows the summary in the agent's AI language`;
    - `shows "AI analizuje…" while pending without results`;
    - `shows "AI niedostępne" with retry when failed`;
    - `keeps old results visible while regenerating`;
    - `shows the priority suggestion only when it differs and applies it via PATCH`;
    - `hides the draft once the ticket has a reply`;
    - `hides the translation when the customer writes in the agent's AI language`.
  - **`ReplyForm.test.tsx`:**
    - `"Użyj szkicu" fills an empty field`;
    - `asks before replacing typed text`: przy `confirm` zwracającym `false` tekst się nie zmienia, a przy `true` jest zastąpiony.
- [ ] **Step 2: Run** `pnpm --filter client test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Wyróżnij bloki AI tak jak w makiecie C: przerywana ramka w kolorze fioletowym z palety Tailwind i ikona `Sparkles` z `lucide-react`. Kliknięcie w obszarze 44 px dotyczy też mobile.
- [ ] **Step 4: Run** `pnpm --filter client test`, `pnpm lint` i `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): AI summary, priority suggestion and reply draft in the ticket panel`.

---

### Task 8: E2E z gotowymi wynikami AI z seeda

**Files:**

- Modify: `server/prisma/e2e-fixtures.ts`, `e2e/fixtures/tickets.ts`, `e2e/fixtures/users.ts`
- Create: `e2e/tests/ai.spec.ts`, `e2e/api/ai.api.spec.ts`

**Interfaces:**

- **Seed:**
  - nowe tickety mają klientów z domeną `@ai.example`, a nie `klient.example`, żeby nie trafiały do `E2E_SEARCH` ani do testu paginacji (patrz #19);
  - `ai-ready`: priorytet `MEDIUM`, wynik `READY`, `suggestedPriority: 'URGENT'`, `customerLanguage: 'de'`, szkic po niemiecku, streszczenia PL i EN, tłumaczenia PL i EN;
  - `ai-failed`: wynik `FAILED` bez wcześniejszych wyników;
  - `ai-pending`: wynik `PENDING` bez wyników;
  - nowy użytkownik `e2e-ai@helpdesk.local` („Alicja Ai”).
- **`e2e/fixtures/tickets.ts`:** `AI_TICKETS` (klucze `ready`, `failed`, `pending`) i `AI_SEARCH = 'ai.example'`.
- **`e2e/fixtures/users.ts`:** `USERS.ai`.

- [ ] **Step 1: Write the tests.** Każdy `expect` ma polski opis, a Page Objects używają `@step`.
  - **`ai.spec.ts`:**
    - `AI1 streszczenie w języku AI agenta, niezależnie od języka interfejsu`: użytkownik `e2e-ai` loguje się, ustawia UI na EN, a AI na PL, i widzi streszczenie PL;
    - `AI2 propozycja priorytetu: Zastosuj zmienia priorytet i historię`: test zaczyna od `PATCH priority: MEDIUM` przez API, żeby dało się go powtórzyć;
    - `AI3 Użyj szkicu wypełnia formularz, tłumaczenie widoczne`;
    - `AI4 stany: AI analizuje… i AI niedostępne`.
  - **`ai.api.spec.ts`:**
    - `A1 GET /api/tickets/:id zwraca aiResult`;
    - `A2 POST /api/tickets/:id/ai bez sesji: 401`;
    - `A3 POST dla nieznanego id: 404`.

  Testy e2e nie klikają „Analizuj” ani „Spróbuj ponownie” i nie wysyłają `POST` dla istniejącego ticketu, bo to wołałoby prawdziwą Ollamę.

- [ ] **Step 2: Run** `pnpm --filter server e2e:fixtures seed`, a potem `E2E_HEADLESS=true pnpm e2e`. Expected: nowe testy PASS i zero regresji. Liczniki fixture'ów w istniejących testach się nie zmieniają, bo `@ai.example` nie pasuje do `E2E_SEARCH`.
- [ ] **Step 3: Commit** `test(e2e): AI panel and AI API with seeded results`.

---

### Task 9: Prawdziwy model: skrypt, nagrane fixtures, dokumentacja, ręczna ocena

**Files:**

- Create:
  - `server/scripts/ai-try.ts`;
  - `server/src/__fixtures__/ai-samples/{pl-printer,en-invoice,de-return}.json` (każdy plik to `TicketInput`).
- Modify:
  - `server/package.json` (skrypt `ai:try`);
  - `server/src/__fixtures__/ollama/chat-ok.json` (nagrany);
  - `README.md`, `tech-stack.md`;
  - `.env.example`: tylko za zgodą użytkownika.

**Interfaces:**

- Consumes: `runTriage` (Task 3), `createOllamaProvider` z wstrzykiwanym `fetch` (Task 2).
- Produces: `pnpm --filter server ai:try [--record]`. Uruchamia `runTriage` na próbkach i wypisuje wynik oraz metryki. Z flagą `--record` zapisuje surową odpowiedź `/api/chat` dla `analysis` z `pl-printer` jako `chat-ok.json`.

- [ ] **Step 1:** Zaimplementuj skrypt (`tsx --env-file=../.env`, log do konsoli zamiast do bazy).
- [ ] **Step 2: Run** `pnpm --filter server ai:try`. Model musi być pobrany (`ollama list` pokazuje `qwen3.8:27b-q4_K_M`). Expected: dla 3 próbek poprawny JSON, `customerLanguage` odpowiednio `pl`, `en` i `de`, a szkice bez obietnic i zasad firmy. Wynik pokaż użytkownikowi do ręcznej oceny jakości, bo to kryterium akceptacji ze specu. Jeśli jakość jest zła, popraw prompty z Task 3 i powtórz.
- [ ] **Step 3: Run** `pnpm --filter server ai:try --record`, a potem `pnpm --filter server test -- src/ai`. Expected: PASS na nagranej odpowiedzi.
- [ ] **Step 4: Docs:**
  - README dostaje sekcję „AI (Ollama)”: instalacja (`brew install ollama`), `ollama pull qwen3.8:27b-q4_K_M`, mały `qwen3:8b` do dev, uwaga, że warianty MLX i `nvfp4` nie obsługują wymuszonego JSON-a, zmienne env z Global Constraints oraz co widać przy `AI_PROVIDER=claude`;
  - `tech-stack.md`: sekcja AI wskazuje Ollamę jako domyślną, Claude jako przyszłą opcję i odsyła do ADR-0017;
  - zmianę w `.env.example` zaproponuj użytkownikowi.
- [ ] **Step 5: Verification:** `pnpm typecheck && pnpm lint && pnpm format:check`, `pnpm --filter server test`, `pnpm --filter client test` i `E2E_HEADLESS=true pnpm e2e`. Expected: wszystko zielone.
- [ ] **Step 6: Ręczny test w aplikacji:** wyślij mail testowy przez webhook (sposób z README) przy działającej Ollamie. Po kilkudziesięciu sekundach panel pokazuje wyniki. Następnie zatrzymaj Ollamę, wyślij drugi mail i sprawdź, że ticket powstał, a panel po próbach pokazuje „AI niedostępne”.
- [ ] **Step 7: Commit** `docs(ai): Ollama setup, recorded fixtures and AI try script`, a potem otwórz PR z `Closes #20` i assignee `@me`.
