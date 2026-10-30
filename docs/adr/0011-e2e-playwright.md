# ADR-0011: Testy e2e w Playwright: Chromium, testy API przez proxy Vite, dane w bazie dev

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-10-29 (źródło: commity `4f7df6a`, `474cfcb`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

`tech-stack.md` przewidywał Playwright tylko dla krytycznych ścieżek (15–25 testów). Po wdrożeniu frontendu właściciel projektu zażądał testów do oglądania w trybie headed, tylko na Chrome (pozostałe przeglądarki zainstalowane, nieużywane), logowania przez Page Object, a potem testów API sprawdzających połączenie frontend–backend.

## Decyzja

Katalog `e2e/` w roocie z projektami Playwright: `setup` (zapis sesji per rola), `chromium` (UI, Page Objects) i `api` (HTTP na origin frontendu przez proxy Vite, z nagłówkiem `Origin`). Reportery list, HTML, JUnit. Dane testowe seedowane skryptem `server/prisma/e2e-fixtures.ts` w lokalnej bazie dev przed każdym przebiegiem.

## Rozważane opcje

Brak zapisu o rozważanych alternatywach.

## Konsekwencje

**Pozytywne**

- Testy znalazły rzeczywiste błędy, naprawione z testami (m.in. paginacja, 500 przy złym JSON, brak CSRF poza auth).
- Testy API sprawdzają tę samą drogę co przeglądarka (ADR-0007).

**Negatywne / koszty**

- Liczba testów (119) znacznie przekracza zakładane 15–25.
- Seed nadpisuje dane e2e w bazie dev; dwa równoległe przebiegi na jednej bazie przeszkadzają sobie.
- Testy e2e nie są uruchamiane w CI.

**Niewiadome**

- Brak.

## Dowody

- `d1441c4` – `tech-stack.md`: „Playwright — E2E tests for critical paths only (max 15-25 tests)”
- `4f7df6a`, `474cfcb`, `7c859bb` – zestaw UI, testy API, wzmocnienia po review
- `e2e/playwright.config.ts` – projekty, reportery
- `docs/superpowers/plans/2026-10-29-e2e-coverage.md` – macierz przypadków i znalezione błędy
- `.github/workflows/ci.yml` – brak joba e2e
