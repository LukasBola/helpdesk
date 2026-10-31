# Specyfikacja: logowanie testów Playwright

**Status:** projekt do akceptacji  
**Data:** 2026-10-31

## Cel i zakres

Każdy test Playwright ma dawać czytelny na żywo obraz wykonywania w terminalu oraz osobny, uporządkowany dziennik jako załącznik do wyniku w raporcie HTML. Dziennik ma pozwolić ustalić, co rozpoczęło się przed błędem, jaki był wynik i jakie wartości porównano. Zakres obejmuje wszystkie istniejące i przyszłe testy w `e2e/`: projekty `setup`, `chromium` i `api`, ich hooki, fixture'y, metody Page Object i pomocnicze operacje wykonywane w kontekście testu. Global setup, który działa poza pojedynczym testem, ma osobny kontekst przebiegu i nie może być błędnie przypisany do konkretnego testu.

Obecnie konfiguracja używa reporterów list, HTML i JUnit, a `fullyParallel` jest włączone. Testy używają bezpośrednich wywołań Playwright, asercji w testach i Page Objects oraz pomocniczych funkcji API i bazy. Istniejące niezapisane zmiany konfiguracji trzeba zachować. Celem nie jest zmiana zachowania aplikacji, danych testowych, liczby workerów ani semantyki testów.

## Rozważone podejścia

1. **Tylko wbudowane kroki i reporter Playwright.** Najmniej kodu, lecz same zdarzenia reportera nie dostarczają wiarygodnie wszystkich oczekiwanych i rzeczywistych wartości udanych asercji ani opisów intencji.
2. **Własny system wykonujący testy i asercje.** Dawałby pełną kontrolę, ale powielałby Playwright, zwiększał koszt utrzymania i groził zmianą auto-wait oraz retry asercji.
3. **Zalecane: Playwright jako źródło wykonania, uzupełniony cienką warstwą logowania.** Nazwane `test.step`, fixture per test, załączniki i reporter korzystają z publicznych API Playwright. Jawne opisy operacji i adaptery asercji uzupełniają dane, których sam reporter nie udostępnia. Nie przechwytujemy niepublicznych szczegółów frameworka.

## Jednostka logowania i format

Zdarzenia opisują test, hook, krok, metodę pomocniczą, akcję lub asercję. Każda operacja wykonywana przez kod testów, w tym operacje w Page Objects i fixture'ach, ma czytelny opis oraz parę `START` i `END`. `END` zawiera `PASS` albo `FAIL` i czas trwania. Gdy operacja została przerwana przez timeout lub przerwanie procesu, wynik jest oznaczany odpowiednio `TIMEOUT`, `INTERRUPTED` lub `INCOMPLETE`, a nie fałszywym `PASS`. Zagnieżdżenie pokazuje relację metody do jej akcji; każda faktyczna akcja i asercja ma własne zdarzenia, nie tylko wspólny krok dla całej metody. Konstrukcja locatora i zwykłe lokalne obliczenia nie są akcjami; operacje na stronie, API, kontekście i bazie oraz oczekiwania na zdarzenia nimi są. Operacje wykonywane wewnętrznie przez sam Playwright nie wymagają ręcznej instrumentacji.

Każdy wpis ma timestamp w ISO 8601 UTC, numer sekwencyjny w obrębie próby, identyfikator przebiegu, projektu i testu, numer retry, worker, identyfikator operacji i rodzica, kategorię, fazę, opis oraz, dla `END`, wynik i czas trwania. Błąd zawiera bezpieczny opis i dostępne szczegóły. Czas trwania liczony jest zegarem monotonicznym. Format załącznika to czytelny tekst UTF-8; strukturę danych można dodatkowo zachować w JSONL, jeśli pomoże to w implementacji i walidacji.

Przykład schematyczny:

