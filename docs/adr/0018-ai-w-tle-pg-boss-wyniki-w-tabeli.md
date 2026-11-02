# ADR-0018: AI liczone w tle przez pg-boss, wyniki w osobnej tabeli ze stanem

- **Status:** Zaakceptowany
- **Retrospektywny:** nie
- **Data decyzji:** 2026-11-01 (źródło: spec Planu 07 i rozstrzygnięcia z implementacji)
- **Data spisania:** 2026-11-01
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Użytkownik chce, żeby streszczenie, propozycja priorytetu i szkic odpowiedzi czekały gotowe, gdy agent otwiera nowy ticket. Lokalny model 27B potrzebuje na jeden ticket 33–47 s. Przyjęcie maila nie może zależeć od AI. Podczas ponownego liczenia agent ma widzieć stare wyniki (decyzja użytkownika). Kolejka pg-boss już obsługuje maile (ADR-0003).

## Decyzja

- **Kolejka:** po utworzeniu ticketu job `process-email` zleca job `ai-triage` w pg-boss. Ten sam job uruchamia przycisk „Analizuj” lub „Wygeneruj ponownie” (`POST /api/tickets/:id/ai`, limit 10 na minutę na użytkownika).
- **Wyniki:** trafiają do tabeli `ticket_ai_results` (1:1 z ticketem, usuwane kaskadowo). Tabela przechowuje stan pracy (`PENDING` | `READY` | `FAILED`) osobno od ostatnich udanych wyników.
- **Ponowienia:** job ponawia próbę 2 razy. Po ostatniej porażce stan to `FAILED`, a wcześniejsze wyniki zostają.
- **Zabezpieczenia przed zawieszeniem:**
  - błąd przy wrzucaniu joba do kolejki od razu daje `FAILED`;
  - `PENDING` starszy niż 15 minut można zlecić ponownie.
- **Klient** odpytuje ticket co 3 s, dopóki stan to `PENDING`.

## Rozważane opcje

- **Liczenie na kliknięcie agenta (synchroniczny HTTP):** odrzucone, bo użytkownik chce, żeby wyniki czekały gotowe, a jedno liczenie trwa kilkadziesiąt sekund.
- **Kolumny w `Ticket`** (`summary` już istniała): odrzucone, bo wyników jest kilka, mają dwie wersje językowe i stan.
- **SSE zamiast odpytywania:** odłożone, bo spec wyklucza streaming.

## Konsekwencje

**Pozytywne**

- Mail zawsze tworzy ticket. Błąd AI lub kolejki AI jest tylko logowany.
- Stan żadnego ticketu nie zostaje na zawsze w „AI analizuje…”.
- Nieudane ponowne liczenie nie kasuje dobrych wyników.

**Negatywne / koszty**

- Wyniki pojawiają się dopiero po kilkudziesięciu sekundach od przyjścia maila.
- Odpytywanie co 3 s generuje dodatkowe żądania, dopóki trwa liczenie [wniosek].
- Limit żądań działa w pamięci procesu, więc przy kilku instancjach serwera każda liczy go osobno [wniosek].
- `singletonKey` w jobie niczego nie deduplikuje w kolejce typu `standard`. Duplikaty blokuje stan w tabeli.

**Niewiadome**

- Zachowanie przy dużej liczbie maili naraz. Model liczy jeden ticket po drugim, więc kolejka może urosnąć.

## Dowody

- `docs/superpowers/specs/2026-11-01-ai-pipeline-design.md` – cele 1–7, sekcje „Przepływ w tle”, „Zmiany w danych”, „API”
- `d9cb2e4` – tabela `ticket_ai_results` i stany
- `5cf1d2f`, `b22429f`, `35431f6` – job `ai-triage`, `FAILED` przy błędzie kolejki, ponowne zlecenie `PENDING` po 15 min
- `3f0841a` – `POST /api/tickets/:id/ai` z limitem żądań
- `server/src/jobs/aiTriage.ts`, `server/src/jobs/processEmail.ts`, `client/src/hooks/useTickets.ts` (`AI_POLL_MS`)
- `pnpm --filter server ai:try` z 2026-11-01 (3 próbki PL/EN/DE): 33–47 s na ticket; README, sekcja „AI (Ollama)”
