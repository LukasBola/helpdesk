# Plan wdrożenia logowania testów Playwright

> **Dla osoby wdrażającej:** wymagany skill `superpowers:executing-plans`. Zadania są kolejno zależne; pola wyboru służą do śledzenia postępu.

**Cel:** zapewnić logi START/END akcji i asercji na żywo oraz izolowane załączniki dla każdej próby testu Playwright.

**Architektura:** automatyczna fixture tworzy logger dla próby i załącza jej dziennik; opisane operacje są krokami `test.step`, a kontrolowane asercje nadal wykonują natywne `expect`. Logger emituje wyłącznie zamaskowane, oznaczone rekordy przez stdout workera; własny reporter przekazuje je do terminala i uzupełnia informacje o cyklu życia testu. Szczegóły i ograniczenia są opisane w specyfikacji.

**Technologie:** TypeScript, istniejący `@playwright/test` 1.64.x, Node.js, wbudowane reportery HTML i JUnit.

**Specyfikacja:** `docs/superpowers/specs/2026-10-31-playwright-logging-design.md`.

## Globalne ograniczenia

- Zachować istniejące niezapisane zmiany użytkownika, w szczególności `e2e/playwright.config.ts` i `README.md`; nie wykonywać automatycznych commitów.
- Nie zmieniać auto-wait, semantyki asercji, danych, liczby workerów, konfiguracji trace ani zachowania aplikacji.
- Dzienniki nowych mechanizmów maskują dane wrażliwe przed wysłaniem; trace, standardowe błędy i inne artefakty Playwright mają odrębny zakres.
- Nie instalować nowych bibliotek; korzystać z publicznych API Playwright. Testy mechanizmu działają bez serwera i bazy aplikacji.
- Kompletność obejmuje setup, UI, API, Page Objects, fixture'y i hooki; global setup i hooki workerowe zachowują faktyczny zakres.
- Odczyt diagnostyczny nie może udawać rzeczywistej wartości użytej w asercji. Nieosiągalna wartość to `unavailable` z przyczyną.
- Nowe zachowanie wdrażać małymi cyklami **RED → GREEN → REFACTOR**: najpierw test i potwierdzenie oczekiwanej porażki, następnie minimalna implementacja, potem porządkowanie kodu przy zielonych testach. Błąd środowiska lub konfiguracji nie stanowi potwierdzenia RED. Po refaktoryzacji ponownie uruchomić odpowiednie testy; jeśli porządkowanie nie jest potrzebne, jawnie to odnotować zamiast wprowadzać sztuczne zmiany.

## Punkty szczególnej kontroli

1. Sekret pojawiający się w błędzie lub zagnieżdżonej wartości: nigdy nie może trafić do nowego logu (zadanie 1).
2. Asercja `soft` kończąca się bez wyjątku: jej zdarzenie musi być `FAIL`, a następny krok musi się wykonać (zadanie 3).
3. Równoczesne próby i retry: wpisy i załączniki nie mogą zmieniać właściciela (zadanie 4).
4. Timeout albo zabity worker: brak END nie może zostać pokazany jako PASS (zadanie 4).
5. Operacja złożona z równoległych obietnic: powiązanie z rodzicem i kolejność zapisów muszą pozostać poprawne (zadanie 2).

## Mapa plików

- `e2e/logging/events.ts` — typy zdarzeń i formatowanie.
- `e2e/logging/redact.ts` — bezpieczna serializacja i maskowanie.
- `e2e/logging/logger.ts` — kontekst próby, pary zdarzeń i zagnieżdżanie.
- `e2e/logging/assertions.ts` — adaptery wartości i asercji web-first.
- `e2e/logging/test.ts` — rozszerzony `test`, automatyczna fixture i załącznik.
- `e2e/logging/reporter.ts` — terminal i zdarzenia cyklu życia.
- `e2e/logging-tests/` — niezależna konfiguracja, scenariusze kontrolne i testy kontraktowe uruchamiające Playwright jako proces potomny.
- `e2e/pages/*.ts`, `e2e/fixtures/{api,db}.ts`, `e2e/{tests,api}/*.ts`, `e2e/global-setup.ts` — migracja istniejącego kodu.
- `e2e/playwright.config.ts`, `package.json`, `README.md` — podłączenie i instrukcja.

