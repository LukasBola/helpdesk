# Specyfikacja: logowanie testów Playwright

**Status:** zaakceptowana (wdrożona)  
**Data:** 2026-10-31, przepisana 2026-11-01  
**Issue:** #17  
**ADR:** [ADR-0016](../../adr/0016-logowanie-e2e-reporter-playwright.md)

## Cel

Każdy test e2e daje na żywo w terminalu czytelny log wykonania: START/END każdego testu, hooka, kroku, akcji Playwright i asercji, z wynikiem i czasem. Ten sam log jest dołączony do każdej próby testu w raporcie HTML. Po błędzie log i podsumowanie wskazują krok lub asercję, która zawiodła, z miejscem w kodzie. Sekrety i dane osobowe nie trafiają do logu.

## Zasada: testy bez kodu logującego

Testy, Page Objects i helpery pozostają zwykłym kodem Playwright. Logowanie realizuje wyłącznie reporter oparty na publicznym Reporter API (wzorzec Observer): `onTestBegin/onTestEnd` i `onStepBegin/onStepEnd` dostarczają każdy hook, `test.step`, akcję (`pw:api`) i asercję (`expect`) bez instrumentacji testów. Tak samo działają Allure i ReportPortal.

Pierwsza wersja (Codex) owijała każdą akcję i asercję w funkcje logujące (`log.run`, `checkValue`, `checkWeb`). Została odrzucona: podwajała kod testów, dublowała kroki w raporcie i trace, a wartości „actual” dla udanych asercji web-first i tak były niedostępne. Kopia tej wersji istnieje tylko poza repozytorium.

## Format linii

Jedna linia = jedno zdarzenie, stałe kolumny:

```text
czas (ISO 8601 UTC)      poziom id        faza  wynik     czas trwania rodzaj treść
2026-11-01T10:15:02.297Z INFO  T001.S004 START -                   - ASSERT Powitanie „Dzień dobry,” jest widoczne (e2e/pages/AppShell.ts:31)
2026-11-01T10:15:07.307Z ERROR T001.S004 END   FAIL          5010 ms ASSERT Powitanie „Dzień dobry,” jest widoczne (e2e/pages/AppShell.ts:31)
2026-11-01T10:15:07.307Z ERROR T001.S004 ERROR -                   - ASSERT ↳ Error: … | Expected: visible | Error: element(s) not found
```

- `T001` to jedna próba testu (retry dostaje nowy numer), `T001.S004` to krok w niej. START i END mają to samo id i identyczną treść, zakończoną lokalizacją w kodzie.
- Wyniki: `PASS`, `FAIL`, `TIMEOUT`, `INTERRUPTED`, `SKIPPED`, `INCOMPLETE` (krok bez END, np. przy timeoucie). Niedokończony krok nigdy nie jest `PASS`.
- Poziom: `INFO`, `WARN` (pominięty), `ERROR` (porażka).
- Global setup loguje w tym samym formacie pod id `G000`.
- `E2E_LOG=tests` ogranicza terminal do linii testów; załącznik jest zawsze pełny.

## Opisy asercji

Każde `expect`, `expect.soft` i `expect.poll` w `e2e/{tests,api,pages,fixtures}` ma opis jako drugi argument, po polsku jak tytuły testów. Opis jest treścią linii ASSERT, nazwą kroku w raporcie HTML i nagłówkiem błędu. Wymusza to reguła ESLint `no-restricted-syntax` w `eslint.config.js`. Metody Page Objectów oznaczone `@step` (`e2e/pages/step.ts`, `test.step` z `box: true` i lokalizacją wywołania) są widoczne jako jeden krok, np. `LoginPage.login`.

## Błędy

Na końcu przebiegu dla każdego testu, który ostatecznie padł (flaky się nie liczy): id próby, najgłębszy krok, który zawiódł (id, rodzaj, treść, lokalizacja), ścieżka kroków, komenda otwierająca trace i pełny błąd Playwright (Expected/Received, call log).

## Raport HTML i trace

Każda próba ma załącznik `step-log.txt` z własnym logiem, obok trace'a. Trace Viewer pokazuje te same kroki natywnie (panel Actions); dołączenie logu wewnątrz trace'a wymagałoby kodu w workerze, czyli instrumentacji testów, więc nie jest celem. Trace: `on-first-retry` w CI (zalecenie Playwright), `retain-on-failure` lokalnie (brak retry).

## Dane wrażliwe

`e2e/reporters/mask.ts` maskuje w terminalu i w `step-log.txt`: hasła i nazwiska użytkowników e2e, `POSTMARK_WEBHOOK_TOKEN`, adresy e-mail, `Bearer …` oraz wartości `token/password/cookie/authorization/api_key`. Natywne drzewo kroków w raporcie HTML i trace nie są maskowane.

## Świadomie pominięte

- Wartość „actual” dla udanych asercji web-first: publiczne API jej nie udostępnia. Przy porażce Playwright podaje Expected/Received.
- Statyczna kontrola pokrycia logowania: zbędna, reporter widzi każde zdarzenie.

## Kryteria akceptacji

- Testy i Page Objects nie zawierają kodu logującego poza dekoratorem `@step`.
- START/END na żywo dla testów, hooków, kroków, akcji i asercji, z wynikiem, czasem, id i lokalizacją; pary mają identyczną treść.
- Soft assertion daje `FAIL` i test idzie dalej; auto-wait i `not` działają bez zmian; timeout daje `INCOMPLETE`, nie `PASS`.
- Każda próba (także retry) ma własny `step-log.txt` w raporcie.
- Sekrety i e-maile nie występują w logu.
- Testy reportera (`pnpm e2e:reporter:test`) działają w CI.