```text
2026-10-31T12:00:00.120Z seq=12 project=chromium test=... retry=0 worker=1 op=4 parent=2 ACTION START Kliknij „Zaloguj się”
2026-10-31T12:00:00.200Z seq=13 project=chromium test=... retry=0 worker=1 op=4 ACTION END PASS duration=80ms
2026-10-31T12:00:00.201Z seq=14 project=chromium test=... retry=0 worker=1 op=5 ASSERT START Nagłówek jest widoczny; expected=visible
2026-10-31T12:00:00.235Z seq=15 project=chromium test=... retry=0 worker=1 op=5 ASSERT END PASS duration=34ms actual=visible
```

## Asercje i wartości

Każda asercja ma opis mówiący, co jest sprawdzane, oczekiwaną wartość lub predykat, rzeczywistą wartość oraz wynik. Dla zwykłych asercji wartości logowana jest wartość przekazana do `expect`, bez ponownego wykonania wyrażenia. Dla asercji na locatorach i stronie należy zachować natywne asercje Playwright i ich ponawianie; nie wolno zastępować ich jednorazowym odczytem zmieniającym semantykę testu. Jeśli można wiarygodnie uzyskać wartość użytą przez asercję z publicznego API, należy ją zapisać. W pozostałych przypadkach log oznacza `actual=unavailable` z przyczyną, a dostępny komunikat błędu Playwright zostaje dołączony po maskowaniu. Stan logiczny, który wynika bezpośrednio z pomyślnej asercji, np. `visible`, można tak oznaczyć; nie wolno przedstawiać dodatkowego odczytu po asercji jako wartości, którą framework rzeczywiście porównał. Dodatkowy diagnostyczny odczyt, jeśli bezpieczny i użyteczny, musi być opisany jako osobna próbka po asercji i nie może zmienić wyniku testu.

Zachować `not`, dopasowania częściowe, wyrażenia regularne, wartości graniczne, soft assertions, timeouty i retry. Błąd asercji musi nadal powodować oryginalny wynik testu; logowanie nie może go przechwycić i ukryć. Przy asercji soft zdarzenie musi mieć wynik `FAIL`, mimo że test kontynuuje wykonanie. Asercja, która nie została rozpoczęta po wcześniejszym błędzie, nie jest raportowana jako wykonana.

## Terminal i raporty

Reporter wypisuje zdarzenia natychmiast po otrzymaniu, bez czekania na koniec testu. Jedna kompletna linia to jedno zdarzenie. Przy równoległości linie różnych testów mogą przeplatać się w czasie, lecz każda zawiera identyfikator testu, projektu, workera i retry; ich treść nie może się mieszać w jednej linii. Terminal pokazuje START oraz END z wynikiem i czasem, również dla testów zakończonych błędem.

Każda próba testu otrzymuje własny załącznik dziennika przez publiczne API Playwright; retry nie nadpisuje poprzedniej próby. W HTML dziennik jest dostępny przy odpowiedniej próbie testu, również dla testów przechodzących. Kroki Playwright pozostają widoczne w raporcie i trace. Należy zachować działanie istniejących raportów HTML i JUnit; dostępność załączników w JUnit zależy od możliwości jego odbiorcy i nie jest równoważna prezentacji w HTML. W przypadku awarii procesu lub wymuszonego zatrzymania końcowy załącznik może nie powstać: wpisy już wyemitowane do terminala pozostają źródłem informacji, a brak END oznacza niedokończoną operację. Nie obiecywać pełnego dziennika po utracie procesu.

## Dane wrażliwe

Przed emisją do terminala i zapisem załącznika centralny mechanizm maskuje hasła, tokeny, cookies, nagłówki autoryzacyjne i inne sekrety oraz dane osobowe, w tym adresy e-mail. Maskowanie obejmuje opisy, expected, actual, komunikaty błędów, URL, parametry i dane zagnieżdżone; dla nieznanych lub niemożliwych do bezpiecznej serializacji wartości stosuje bezpieczny placeholder. Nie logować pełnych body żądań ani odpowiedzi domyślnie. Maskowanie nie może zmieniać danych przekazywanych testowanej aplikacji ani samych asercji. Wbudowane trace, screenshoty, wideo i standardowe komunikaty Playwright mogą mieć własną politykę danych; nie należy twierdzić, że nowy logger je sanitizuje.