## Zadanie 1: bezpieczne rekordy

**Pliki:** utwórz `e2e/logging/events.ts`, `e2e/logging/redact.ts`, `e2e/logging-tests/redact.spec.ts` oraz `e2e/logging-tests/playwright.config.ts`.

**Interfejsy:** `redact(value: unknown): string`; `LogEvent` zawiera `timestamp`, `seq`, `runId`, `project`, `testId`, `retry`, `worker`, `operationId`, opcjonalny `parentId`, `category`, `phase`, `description` oraz opcjonalne `outcome`, `durationMs`, `expected`, `actual`, `error`; `formatEvent(event: LogEvent): string` tworzy jednowierszowy tekst. Kategorie: `TEST`, `HOOK`, `STEP`, `METHOD`, `ACTION`, `ASSERT`, `GLOBAL`; fazy `START` i `END`; wyniki `PASS`, `FAIL`, `TIMEOUT`, `INTERRUPTED`, `INCOMPLETE`, `SKIPPED`.

- [ ] Dodaj niezależną konfigurację Playwright bez `webServer`, global setup, trace i zależności od bazy. Napisz testy: zagnieżdżone `password`, `token`, `authorization`, `cookie`, e-mail, query URL i komunikat błędu nie ujawniają wartości; bezpieczny status 200 pozostaje widoczny; cykliczny obiekt, `BigInt` i tekst wielowierszowy nie powodują wyjątku ani dodatkowych linii.
- [ ] Uruchom `pnpm exec playwright test -c e2e/logging-tests/playwright.config.ts redact.spec.ts`; potwierdź błąd wynikający z braku implementacji.
- [ ] Zaimplementuj format i `redact`: klucze wrażliwe maskuj rekurencyjnie, e-maile i znane sekrety w tekście i URL usuwaj, nieznane/niebezpieczne obiekty zastępuj placeholderem. Zapewnij jawne przekazywanie znanych wartości sekretów do maskowania i brak mutacji oryginału. Nie serializuj domyślnie body HTTP.
- [ ] Powtórz polecenie; wszystkie testy przechodzą.
- [ ] **REFACTOR:** przy zielonych testach uporządkuj wspólne reguły maskowania i serializacji, usuwając duplikację bez zmiany formatu ani polityki danych. Ponownie uruchom `pnpm exec playwright test -c e2e/logging-tests/playwright.config.ts redact.spec.ts`; wszystkie testy nadal przechodzą.

## Zadanie 2: dziennik próby i operacji

**Pliki:** utwórz `e2e/logging/logger.ts`, `e2e/logging/test.ts`, `e2e/logging-tests/logger.spec.ts`; zmień `e2e/logging/events.ts` w razie potrzeby.

**Interfejsy:** `Logger.run<T>(category: 'STEP' | 'METHOD' | 'ACTION' | 'HOOK', description: string, fn: () => T | Promise<T>): Promise<T>`; `Logger.assertion<T>(description: string, expected: unknown, fn: () => T | Promise<T>, actual: () => unknown): Promise<T>`; `Logger.lines(): string[]`; rozszerzony `test` udostępnia automatyczną fixture i `{ log: Logger }`. `testInfo.attach('test-log.txt', { body, contentType: 'text/plain' })` tworzy załącznik danej próby.

