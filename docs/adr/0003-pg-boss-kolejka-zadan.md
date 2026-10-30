# ADR-0003: Kolejka zadań pg-boss w PostgreSQL do asynchronicznego przetwarzania

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-04-23 (źródło: commit `d1441c4`); wdrożenie 2026-05-13 (`9d8c4bf`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

`tech-stack.md` zakłada ok. 2000 e-maili dziennie. Webhook przychodzącej poczty musi odpowiadać natychmiast, a przetwarzanie (zapis ticketu, później AI) ma działać asynchronicznie.

## Decyzja

pg-boss jako kolejka zadań, przechowywana w tej samej bazie PostgreSQL (ADR-0002). Webhook waliduje payload, wrzuca zadanie `EMAIL_JOB` i od razu zwraca odpowiedź. Ticket tworzy worker.

## Rozważane opcje

Brak zapisu o rozważanych alternatywach.

## Konsekwencje

**Pozytywne**

- Brak dodatkowej infrastruktury (np. osobnego brokera); kolejka korzysta z istniejącego Postgresa.
- Zachowanie kolejki (idempotencja, retry, współbieżność, zawieszone zadania) jest pokryte testami integracyjnymi na prawdziwej bazie.

**Negatywne / koszty**

- Obciążenie kolejką trafia do tej samej bazy co dane aplikacji.
- Wymagane łagodne zamykanie: kolejka zatrzymywana dopiero po opróżnieniu serwera HTTP (`75d874c`).

**Niewiadome**

- Zachowanie przy docelowym ruchu nie było mierzone.

## Dowody

- `d1441c4` – `tech-stack.md`: „Job queue is required — at 2000 emails/day, inbound webhook must return 200 immediately”, „pg-boss — job queue … (stored in Postgres)”
- `9d8c4bf`, `376d062`, `75d874c` – singleton kolejki, graceful shutdown
- `0f76541` – testy: idempotencja, retry, współbieżność, stuck job
- `server/src/routes/webhooks.ts` – `queue.send(EMAIL_JOB, …)` i natychmiastowa odpowiedź
