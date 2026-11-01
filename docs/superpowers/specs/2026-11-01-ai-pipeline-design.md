# Design: AI pipeline (Plan 07)

**Data:** 2026-11-01
**Status:** Zaakceptowany przez użytkownika (2026-11-01). Decyzja o dostawcy AI: ADR-0017
**Issue:** #20

## Kontekst i cel

Maile od klientów przychodzą webhookiem Postmark. Job pg-boss `process-email` (`server/src/jobs/processEmail.ts`) zamienia je w tickety. Agenci pracują w panelu ticketu (`client/src/components/tickets/TicketPanel.tsx`):

- nagłówek z `TicketControls` (status, priorytet, przypisanie);
- `TicketThread`;
- `ReplyForm`.

Odpowiedź agenta zapisuje się w wątku. Wysyłka maila to Plan 08.

**Moment użytkownika (jego słowa):** przychodzi nowy mail, agent otwiera ticket i od razu chce dostać streszczenie, priorytet i propozycję odpowiedzi do edycji.

Cel Planu 07: zanim agent otworzy nowy ticket, AI policzy w tle trzy rzeczy:

1. streszczenie;
2. propozycję priorytetu;
3. szkic pierwszej odpowiedzi.

AI tylko podpowiada. Każdą zmianę i każdą wysyłkę wykonuje agent.

**Miara sukcesu (słowa użytkownika):** funkcja jest porażką, gdy szkic jest bez sensu i trzeba go pisać od nowa.

Stary `plans/07-ai-pipeline.md` (tylko Claude, tool use) to wyłącznie materiał wejściowy.

## Co już jest

- **Prisma:**
  - enum `AIInteractionType` (`CLASSIFICATION`, `SUMMARY`, `SUGGESTED_REPLY`, `EMBEDDING`);
  - model `AIInteraction` (`ai_interactions`) z polami `ticketId?`, `prompt`, `response`, `inputTokens`, `outputTokens`, `costUsd`, `latencyMs`, `createdAt`;
  - na `Ticket` nieużywane kolumny `summary` i `category`;
  - `TicketHistory.userId` jest opcjonalne.
- **`User.locale`** (`pl` | `en`) to język interfejsu. Jest polem dodatkowym Better Auth (`server/src/lib/auth.ts`, walidacja `SUPPORTED_LOCALES`), a klient zmienia go przez `updateUser` (`client/src/hooks/useLanguage.ts`).
- **Env walidowane Zodem** w `server/src/env.ts` (ADR-0009). `ANTHROPIC_API_KEY` jest już opcjonalne.
- **Kolejka** to singleton pg-boss (`server/src/jobs/queue.ts`), a workery rejestruje `server/src/index.ts`.
- **Wzorce serwera:**
  - `requireAuth`, `safeParse` Zodem, 422 przy błędzie walidacji;
  - błędy domenowe obsługuje `errorHandler`;
  - logika w `services/`.
- **Testy:**
  - vitest i testcontainers (`server/src/test/setup.ts`);
  - supertest z helperem sesji `server/src/test/auth.ts`;
  - fixtures w `server/src/__fixtures__/`;
  - Playwright e2e w `e2e/` (UI i API).
- **Zod w serwerze w wersji 3** (`^3.24.1`).
- **Ollama 0.32.15** działa lokalnie, a model `qwen3.8:27b-mlx` jest w trakcie pobierania (tag istnieje w rejestrze). `express-rate-limit` nie jest zainstalowany.

## Cele

1. **AI w tle dla każdego nowego ticketu** (decyzja użytkownika). Po utworzeniu ticketu w `process-email` trafia do kolejki job AI. Agent otwiera ticket i wyniki już czekają.
2. **Streszczenie** w języku agenta.
3. **Propozycja priorytetu** (`LOW` | `MEDIUM` | `HIGH` | `URGENT`) obok pola priorytetu z przyciskiem „Zastosuj” (decyzja użytkownika).
   - AI nigdy sama nie zmienia priorytetu.
   - „Zastosuj” wywołuje istniejący `PATCH /api/tickets/:id`, więc historia zapisuje agenta jako autora.
   - AI nie proponuje statusu (decyzja użytkownika).
4. **Szkic pierwszej odpowiedzi** w języku klienta (decyzja użytkownika). Pokazuje się nad pustym `ReplyForm` z przyciskiem „Użyj szkicu”, który wstawia tekst do formularza (wariant C z makiety, decyzja użytkownika). Agent go poprawia i wysyła sam.
5. **Tłumaczenie szkicu** na język agenta, pokazane obok szkicu, żeby agent wiedział, co wysyła (decyzja użytkownika). Gdy klient pisze w języku agenta, tłumaczenia nie pokazujemy.
6. **Nowe ustawienie konta „język AI”**: `pl` albo `en` (decyzja użytkownika: wystarczą te dwa).
   - Działa niezależnie od języka interfejsu.
   - Steruje językiem streszczenia i tłumaczenia szkicu.
   - Agent zmienia je w menu konta.