- [ ] Dodaj testy `run`: wynik jest zwracany, wyjątek jest ponownie rzucany, `START` poprzedza pojedynczy `END PASS/FAIL`, numery rosną, czas nieujemny, dwa równoległe kroki mają właściwych rodziców i oddzielne ID. Sprawdź niedostępny `actual` i że wyrażenie wartości nie jest wykonywane ponownie.
- [ ] Uruchom `pnpm exec playwright test -c e2e/logging-tests/playwright.config.ts logger.spec.ts`; potwierdź brak implementacji.
- [ ] Zaimplementuj logger z zegarem monotonicznym, per-próba buforem i kontekstem zagnieżdżenia przez `AsyncLocalStorage`; `test.step` ma nazwy już po maskowaniu. Przed wysłaniem na stdout każdy rekord przechodzi przez maskowanie, używa stałego prefiksu i jednego zapisu zawierającego kompletną linię. Nie zapisuj niezmaskowanej wersji w buforze. Fixture `{ auto: true }` uruchamia się przed zależnymi fixture'ami i kończy po nich; w teardown dołącza tekst przez `testInfo.attach`. Błąd załącznika nie może ukryć pierwotnej awarii.
- [ ] Powtórz testy i sprawdź załącznik również po błędzie akcji. Przy utracie workera nie deklaruj gwarancji wykonania teardown.
- [ ] **REFACTOR:** przy zielonych testach uprość wspólne tworzenie zdarzeń START/END oraz obsługę kontekstu i bufora, zachowując propagację wyjątków i izolację prób. Ponownie uruchom `pnpm exec playwright test -c e2e/logging-tests/playwright.config.ts redact.spec.ts logger.spec.ts`; wszystkie testy nadal przechodzą.

## Zadanie 3: asercje z zachowaniem Playwright

**Pliki:** utwórz `e2e/logging/assertions.ts`, `e2e/logging-tests/assertions.spec.ts`; zmień `e2e/logging/logger.ts` i `e2e/logging/test.ts`.

**Interfejsy:** `checkValue<T>(log: Logger, description: string, actual: T, expected: unknown, assertion: (actual: T) => void): Promise<void>`; `checkWeb(log: Logger, description: string, expected: unknown, assertion: () => Promise<void>, successActual?: string): Promise<void>`; `checkSoft(log: Logger, description: string, expected: unknown, assertion: () => void | Promise<void>, actual: () => unknown): Promise<void>`. W testach pozostają natywne matchery `expect`, w tym `not` i ich opcje.

- [ ] Napisz scenariusze: `checkValue` zapisuje 201 vs 200 i zachowuje błąd; `checkWeb` czeka na późniejszą zmianę DOM, zapisuje `unavailable` bez wymyślonego odczytu; negacja przechodzi; soft assertion zapisuje `FAIL`, wykonuje następny krok i oznacza test jako failed. Dodaj porównanie regex, wartości granicznej i częściowego obiektu.
- [ ] Uruchom `pnpm exec playwright test -c e2e/logging-tests/playwright.config.ts assertions.spec.ts`; dla celowo padających przypadków użyj testu nadrzędnego uruchamiającego osobny proces i sprawdź jego oczekiwany kod wyjścia oraz logi.
- [ ] Zaimplementuj adaptery bez zmiany oryginalnych matcherów: wartość `actual` zwykłej asercji jest obliczana tylko raz przed wywołaniem; soft porównuje liczbę `testInfo.errors` przed i po asercji, nie połyka wyjątku. `checkWeb` przy braku publicznie dostępnej wartości zapisuje przyczynę niedostępności.
- [ ] Powtórz testy; scenariusze nadrzędne przechodzą, a zamierzone błędy procesów potomnych pozostają błędami.
- [ ] **REFACTOR:** przy zielonych testach usuń duplikację adapterów asercji bez zmiany ich semantyki, obsługi soft ani sposobu pozyskania actual. Ponownie uruchom `pnpm exec playwright test -c e2e/logging-tests/playwright.config.ts redact.spec.ts logger.spec.ts assertions.spec.ts`; wszystkie testy nadrzędne nadal przechodzą.

## Zadanie 4: terminal, retry i sytuacje graniczne

**Pliki:** utwórz `e2e/logging/reporter.ts`, `e2e/logging-tests/reporter.spec.ts` i scenariusze potomne w `e2e/logging-tests/cases/`; zmień `e2e/playwright.config.ts`.

