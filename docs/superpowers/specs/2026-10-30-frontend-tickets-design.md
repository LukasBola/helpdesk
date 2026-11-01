# Design: Frontend Tickets (Plan 06)

**Data:** 2026-10-30
**Status:** Zaakceptowany do planowania (po builder-check)

## Kontekst i cel

Plan 05 (PR #9) dał szkielet klienta: logowanie przez `better-auth/react`, `ProtectedRoute`, `AppShell` w stylu „Soft / pastel” z sidebarem i mobilnym drawerem, instancję axios (`client/src/lib/api.ts`), `QueryClient` i suitę Playwright w `e2e/`. Trasy `/tickets` i `/tickets/mine` to dziś zaślepki (`PlaceholderPage`). Cały tekst UI jest wpisany na sztywno po polsku.

Backend ma już:

- `GET /api/tickets`: filtry `status`, `priority`, `assigneeId`, `search` (temat, email i nazwa klienta), sortowanie `orderBy` (`createdAt` | `updatedAt` | `priority`) + `order`, paginacja `page`/`limit` (domyślnie 25, max 100). Zwraca `{ tickets, total, page, limit }`, ticket z `assignee { id, name, email }`.
- `GET /api/tickets/:id`: ticket z `assignee`, `history[]` (z `user { id, name }`, rosnąco po `createdAt`) i `replies[]` (z `user { id, name }`, rosnąco po `sentAt`).
- `PATCH /api/tickets/:id`: `status`, `priority`, `assigneeId` (nullable). Zapisuje wpisy `TicketHistory` (`field` = `status` | `priority` | `assigneeId`, `oldValue`/`newValue` jako surowe wartości, dla przypisania to id użytkownika). Zablokowany lub nieznany assignee daje 422.
- Model `Reply` (`ticketId`, `userId`, `body`, `sentAt`, `resendId?`) bez żadnego endpointu.

**Kim jest użytkownik i co robi (słowa użytkownika):** agent supportu rano otwiera listę otwartych ticketów z filtrami, potem odpowiada na najstarsze.

Cel Planu 06: ekran pracy z ticketami w układzie skrzynki (lista + ticket obok), z odpowiadaniem zapisywanym w wątku, przypisywaniem do dowolnego agenta oraz interfejsem w dwóch językach (PL i EN).

Stary `plans/06-frontend-tickets.md` to tylko materiał wejściowy.

## Cele

1. **Lista ticketów** z filtrami (status, priorytet, przypisanie, wyszukiwanie), domyślnie: otwarte, od najstarszych.
2. **Szczegóły ticketu obok listy** (układ B „skrzynka”, wybór użytkownika): zmiana statusu, priorytetu i przypisania, wątek, pole odpowiedzi.
3. **Odpowiedź zapisywana w wątku** (decyzja użytkownika). Mail do klienta nie wychodzi; to Plan 08.
4. **Po wysłaniu odpowiedzi** ticket w statusie Otwarty przechodzi na W toku, a agent zostaje na tym tickecie (decyzja użytkownika).
5. **Wątek z historią**: wiadomość klienta, odpowiedzi i zmiany (status, priorytet, przypisanie) na jednej osi czasu, przeplatane (decyzja użytkownika).
6. **Przypisanie do dowolnego agenta z listy** (decyzja użytkownika), więc potrzebny jest `GET /api/users`.
7. **Dwa języki interfejsu: polski i angielski** (wymaganie użytkownika). Tłumaczymy tylko UI; treść ticketów i odpowiedzi zostaje w oryginale. Język zapisany na koncie użytkownika; dla niezalogowanego w przeglądarce (decyzja użytkownika).
8. **Rzeczy odłożone z Planu 05**, potrzebne na tym ekranie: hook `useCurrentUser`, miejsce na tytuł strony w shellu, semantyczne tokeny kolorów (statusy, priorytety), świadomie dobrany font i skala typografii.

## Poza zakresem (non-goals)

- Wysyłka maili do klienta, Resend, `Reply-To` z plus-addressingiem: Plan 08.
- Sugestie odpowiedzi, klasyfikacja i streszczenia AI: Plan 07. Pola `summary`/`category` nie są pokazywane.
- Zarządzanie użytkownikami i różnice uprawnień agent/admin na tym ekranie: Plan 09. W Planie 06 agent i admin widzą to samo.
- Tłumaczenie treści ticketów, maili ani komunikatów logowanych na serwerze.
- Więcej języków niż PL i EN (struktura ma jednak pozwalać dodać kolejny bez przeróbek).
- Edycja i usuwanie odpowiedzi, załączniki, formatowanie tekstu (rich text), notatki wewnętrzne.
- Aktualizacje na żywo (websocket, polling). Wystarcza odświeżenie po własnych akcjach i domyślne zachowanie TanStack Query.
- Tryb ciemny.

## Anty-cele (porażka, nawet jeśli „działa”)

- Agent traci kontekst: po zmianie statusu lub wysłaniu odpowiedzi znika mu otwarty ticket, zaznaczenie albo filtry.
- Odpowiedź zapisana, ale status lub wpis w historii nie (albo odwrotnie). Ma to być jedna operacja.
- Mieszanka języków na ekranie: część napisów po polsku przy wybranym angielskim, nieprzetłumaczone kody (`IN_PROGRESS`) widoczne dla użytkownika, daty w złym formacie.
- Wygląd odbiegający od „Soft / pastel” z Planu 05 albo nieużywalny na telefonie.

## Ekran: układ „skrzynka” (wybór użytkownika)

Makieta wybrana w brainstormingu: `.superpowers/brainstorm/97417-1793391164/content/layout.html`, wariant B.

### Desktop (≥ `lg`)

- **Lewa kolumna (lista, ok. 40% szerokości):** nad listą pasek filtrów: status, priorytet, przypisanie, pole wyszukiwania. Wiersz: wiek ticketu („3 dni”), temat (ucinany), klient (nazwa lub email), odznaka priorytetu, avatar/inicjały osoby przypisanej. Zaznaczony wiersz wyróżniony pastelowym tłem. Na dole przycisk „Pokaż więcej”, gdy `tickets.length < total`.
- **Prawa kolumna (ticket):** nagłówek z tematem i danymi klienta, pod nim trzy kontrolki: status, priorytet, przypisanie. Niżej wątek, a na dole pole odpowiedzi z przyciskiem „Wyślij”.
- Bez zaznaczonego ticketu prawa kolumna pokazuje pusty stan „Wybierz ticket”.

### Mobile (< `lg`) (moja decyzja)

Jedna kolumna. `/tickets` pokazuje listę. Wejście w ticket pokazuje sam ticket z przyciskiem „wstecz”, który wraca do listy z zachowanymi filtrami. Cele dotykowe ≥ 44 px, jak w Planie 05.

### Adresy (moja decyzja)

- `/tickets`: lista bez zaznaczenia. `/tickets/:id`: lista + otwarty ticket. Link do ticketu można wysłać koledze, a odświeżenie nie gubi zaznaczenia.
- Filtry żyją w query stringu (`?status=OPEN&priority=URGENT&assignee=me&search=faktura`), więc przechodzą przez nawigację między ticketami i przycisk wstecz.
- Brak parametru `status` w URL oznacza domyślnie Otwarte. Opcja „Wszystkie” jest jawna (np. `status=all`).
- Filtr przypisania ma cztery opcje (decyzja użytkownika): **Wszystkie** (brak parametru), **Moje** (`assignee=me`), **Nieprzypisane** (`assignee=none`) i **konkretny agent** (`assignee=<id>`, lista z `GET /api/users`, bez zablokowanych). Zablokowany agent wskazany w URL nadal filtruje, ale nie jest proponowany w menu (moja decyzja).
- Sortowanie: domyślnie `createdAt asc` (najstarsze najpierw). Przełącznik sortowania: najstarsze, najnowsze, priorytet (od najwyższego). Też w URL.
- Przy sortowaniu po priorytecie tickety o tym samym priorytecie idą od najstarszych (moja decyzja, zgodna z „odpowiada na najstarsze”). Dziś API rozstrzyga remis po `id` w tym samym kierunku, więc `priority desc` dałby najnowsze najpierw; potrzebna zmiana serwera: drugi klucz sortowania `createdAt asc` (a potem `id`) przy `orderBy=priority`.
- `/tickets/mine` z sidebara to ten sam ekran z filtrem przypisania ustawionym na zalogowanego użytkownika. Ticket otwarty z tego widoku dostaje adres `/tickets/:id?assignee=me` (moja decyzja).
- Nieistniejący `:id` (404 z API) pokazuje w prawej kolumnie komunikat „Nie znaleziono ticketu”, lista działa dalej.

### Zachowanie listy

- Po zmianie statusu, priorytetu lub przypisania i po wysłaniu odpowiedzi lista się odświeża (invalidacja zapytań). Jeśli ticket przestaje pasować do filtra, znika z listy, ale **zostaje otwarty po prawej** (moja decyzja).
- „Pokaż więcej” dociąga kolejne strony i dokleja je pod spodem (moja decyzja; bez numerów stron).
- Puste stany: „Brak ticketów dla tych filtrów” (z przyciskiem wyczyszczenia filtrów), ładowanie (szkielety wierszy), błąd sieci z „Spróbuj ponownie”.
- Wyszukiwanie z opóźnieniem ok. 300 ms, żeby nie strzelać zapytaniem na każdy znak.

## Wątek

Jedna oś czasu, od najstarszego wpisu (decyzja użytkownika co do przeplatania):

1. **Wiadomość klienta** (`ticket.body`), zawsze pierwsza: nadawca, data, treść.
2. **Odpowiedzi agentów** (`replies`): dymki wyrównane/zabarwione inaczej niż wiadomość klienta, z imieniem autora i datą.
3. **Wpisy historii** (`history`): drobne, wyszarzone linie między dymkami, np. „Anna zmieniła status: Otwarty → W toku · 10:42”, „Anna przypisała Tomka”, „Anna zmieniła priorytet na Pilny”.

Klient skleja `replies` i `history` i sortuje po czasie. Przy równym czasie (odpowiedź i automatyczna zmiana statusu z tej samej transakcji) odpowiedź idzie pierwsza (moja decyzja).

Treść wiadomości i odpowiedzi to zwykły tekst z zachowaniem nowych linii, bez interpretacji HTML.

Wpis historii przypisania zawiera id użytkowników, więc klient zamienia je na imiona z listy użytkowników (`GET /api/users`). Nieznane id pokazuje się jako „nieznany użytkownik”.

## Odpowiadanie

- Pole tekstowe (textarea, rośnie z treścią) i przycisk „Wyślij”. Pusta treść (po przycięciu spacji) blokuje przycisk.
- W trakcie wysyłania przycisk jest nieaktywny. Po sukcesie pole się czyści, odpowiedź pojawia się w wątku, status i lista się odświeżają. Po błędzie treść zostaje w polu, a obok pojawia się komunikat.
- Skrót Ctrl/Cmd+Enter wysyła (moja decyzja).
- Brak informacji „wysłano do klienta”, bo mail nie wychodzi. _Moja decyzja:_ pod polem krótka notka, że odpowiedź trafia na razie tylko do wątku, żeby agent nie myślał, że klient ją dostał.

## Serwer: nowe endpointy

### `POST /api/tickets/:id/replies`

- Body: `{ body: string }`, przycięte, niepuste, z rozsądnym limitem długości (wykonawca dobiera, np. 10 000 znaków). Błąd walidacji: 422, jak w istniejących trasach.
- W jednej transakcji: tworzy `Reply` z `userId` = zalogowany użytkownik; jeśli ticket ma status `OPEN`, zmienia go na `IN_PROGRESS` i zapisuje wpis `TicketHistory` (`field: 'status'`, autor = ten sam użytkownik). Inny status pozostaje bez zmian (decyzja użytkownika dotyczy przejścia z Otwarty; reszta to moja decyzja).
- Nieistniejący ticket: 404. Odpowiedź: utworzony `Reply` z `user { id, name }` (201).
- Logikę statusu i historii warto współdzielić z `updateTicket`, żeby nie było dwóch implementacji zapisu historii.
- Mail nie jest wysyłany; `resendId` zostaje `null`. Plan 08 dołoży wysyłkę w tym samym miejscu.

### Zmiany w `GET /api/tickets`

- **Nieprzypisane:** dziś `assigneeId` filtruje tylko po dokładnym id, więc nie da się pobrać ticketów bez przypisania. Dochodzi wartość specjalna, np. `assigneeId=none` → `where.assigneeId = null` (wykonawca wybiera dokładną postać, z walidacją zod i testami). `me` rozwiązuje klient na id zalogowanego użytkownika.
- **Sortowanie po priorytecie:** w obrębie priorytetu najstarsze najpierw (patrz „Adresy”).

### `GET /api/users`

- Dostępny dla każdego zalogowanego użytkownika (agent też musi przypisywać).
- Zwraca tylko `id`, `name`, `email`, `role`, `isBlocked`, posortowane po imieniu (moja decyzja). Bez paginacji: zespół supportu jest mały.
- Klient pokazuje w menu przypisania tylko niezablokowanych; pełna lista służy do zamiany id na imiona w historii.
- Plan 09 rozbuduje ten endpoint (CRUD dla admina) zamiast tworzyć nowy.

### Pole `locale` na użytkowniku

- Nowa kolumna `User.locale`, nullable, dozwolone `pl` | `en`. `null` = użytkownik jeszcze nie wybrał.
- Zarejestrowana w Better Auth jako `user.additionalFields.locale`, z `input: true`, żeby zalogowany użytkownik mógł ją zmienić przez `authClient.updateUser({ locale })`. Pojawia się wtedy w `session.user`. Walidacja wartości po stronie serwera (tylko `pl`/`en`), na wzór istniejącej walidacji `name` w hooku `/update-user`.
- Migracja przez `prisma migrate diff` (gotcha repo: `prisma migrate dev` nie działa w nieinteraktywnej powłoce).

## Wielojęzyczność (i18n)

Tłumaczymy wszystko, co widać w UI, łącznie z ekranami z Planu 05 (logowanie, shell, menu, 404, zaślepki).

### Biblioteka i konfiguracja

- `i18next` + `react-i18next` + `i18next-browser-languagedetector` (zweryfikowane w dokumentacji react-i18next przez Context7).
- Plik `client/src/i18n.ts` importowany w `main.tsx`. Tłumaczenia **wbudowane w bundle** jako `pl.json` i `en.json` (moja decyzja: dwa małe języki, bez ekranu ładowania i bez backendu HTTP).
- `fallbackLng: 'pl'` (moja decyzja: dzisiejszy UI jest po polsku). Obsługiwane: `pl`, `en`; każdy inny język przeglądarki trafia na fallback.
- Klucze typowane przez `CustomTypeOptions`, żeby literówka w kluczu zatrzymywała `pnpm typecheck`.
- `<html lang>` aktualizowany przy zmianie języka.

### Skąd bierze się język

1. **Niezalogowany** (strona logowania): język z przeglądarki (zapisany wybór w `localStorage`, a gdy go brak, ustawienia przeglądarki), potem fallback `pl`. Na stronie logowania mały przełącznik PL/EN (moja decyzja).
2. **Zalogowany z `session.user.locale`**: język konta wygrywa i jest ustawiany zaraz po pojawieniu się sesji. Zapisuje się też w `localStorage`, więc po wylogowaniu strona logowania zostaje w tym języku.
3. **Zalogowany bez `locale`** (`null`): zostaje bieżący język przeglądarki; nic nie zapisujemy na konto, dopóki użytkownik sam nie przełączy (moja decyzja).
4. **Przełącznik w menu avatara** (PL / EN): zmienia język od razu i zapisuje go na koncie przez `updateUser`. Błąd zapisu: język zostaje zmieniony lokalnie, pokazujemy dyskretny komunikat.

### Co tłumaczy front

- Wszystkie napisy, etykiety, puste stany, komunikaty błędów.
- Kody z API: statusy (`OPEN` → „Otwarty” / „Open”), priorytety, nazwy pól w historii.
- Błędy z serwera: front mapuje status HTTP / znany błąd na tłumaczony komunikat; serwer nie musi znać języka.
- Daty i „wiek” ticketu przez `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` w bieżącym języku.
- Tytuły stron (slot tytułu w shellu) i `document.title`.

### Testy a język

Siedem plików testów (unit + e2e) szuka elementów po polskim tekście. Testy jednostkowe i e2e startują ze stałym językiem `pl`, więc istniejące selektory zostają. Dochodzą testy przełączania na EN i zapisu na koncie (patrz „Testy”).

## Rzeczy odłożone z Planu 05

- **`useCurrentUser`**: hook zwracający zalogowanego użytkownika z sesji (`id`, `name`, `role`, `locale`), używany przez filtr „Moje”, menu avatara i przełącznik języka.
- **Slot tytułu w shellu**: strona ustawia tytuł widoczny w nagłówku shella i w `document.title`; na mobile tytuł w górnym pasku.
- **Semantyczne tokeny kolorów**: zmienne CSS dla czterech statusów i czterech priorytetów (pastelowe tło + czytelny tekst, kontrast WCAG AA), używane przez odznaki `TicketStatusBadge` i `TicketPriorityBadge`. Pilny wyraźnie wyróżniony.
- **Font i skala typografii**: jeden świadomie wybrany krój dla UI (wykonawca proponuje, pasujący do „Soft / pastel”, z polskimi znakami, ładowany lokalnie lub z pewnego źródła) i skala rozmiarów w konfiguracji Tailwind. Lista i wątek mają być czytelne przy gęstych danych.

## Testy

Zgodnie z praktyką repo (TDD, Vitest + RTL na kliencie, Vitest + Testcontainers na serwerze, Playwright e2e):

- **Serwer:** `POST /replies` (sukces, OPEN → IN_PROGRESS z wpisem historii, inny status bez zmian, pusta treść 422, nieznany ticket 404, brak sesji 401, atomowość), `GET /api/users` (pola, brak hasła i danych konta, 401 bez sesji), walidacja `locale` przy `/update-user`.
- **Klient (unit):** filtry ↔ URL, sklejanie wątku (kolejność, remis), mapowanie historii na tekst, formularz odpowiedzi (blokada pustej, czyszczenie po sukcesie, zachowanie treści po błędzie), wybór języka (konto > przeglądarka > fallback), odznaki.
- **E2E (Playwright):** „otwórz najstarszy otwarty ticket → odpowiedz → status W toku → odpowiedź i wpis historii w wątku”; przypisanie do innego agenta; filtr + odświeżenie strony zachowuje stan; przełączenie na EN, wylogowanie i ponowne logowanie w nowym kontekście przeglądarki → UI po angielsku; widok mobile (lista → ticket → wstecz). Fixtures przez istniejący `pnpm --filter server e2e:fixtures seed`, rozszerzony w razie potrzeby. Test przełączania na EN używa osobnego użytkownika z fixtures, żeby zapisany `locale` nie psuł testów oczekujących polskiego (moja decyzja).

## Ograniczenia

- Każdy commit musi przejść `pnpm typecheck` i `prettier --check .` (hook pre-commit).
- `.env*` za regułą deny; Plan 06 nie wymaga nowych zmiennych środowiskowych.
- Better Auth 1.7.14: `locale` dodawane przez `additionalFields`, nie przez osobną tabelę ani własny endpoint.
- Komponenty UI na bazie istniejących shadcn/Radix (`select`, `dropdown-menu`, `sheet`, `badge`, …); nowe komponenty shadcn w razie potrzeby.

## Zostawione wykonawcy

- Dokładny podział na komponenty, hooki i pliki oraz nazewnictwo kluczy tłumaczeń.
- Wybór konkretnego fontu i wartości skali typografii (w ramach opisu wyżej).
- Dokładne odcienie tokenów statusu/priorytetu (pastelowe, AA).
- Limit długości odpowiedzi.
- Sposób współdzielenia logiki historii między `updateTicket` a tworzeniem odpowiedzi.
- Kolejność zadań w planie, z jednym wymaganiem: i18n wchodzi **przed** ekranami ticketów, żeby nie pisać napisów dwa razy.

## Decyzje podjęte przeze mnie (do sprawdzenia przez użytkownika)

1. Wybrany ticket i filtry w URL (`/tickets/:id?status=…`); brak `status` = Otwarte, „Wszystkie” jawnie.
2. Mobile: jedna kolumna, lista → ticket → wstecz.
3. Ticket, który po zmianie wypada z filtra, zostaje otwarty po prawej.
4. Paginacja przyciskiem „Pokaż więcej”.
5. Odpowiedź nie zmienia statusu innego niż Otwarty.
6. Notka pod polem odpowiedzi, że na razie nie idzie mail.
7. Ctrl/Cmd+Enter wysyła odpowiedź.
8. Przy równym czasie w wątku odpowiedź przed wpisem historii.
9. `GET /api/users` zwraca też zablokowanych (z flagą), ale menu przypisania ich nie pokazuje.
10. Tłumaczenia w bundlu, `fallbackLng: 'pl'`, przełącznik PL/EN też na stronie logowania.
11. Konto bez `locale` nie dostaje go automatycznie; zapis dopiero po ręcznym przełączeniu.
12. Agent i admin widzą w Planie 06 ten sam ekran.
13. Sortowanie po priorytecie: w obrębie priorytetu najstarsze najpierw (zmiana sortowania w `listTickets`).
14. Ticket otwarty z „Moje” zachowuje filtr `assignee=me` w adresie.
15. Zablokowany agent w URL filtruje dalej, ale nie ma go w menu filtra ani przypisania.
