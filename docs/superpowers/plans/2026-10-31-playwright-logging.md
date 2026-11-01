# Plan wdrożenia logowania testów Playwright

**Specyfikacja:** `docs/superpowers/specs/2026-10-31-playwright-logging-design.md`  
**ADR:** ADR-0016  
**Issue:** #17  
**Stan:** wykonany (2026-11-01)

Plan zastępuje pierwszą wersję (wrappery logujące w testach, kontrola pokrycia), która została wdrożona przez Codex, a następnie wycofana. Patrz spec, sekcja „Zasada: testy bez kodu logującego”.

## Ograniczenia

- Tylko publiczne API Playwright 1.64 (Reporter API, `test.step`, `expect` z opisem). Bez nowych zależności.
- Testy, helpery i fixture'y bez kodu logującego. Nazwy, liczba i projekty testów bez zmian (porównanie `--list`).

## Zadania

- [x] **1. Reporter** `e2e/reporters/step-log.ts` + `e2e/reporters/format.ts`: linie START/END/ERROR w stałych kolumnach z symbolami Unicode i kolorami ANSI tylko w terminalu/CI (ISO 8601 UTC, poziom, id `T001.S004`, faza, wynik, czas, rodzaj, treść z lokalizacją), `INCOMPLETE` dla kroków bez END, podsumowanie błędów z pierwszym krokiem, który zawiódł (najgłębszym w swojej gałęzi), załącznik `step-log.log` dla każdej próby, `E2E_LOG=tests`, obsługa `--list`. Zastępuje reporter `list` w `e2e/playwright.config.ts`.
- [x] **2. Maskowanie** `e2e/reporters/mask.ts`: jedno miejsce dla terminala i załącznika.
- [x] **3. Page Objects:** dekorator `@step` (`e2e/pages/step.ts`) z `box: true` i lokalizacją wywołania; użyty w `LoginPage` i `AppShell`.
- [x] **4. Global setup:** linie `GLOBAL` w tym samym formacie (`e2e/global-setup.ts`).
- [x] **5. Opisy asercji:** opis we wszystkich `expect` w `e2e/{tests,api,pages,fixtures}`; reguła `no-restricted-syntax` w `eslint.config.js`.
- [x] **6. Testy reportera** `e2e/reporters/tests/` (osobny proces z celowo padającymi przypadkami): format i kolumny, pary START/END, soft/not/auto-wait, maskowanie, retry i flaky, timeout, podsumowanie błędów, załącznik dla każdej próby. Skrypt `pnpm e2e:reporter:test`, job `e2e-reporter` w `.github/workflows/ci.yml`.
- [x] **7. Trace:** `on-first-retry` w CI, `retain-on-failure` lokalnie.
- [x] **8. Dokumentacja:** README (sekcja „Test log”), spec, ADR-0016.

## Weryfikacja (2026-11-01)

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: OK.
- `pnpm e2e:reporter:test` (także z `CI=true`): 17 passed.
- `pnpm e2e`: 118 passed, 1 skipped; w logu brak haseł i adresów `@helpdesk.local`.
- `--list` przed i po zmianach: identyczne, 119 testów.