7. **Obie wersje językowe liczone w tle.** Streszczenie i tłumaczenie powstają po polsku i po angielsku, bo w chwili liczenia nie wiadomo, który agent weźmie ticket.
8. **Dostawca AI za wspólnym interfejsem.**
   - Domyślnie lokalna Ollama (wymaganie użytkownika: kontrola kosztów; dane klientów nie opuszczają maszyny).
   - Claude dostaje tylko przygotowane miejsce: wartość konfiguracji i szkielet adaptera bez implementacji (decyzja użytkownika). Podłączymy go później.
9. **Log każdego wywołania** w `ai_interactions`, także nieudanego, z dostawcą, modelem i wynikiem.
10. **ADR-0017**: wybór dostawcy AI (Ollama domyślnie, interfejs dostawcy, Claude później).

## Zawartość szkicu odpowiedzi (decyzja użytkownika)

Szkic robi tylko trzy rzeczy:

1. uprzejmie potwierdza przyjęcie zgłoszenia;
2. krótko powtarza problem klienta;
3. dopytuje o brakujące informacje.

Szkic nie obiecuje terminów, zwrotów ani kwot i nie podaje zasad ani procedur firmy, bo AI ich nie zna. Baza wiedzy (Plan 10) jest pominięta.

Prompt musi to wymuszać. To główne ryzyko jakości.

## Poza zakresem (non-goals)

- Wysyłka maila do klienta (Plan 08). Szkic to tylko tekst do formularza.
- Automatyczna zmiana priorytetu lub statusu przez AI.
- Kategoria ticketu (`Ticket.category` zostaje nieużywane).
- Działająca integracja z Claude.
- Ponowne liczenie po odpowiedzi agenta. AI liczy tylko przy nowym tickecie lub na prośbę agenta (przycisk ponowienia).
- Więcej języków AI niż PL i EN.
- Baza wiedzy, embeddingi, RAG.
- Streaming odpowiedzi modelu (SSE).
- **Produkcja** (decyzja użytkownika: na razie tylko lokalnie). Plan 07 działa na maszynie dewelopera z lokalną Ollamą. Wdrożenie (Railway z `tech-stack.md`) i źródło AI na produkcji, czyli zdalna Ollama albo Claude, ustali osobny plan. Env nie wymusza ustawień AI dla `NODE_ENV=production`. ADR-0017 zapisuje to jako otwartą konsekwencję.

## Anty-cele

- Szkic, który trzeba pisać od nowa: ogólnik, zmyślone fakty albo obietnice.
- AI zmienia coś w tickecie bez kliknięcia agenta.
- Awaria AI blokuje przyjęcie maila. Ticket musi powstać zawsze, także gdy Ollama nie działa.

## Zachowanie

### Przepływ w tle

1. `process-email` tworzy ticket. Po udanym `create` zakłada stan AI „liczy się” i wysyła job AI z `ticketId`. Przy duplikacie maila (P2002) nie wysyła niczego.
2. Worker AI czyta ticket i woła model. Wynik zawiera:
   - priorytet;
   - kod języka klienta;
   - szkic w języku klienta;
   - streszczenie PL i EN;
   - tłumaczenie szkicu na PL i EN.

   Pomija tłumaczenie na język, w którym jest już szkic.

3. Odpowiedź przechodzi walidację Zoda przed zapisem do bazy. Niepoprawna odpowiedź modelu nie trafia do wyników.
4. Sukces zapisuje wyniki i stan „gotowe”. Każde wywołanie modelu trafia do `ai_interactions`.
5. Błąd (Ollama niedostępna, timeout, zły JSON) uruchamia ponowienie przez pg-boss: 2–3 próby z odstępem. Po ostatniej próbie zapisuje się stan „nieudane” z krótkim opisem błędu (moja decyzja).

### Panel ticketu (wariant C)

- **Stan „liczy się”:** w miejscu wyników widać „AI analizuje…”. Klient odpytuje ticket co kilka sekund, dopóki stan się nie zmieni (moja decyzja: `refetchInterval` w TanStack Query, bez SSE).
- **Stan „gotowe”:**
  - **Streszczenie** na górze wątku, w języku AI agenta.
  - **Propozycja priorytetu** obok pola priorytetu z przyciskiem „Zastosuj”. Widać ją tylko wtedy, gdy różni się od obecnego priorytetu (moja decyzja).
  - **Szkic** nad pustym formularzem odpowiedzi, z tłumaczeniem obok i przyciskiem „Użyj szkicu”. „Użyj szkicu” nie nadpisuje bez pytania tekstu, który agent już wpisał (moja decyzja: potwierdzenie przy niepustym polu).
  - **Szkic i jego tłumaczenie są widoczne tylko wtedy, gdy ticket nie ma jeszcze żadnej odpowiedzi agenta.** Po pierwszej wysłanej odpowiedzi znikają, żeby nie została nieaktualna podpowiedź (decyzja użytkownika). Streszczenie i propozycja priorytetu zostają.