**Interfejsy:** reporter implementuje publiczne `Reporter.onTestBegin`, `onTestEnd`, `onStdOut`, `onStdErr`; rozpoznaje prefiks z zadania 2, wypisuje zamaskowane rekordy jako kompletne linie, raportuje inne wyjście bez modyfikowania jego znaczenia. Obecne reportery HTML i JUnit pozostają skonfigurowane; domyślny `list` należy zastąpić reporterem terminalowym, żeby uniknąć podwójnego wyjścia.

- [ ] Napisz test procesu potomnego z dwoma workerami, odrębnymi znacznikami i retry: przed zakończeniem pierwszego testu jego START jest już w stdout; każda próba ma własny załącznik, który nie zawiera znacznika drugiego testu ani innego retry; w terminalu każda linia pozwala przypisać projekt, test, worker i retry. Sprawdź także wynik HTML i JUnit.
- [ ] Dodaj przypadki skip, zwykłego błędu, timeoutu i wymuszonego zatrzymania workera: nierozpoczęta operacja nie ma START, niedokończona nie ma fałszywego PASS; wynik testu i procesu odpowiada Playwright. Osobno sprawdź błędy w hookach i teardown oraz worker restart.
- [ ] Uruchom `pnpm exec playwright test -c e2e/logging-tests/playwright.config.ts reporter.spec.ts`; potwierdź brak implementacji.
- [ ] Podłącz reporter i fixture. Obsłuż fragmentację oraz wiele rekordów w `onStdOut`, nie ufając temu, że granica chunku jest granicą linii; koreluj według testu i próby dostarczonych reporterowi. `onTestEnd` wypisuje rzeczywisty końcowy status testu, a załącznik tworzony w fixture obejmuje zdarzenia do jej teardown. W raporcie HTML końcowy status próby pochodzi z Playwright, nie z przedwczesnego wpisu PASS loggera. Skipped test bez uruchomionej fixture nie obiecuje załącznika; jego status jest widoczny w reporterze.
- [ ] Powtórz testy procesu i sprawdź, że nie ma wycieków danych w nowych rekordach. Jeśli publiczne API nie dostarcza zdarzenia koniecznego do spełnienia kryterium, zatrzymaj implementację i wyjaśnij ograniczenie przed obchodzeniem go niepublicznym API.
- [ ] **REFACTOR:** przy zielonych testach uporządkuj dekodowanie strumienia i mapowanie prób, zachowując emisję na żywo, kompletne linie oraz końcowe statusy Playwright. Ponownie uruchom `pnpm exec playwright test -c e2e/logging-tests/playwright.config.ts`; cały dotychczasowy zestaw nadal przechodzi.

## Zadanie 5: migracja testów i infrastruktury

**Pliki:** zmień `e2e/pages/LoginPage.ts`, `e2e/pages/AppShell.ts`, `e2e/fixtures/api.ts`, `e2e/fixtures/db.ts`, `e2e/global-setup.ts`, wszystkie pliki `e2e/tests/*.ts` i `e2e/api/*.spec.ts`.

**Interfejsy:** testy importują `test` z `e2e/logging/test.ts` i otrzymują `log` z fixture. Page Objects przyjmują `Logger` w konstruktorze; `newApiContext`, `signInAs` i operacje `db` otrzymują kontekst loggera jawnie dla operacji testowych. Global setup używa osobnego loggera przebiegu bez fikcyjnego identyfikatora testu.

