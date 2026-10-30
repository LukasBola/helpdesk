# ADR-0010: Testy integracyjne na prawdziwym PostgreSQL z testcontainers, bez mocków bazy

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-04-23 (źródło: commit `d1441c4`); wdrożenie 2026-05-11 (`ef9ea04`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Logika serwera opiera się na zachowaniu bazy: unikalne ograniczenia (idempotencja e-maili), transakcje (aktualizacja ticketu z historią), kolejka w Postgresie. `tech-stack.md`: „no mocks, no divergence from production behavior”.

## Decyzja

Vitest z `globalSetup` uruchamia kontener `pgvector/pgvector:pg16` przez testcontainers; testy tras, serwisów i kolejki działają na nim. Bazy nie mockujemy.

## Rozważane opcje

Brak zapisu o rozważanych alternatywach.

## Konsekwencje

**Pozytywne**

- Testy wykrywają błędy zależne od bazy (deduplikacja, transakcje, kolejność sortowania przy remisach).
- Ten sam obraz bazy co w docker-compose.

**Negatywne / koszty**

- Testy serwera wymagają Dockera, lokalnie i w CI.
- Testy dzielą bazę w obrębie przebiegu, więc każdy plik musi sprzątać tylko własne dane (kilka poprawek: `b522e7e`, `0fd71c9`, `bb3250e`).

**Niewiadome**

- Brak.

## Dowody

- `d1441c4` – `tech-stack.md`, sekcja Testing
- `ef9ea04` – „testcontainers global setup for integration tests”
- `server/vitest.config.ts`, `server/src/test/setup.ts` – `globalSetup`, `GenericContainer('pgvector/pgvector:pg16')`
- `b522e7e`, `0fd71c9`, `bb3250e` – zawężenie sprzątania do własnych danych testu
