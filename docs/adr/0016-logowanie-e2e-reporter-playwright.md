# ADR-0016: Logowanie testów e2e przez własny reporter Playwright, bez kodu logującego w testach

- **Status:** Zaakceptowany
- **Retrospektywny:** nie
- **Data decyzji:** 2026-11-01
- **Data spisania:** 2026-11-01
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Testy e2e (ADR-0011) miały dawać na żywo log START/END każdej akcji i asercji, z wynikiem i czasem, oraz log dołączony do każdej próby w raporcie HTML, z maskowaniem sekretów. Pierwsza implementacja owijała każdą akcję i asercję w funkcje logujące: ok. 400 wywołań, +1882/−787 linii w testach, 9 błędów lint, podwójne kroki w raporcie i trace. Playwright udostępnia zdarzenia każdego kroku, akcji i asercji w Reporter API.

## Decyzja

Logowanie realizuje jeden własny reporter (`e2e/reporters/step-log.ts`) nasłuchujący `onTestBegin/End` i `onStepBegin/End` (wzorzec Observer). Testy, Page Objects i helpery nie zawierają kodu logującego; opisy dają natywne środki Playwright: opis w `expect(wartość, 'opis')` (wymagany regułą ESLint) oraz `test.step` przez dekorator `@step` w Page Objects.

## Rozważane opcje

- Wrappery logujące wokół każdej akcji i asercji (`log.run`, `checkValue`, `checkWeb`) — wdrożone, odrzucone.
- Wbudowany reporter `list` z `printSteps` — odrzucony: bez TTY nie wypisuje kroków i nie maskuje danych.
- Własny reporter na Reporter API — wybrany.

## Konsekwencje

**Pozytywne**

- Testy to zwykły kod Playwright; nowy test jest logowany bez dodatkowej pracy.
- Reporter widzi każdy krok, akcję i asercję zgłaszane przez Playwright, więc kontrola pokrycia logowania jest zbędna.
- Jedno miejsce formatu i maskowania (terminal i `step-log.log`).

**Negatywne / koszty**

- Brak wartości „actual” dla udanych asercji web-first (API jej nie udostępnia).
- Reporter nie widzi kroków wewnątrz fixture ani zwykłego kodu Node (np. `db.*` przez `execSync`).
- Maskowanie to zabezpieczenie dodatkowe, nie gwarancja: obejmuje znane sekrety (hasła e2e, także `E2E_PASSWORD` z `.env`, pełne imiona i nazwiska użytkowników e2e, token webhooka) oraz wzorce (e-mail, `Bearer`/`Basic`, `token=`/`password=`…). Wartości wpisywane akcjami (`Fill "…"`) są celowo widoczne, bo bywają sednem testu (np. zły format e-maila, puste hasło); maskowane są tylko znane sekrety. Stdout testów jest maskowany całymi liniami (sekret rozbity na dwa zapisy też). Wartość spoza listy, nierozpoznany sekret w wolnym tekście lub samo imię przechodzą bez zmian; dlatego dane e2e są wyłącznie fikcyjne. Trace i natywne kroki raportu HTML nie są maskowane.
- Log nie trafia do wnętrza trace'a, tylko obok niego w raporcie HTML; dodanie załącznika przez reporter opiera się na mutacji `result.attachments`, której dokumentacja wprost nie opisuje [wniosek].
- Własny kod reportera do utrzymania (testy w CI).

**Niewiadome**

- Zachowanie przy `merge-reports` (blob) nie było sprawdzane.

## Dowody

- `e2e/reporters/step-log.ts` – reporter, format i załącznik
- `e2e/reporters/tests/step-log.spec.ts` – kontrakt reportera (17 testów)
- `e2e/pages/step.ts` – dekorator `@step`
- `eslint.config.js` – reguła wymagająca opisu w `expect`
- `docs/superpowers/specs/2026-10-31-playwright-logging-design.md` – spec po zmianie podejścia
- <https://playwright.dev/docs/api/class-reporter> – `onStepBegin/onStepEnd`
- <https://playwright.dev/docs/test-assertions> – opis w `expect` widoczny w reporterach
