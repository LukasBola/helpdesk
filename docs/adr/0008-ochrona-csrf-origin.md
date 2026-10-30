# ADR-0008: Ochrona CSRF przez sprawdzanie nagłówka `Origin` dla wszystkich mutacji `/api`

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-10-29 (źródło: commit `74e7221`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Better Auth sprawdza origin tylko dla własnych endpointów `/api/auth/*`. Druga runda testów e2e wykazała, że mutacje pozostałych endpointów (np. `PATCH /api/tickets/:id`) z obcego originu chroniło jedynie `SameSite=Lax` ciasteczka.

## Decyzja

Middleware `originCheck` na `/api`, montowany po handlerze Better Auth: dla metod innych niż GET/HEAD/OPTIONS żądanie z nagłówkiem `Origin` spoza `{CLIENT_URL, origin BETTER_AUTH_URL}` dostaje 403. Żądania bez `Origin` (np. webhook Postmarka) przechodzą.

## Rozważane opcje

Brak zapisu o rozważanych alternatywach.

## Konsekwencje

**Pozytywne**

- Jedna lista zaufanych originów dla Better Auth i reszty API.
- Pokryte testami jednostkowymi i testami API Playwright.

**Negatywne / koszty**

- Żądania bez nagłówka `Origin` nie są sprawdzane; ochrona przed nimi opiera się na `SameSite` i uwierzytelnianiu (webhook: token).

**Niewiadome**

- Brak.

## Dowody

- `74e7221` – „state-changing /api requests from an untrusted Origin are rejected (403); only SameSite=Lax protected them before”
- `server/src/middleware/originCheck.ts` – implementacja
- `server/src/app.ts` – kolejność montowania
- `docs/superpowers/plans/2026-10-29-e2e-coverage.md` – sekcja Outcome