## Integracja i niezawodność

Fixture o zasięgu testu zarządza kontekstem i buforem danej próby; jawne helpery kroków i asercji udostępniają prostą konwencję testom, Page Objects i fixture'om. Reporter obsługuje emisję na żywo i korelację zdarzeń. Szczegółowy podział odpowiedzialności i mechanizm transportu zostaną ustalone w planie po weryfikacji publicznych API i ograniczeń danej wersji Playwright. Logowanie nie może współdzielić niezabezpieczonego globalnego bufora pomiędzy testami ani powodować kolizji plików. Uwzględnić `beforeEach`, `afterEach`, fixture setup/teardown, testy pomijane, błędy konfiguracji, retry i worker restart. Hooki o zakresie całego workera i global setup są oznaczane ich faktycznym zakresem, bez przypisywania ich każdemu testowi.

Migracja obejmuje wszystkie istniejące wywołania w zakresie oraz konwencję dla nowych testów; sama zmiana reportera nie spełnia wymagania. Dokumentacja projektu opisze użycie, przykłady oraz sposób sprawdzenia kompletności. Tam, gdzie to praktyczne, automatyczna kontrola statyczna lub testy kontraktowe mają wykrywać niezinstrumentowane akcje i asercje, z jawnymi wyjątkami i opisem ograniczeń; nie należy zakładać, że proste wyszukiwanie tekstu zapewnia pełne pokrycie.

## Kryteria akceptacji i weryfikacja

- Testy UI, API i setup oraz ich helpery mają opisane indywidualne akcje i asercje; konwencja dotyczy również hooków i fixture'ów.
- Przykładowy przechodzący i celowo padający test pokazują na żywo pary START/END, właściwe wyniki, czasy oraz expected/actual lub jawne `unavailable`; błąd pozostaje błędem testu.
- Test web-first potwierdza zachowanie auto-wait, a przypadki negacji i soft assertion zachowują semantykę Playwright.
- Uruchomienie co najmniej dwóch workerów i testu z retry daje niezależne załączniki dla każdej próby, bez obcych wpisów i kolizji; linie terminala pozwalają rozróżnić testy.
- Sprawdzone są błąd akcji, timeout, pominięcie i przerwanie, w tym uczciwe oznaczenie niekompletnych logów przy utracie procesu.
- Sekrety i dane osobowe umieszczone kontrolnie w opisach, wartościach i błędach nie występują w nowych logach terminala ani załącznikach.
- Istniejące raporty, trace i testy zachowują działanie; przechodzą odpowiednie kontrole typów, lint i testy walidujące mechanizm. Pełny przebieg e2e wymaga dostępnego środowiska i bazy projektu.

## Otwarte ograniczenia

Wymóg dokładnej wartości rzeczywistej dla każdej udanej asercji web-first może być niewykonalny przez publiczne API bez zmiany semantyki. Specyfikacja wymaga jawnego `unavailable` w takich przypadkach, zamiast zmyślania wartości. Niezależne równoczesne przebiegi mogą wpływać na wspólną bazę dev (ADR-0011); izolacja logów nie rozwiązuje izolacji danych.

## Materiały źródłowe

- [Reporter Playwright](https://playwright.dev/docs/api/class-reporter) — zdarzenia testów i kroków.
- [TestInfo i załączniki](https://playwright.dev/docs/api/class-testinfo#test-info-attach).
- [Asercje Playwright](https://playwright.dev/docs/test-assertions) — ponawianie i asercje soft.
- [Retry i procesy workerów](https://playwright.dev/docs/test-retries).