- **„Wygeneruj ponownie” w stanie „gotowe”** (decyzja użytkownika). Przycisk przelicza wszystkie wyniki ticketu.
  - W trakcie liczenia stare wyniki, w tym szkic, zostają widoczne (decyzja użytkownika). Obok jest wskaźnik, że liczy się nowa wersja (moja decyzja).
  - Po sukcesie nowe wyniki zastępują stare.
  - Po porażce stare wyniki zostają, a obok pojawia się komunikat „Nie udało się wygenerować ponownie” (moja decyzja).
- **Stan „nieudane” bez wcześniejszych wyników:** komunikat „AI niedostępne” i przycisk „Spróbuj ponownie”, który ponownie wysyła job.
- **Ticket bez wyników** (utworzony przed tą funkcją): przycisk „Analizuj”, działający tak samo jak „Spróbuj ponownie” (moja decyzja).
- Wszystkie teksty UI idą przez i18n w PL i EN, tak jak reszta panelu.

### Ustawienie „język AI”

- Nowe pole użytkownika (np. `aiLocale`: `pl` | `en`), dodane jako pole Better Auth tak samo jak `locale` i z tą samą walidacją.
- Gdy pole jest puste, obowiązuje język interfejsu (moja decyzja).
- Agent zmienia je w menu konta (`UserMenu`), obok wyboru języka interfejsu.

## Konfiguracja (env, walidowane Zodem)

- `AI_PROVIDER`: `ollama` (domyślnie) | `claude` | `fake` (testy integracyjne, deterministyczne odpowiedzi).
  - `claude` to tylko szkielet. Serwer startuje normalnie, a każde liczenie kończy się błędem „not implemented”, więc ticket dostaje stan „nieudane” (moja decyzja; AI nie może blokować przyjmowania maili).
- `OLLAMA_HOST`: domyślnie `http://localhost:11434`.
- `OLLAMA_MODEL`: domyślnie `qwen3.8:27b-mlx`. Zapasowo `qwen3.8:27b`, a do szybkiego dev mniejszy model, np. `qwen3:8b`.
- `AI_TIMEOUT_MS`: limit czasu jednego wywołania. Domyślnie hojny (np. 120 s), bo zimny start modelu 27B trwa długo.

Nazwy i wartości domyślne są moją decyzją. README opisuje instalację Ollamy, pobranie modelu i te zmienne.

## Fakty o Ollamie (rozpoznanie, dokumentacja `/ollama/ollama`)

- **Strukturalne wyjście:** `/api/chat` z `stream: false` i `format` jako obiektem JSON Schema. Wynik przychodzi jako string JSON w `message.content`, więc trzeba go sparsować i zwalidować Zodem. Zalecane `options.temperature: 0` (dla klasyfikacji; szkic może mieć wyższą temperaturę, to do ustalenia przez buildera).
- **Rozumowanie:** `think: false` dla JSON-a. Rozumowanie qwen3 nie miesza się wtedy z odpowiedzią i oszczędza tokeny.
- **Metryki:**
  - `prompt_eval_count` mapuje się na `inputTokens`, `eval_count` na `outputTokens`;
  - czasy (`total_duration`, `load_duration`) są w nanosekundach;
  - pola mogą nie przyjść, wtedy fallback 0;
  - koszt modelu lokalnego to `costUsd = 0`.

## Zmiany w danych

- **Wyniki AI:** osobna tabela 1:1 z ticketem (moja decyzja; nie rozbudowujemy `Ticket`, bo wyników jest kilka, mają dwie wersje językowe i stan). Przechowuje:
  - stan (liczy się / gotowe / nieudane) i opis błędu;
  - proponowany priorytet;
  - język klienta;
  - szkic;
  - streszczenie PL i EN;
  - tłumaczenie szkicu PL i EN;
  - czas zakończenia.

  Stan bieżącej pracy jest zapisany osobno od ostatnich udanych wyników. Rozpoczęcie przeliczenia ani porażka ich nie kasują, a nadpisuje je dopiero nowy udany wynik. Wynika to z „Wygeneruj ponownie”, przy którym stary szkic zostaje widoczny. `Ticket.summary` zostaje nieużywane.