- [ ] Zapisz wynik `pnpm exec playwright test -c e2e/playwright.config.ts --list` do pliku tymczasowego jako punkt odniesienia. Dodaj scenariusz kontrolny reprezentujący logowanie przez Page Object, zapytanie API i hook bazy: każda metoda, akcja i asercja ma osobne START/END i prawidłowy rodzic; hasło i e-mail nie trafiają do nowych logów. Scenariusz nie wymaga prawdziwej bazy ani serwera.
- [ ] Zmigruj Page Objects i współdzielone helpery: nazwane metody opakuj jako `METHOD`, operacje Playwright i bazy jako `ACTION`, asercje przez adaptery. Nie loguj danych uwierzytelniających, body ani surowych nagłówków. Global setup emituje oznaczone zdarzenia `GLOBAL` niezależnie od fixture testowej.
- [ ] Zmigruj `auth.setup.ts` i wszystkie pliki `e2e/tests/*.ts`, zachowując kolejność działań, wartości, oczekiwania, route handlers, hooki i lokalną semantykę. Obejmij też oczekiwania na zdarzenia oraz operacje wewnątrz callbacków, bez podwójnego uruchamiania kodu.
- [ ] Zmigruj wszystkie pliki `e2e/api/*.spec.ts`, w tym pętle, przypadki negatywne, odczyty odpowiedzi, setup i cleanup. Rozdziel zagnieżdżone wyrażenia tak, by każde wywołanie było wykonane raz i miało własny opis.
- [ ] Uruchom `pnpm exec playwright test -c e2e/logging-tests/playwright.config.ts` oraz `pnpm typecheck`. Porównaj listę przypadków `pnpm exec playwright test -c e2e/playwright.config.ts --list` ze stanem sprzed migracji; nazwy, liczba i projekty testów nie mogą się niezamierzenie zmienić.
- [ ] **REFACTOR:** po przejściu kontroli migracji uprość powtarzające się opisy i wywołania helperów, zachowując osobne zdarzenia każdej akcji i asercji. Powtórz zestaw testów mechanizmu, `pnpm typecheck` i porównanie listy przypadków; wyniki nadal spełniają poprzedni krok.

## Zadanie 6: kontrola pokrycia i dokumentacja

**Pliki:** utwórz `e2e/logging-tests/coverage.spec.ts`; zmień `package.json` i `README.md`.

- [ ] Napisz kontrolę statyczną z użyciem już obecnego TypeScript API: w katalogach testów, Page Objects i fixture'ów wykrywaj wywołania `expect` poza callbackiem adaptera oraz wybrane operacje `page`, `locator`, `request`, `context` i `db` poza callbackiem `log.run` lub adaptera. Test kontroli musi wykryć celowo nieopakowany `click` i `expect`, a zaakceptować opisane wywołania. Opisz jawne wyjątki i ograniczenia analizy typów; nie deklaruj matematycznej kompletności.
- [ ] Kontrolę statyczną również rozwijaj w cyklu **RED → GREEN → REFACTOR**: najpierw test wykrywania nieopakowanego wywołania i potwierdzenie, że pada z powodu brakującej reguły; następnie minimalna reguła i zielony test; na końcu uporządkowanie wspólnego przechodzenia po AST. Po refaktoryzacji uruchom `pnpm exec playwright test -c e2e/logging-tests/playwright.config.ts coverage.spec.ts`; przypadki poprawne i naruszenia są nadal rozpoznawane zgodnie z oczekiwaniem.
- [ ] Dodaj skrypt `e2e:logging:test` uruchamiający niezależną konfigurację testów mechanizmu. Udokumentuj przykłady akcji, asercji wartości i web-first, soft assertion, użycie Page Object, odczyt terminala i załączników, maskowanie, retry, przerwanie oraz ograniczenia `actual` i wbudowanych artefaktów.
- [ ] Uruchom `pnpm e2e:logging:test`, `pnpm typecheck`, `pnpm lint` i `pnpm format:check`; wszystkie muszą przejść albo wynik i istniejące problemy muszą zostać dokładnie zgłoszone. Uruchom pełne `pnpm e2e` tylko przy dostępnym środowisku i bazie; wynik oraz ewentualne przeszkody zapisz w podsumowaniu.
- [ ] Obejrzyj wynikowy raport HTML próby udanej, błędnej i retry, a także log terminala z co najmniej dwoma workerami. Sprawdź zgodność wszystkich kryteriów specyfikacji oraz brak zmian poza uzgodnionym zakresem.