- **`ai_interactions` dostaje nowe pola:** dostawca, model, sukces lub błąd z opisem. `userId` jest opcjonalne i wypełnione, gdy ponowienie zlecił agent.
- Migracja przez `prisma migrate diff` (`migrate dev` nie działa w nieinteraktywnej powłoce).

## API

- `GET /api/tickets/:id` zwraca także wyniki AI ticketu (lub `null`).
- `POST /api/tickets/:id/ai` zleca ponowne liczenie (stan „liczy się” plus job). Ma limit żądań na użytkownika, `express-rate-limit` (moja decyzja co do liczb, np. 10 na minutę). Gdy praca dla ticketu już trwa, nie dubluje joba.
- Wszystko za `requireAuth`. Agent i admin mają te same uprawnienia (różnice to Plan 09).

## Testy

- **Unit:**
  - budowanie promptu;
  - mapowanie odpowiedzi Ollamy na wynik i metryki;
  - walidacja Zod: zły JSON, wartość spoza enuma, brak pola.

  Wszystko na nagranych odpowiedziach `/api/chat` w `server/src/__fixtures__/ollama/`. Testy nie wołają prawdziwego modelu.

- **Adapter Ollamy:** timeout, `ECONNREFUSED`, odpowiedź HTTP z błędem. Każdy z tych przypadków daje błąd domenowy i wpis w `ai_interactions`.
- **Integracja** (testcontainers): `process-email` zakłada job; worker z dostawcą `fake` zapisuje wyniki; nieudane wywołanie zostawia stan „nieudane”, a ticket istnieje.
- **Klient (vitest):** stany panelu (liczy się / gotowe / nieudane / brak), „Zastosuj” priorytet, „Użyj szkicu” (puste i niepuste pole), ukrywanie tłumaczenia przy tym samym języku, ustawienie języka AI.
- **E2E (Playwright)** (moja decyzja): seed `server/prisma/e2e-fixtures.ts` zapisuje gotowe wyniki AI dla wybranych ticketów testowych. Testy e2e nie wołają więc modelu, a konfiguracja serwera e2e (`pnpm dev`, `reuseExistingServer`) zostaje bez zmian. Testy e2e nie klikają „Analizuj” ani „Spróbuj ponownie”, bo to wołałoby prawdziwą Ollamę.

  Ścieżka: ticket z fixture'u, potem panel ze streszczeniem; „Zastosuj” przy priorytecie zmienia priorytet i historię; „Użyj szkicu” wypełnia formularz. Do tego zmiana języka AI oraz stany „nieudane” i „liczy się” z danych seeda. Pełną ścieżkę kolejki i workera pokrywają testy integracyjne z dostawcą `fake`.

- **Jakość szkicu na prawdziwym modelu** to ręczne sprawdzenie na kilku przykładowych mailach (PL, EN, DE) przed zakończeniem planu. Ewaluacje promptfoo to Plan 12.

## Kryteria akceptacji

- [ ] Nowy mail daje ticket. Bez kliknięcia agenta pojawiają się streszczenie, propozycja priorytetu i szkic.
- [ ] Gdy Ollama nie działa, ticket i tak powstaje, a panel pokazuje „AI niedostępne” z ponowieniem.
- [ ] Priorytet zmienia się tylko po „Zastosuj”, a historia zapisuje agenta.
- [ ] Szkic jest w języku klienta, a tłumaczenie i streszczenie w języku AI agenta (PL/EN, niezależnie od języka interfejsu). Tłumaczenia nie ma, gdy języki są te same.
- [ ] Szkic tylko potwierdza, powtarza problem i dopytuje. Nie zawiera obietnic ani zasad firmy (ręczne sprawdzenie na przykładach).
- [ ] Każde wywołanie modelu jest w `ai_interactions` z dostawcą, modelem, tokenami, czasem i wynikiem. Dla Ollamy `costUsd = 0`.
- [ ] `AI_PROVIDER=claude` daje czytelny błąd „not implemented”, a zmiana dostawcy to tylko env.
- [ ] Testy nie wołają prawdziwego modelu. Przechodzą `pnpm typecheck`, `pnpm lint`, testy server i client oraz `pnpm e2e`.
- [ ] README (Ollama, model, env) i ADR-0017 są gotowe.

## Zostawione builderowi

- Liczba i podział wywołań modelu: jedno wywołanie zwracające wszystko albo osobne (np. klasyfikacja + streszczenia oraz szkic + tłumaczenia). Rozstrzyga jakość na prawdziwym modelu.
- Generowanie JSON Schema z Zoda 3 (np. `zod-to-json-schema`) albo schemat pisany ręcznie.
- Klient HTTP do Ollamy: `fetch` czy pakiet `ollama`.
- Dokładne liczby: ponowienia, timeout, limit żądań, interwał odpytywania.
- Treść promptów (z zachowaniem zasad szkicu).
