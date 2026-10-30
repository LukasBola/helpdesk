# Design: Frontend Core (Plan 05)

**Data:** 2026-10-29 (rewizja 2: po review architekta i builder-check)
**Status:** Zaakceptowany do planowania

## Kontekst i cel

Klient (`client/`) to dziś pusty scaffold: Vite + React 18 + Tailwind 3 + kilka komponentów shadcn (`button`, `card`, `badge`, `input`, `label`, `select`, `table`). `App.tsx` renderuje tylko nagłówek. Zainstalowane są już `react-router-dom` 6, `@tanstack/react-query` 5, `axios` i `lucide-react`. Vite proxy przekierowuje `/api` na `http://localhost:3000`.

Backend ma działającą autentykację Better Auth 1.7.14 (PR #8): email + hasło, rejestracja wyłączona, `role` (`AGENT`/`ADMIN`) i `isBlocked` w `session.user`. Endpointy ticketów to `GET /api/tickets`, `GET /api/tickets/:id` i `PATCH /api/tickets/:id`. `requireAuth` zwraca 401 dla braku sesji **i** dla zablokowanego użytkownika.

Cel Planu 05: **szkielet aplikacji**, na którym Plan 06 i dalsze zbudują właściwe ekrany. Obejmuje logowanie, ochronę tras, layout (sidebar + header) z ładnym, nowoczesnym wyglądem, wylogowanie, stronę 404 i obsługę telefonu.

Stary `plans/05-frontend-core.md` służy tylko jako wejście. Jego `AuthContext` z `/api/auth/me` i logowanie przez axios są nieaktualne.

## Cele

- Logowanie email + hasło przez `better-auth/react`.
- Trasy chronione: bez sesji przekierowanie na `/login`, a po zalogowaniu powrót na stronę, na którą użytkownik chciał wejść.
- AppShell w stylu „Soft / pastel” (opis niżej), wspólny dla wszystkich zalogowanych ekranów.
- Wylogowanie z menu pod avatarem.
- Trasa `/users` i pozycja w sidebarze widoczne tylko dla `ADMIN`.
- Strona 404 w tym samym stylu.
- Obsługa mobile: na telefonie aplikacja jest w pełni używalna (szczegóły niżej).
- Infrastruktura pod kolejne plany: instancja axios, `QueryClient`, routing i setup testów.

## Poza zakresem (non-goals)

- Lista i szczegóły ticketów: to Plan 06. W Planie 05 `/tickets` jest zaślepką.
- Warianty odznak priorytetu: Plan 06.
- Kafelki ze statystykami (Otwarte / Pilne / AI) i endpoint statystyk: później, osobno.
- Zarządzanie użytkownikami (Plan 09): `/users` jest zaślepką. Plan 09 nadal musi usuwać sesje przy blokowaniu.
- Baza wiedzy (Plan 10): zaślepka.
- Tryb ciemny.
- Rejestracja, reset hasła, OAuth i 2FA.
- Konfiguracja produkcyjnego deploymentu (Docker/nginx/Railway). Plan 05 jedynie nie może jej utrudnić (patrz „Założenie produkcyjne”).

## Anty-cele (porażka, nawet jeśli „działa”)

- Generyczny wygląd domyślnego shadcn (szaro-granatowy, kanciasty). Użytkownik wybrał konkretny kierunek wizualny i ma go dostać.
- Migotanie ekranu logowania u zalogowanego użytkownika przy odświeżeniu strony. Dopóki sesja się ładuje, pokazujemy neutralny stan ładowania, a nie formularz ani przekierowanie.
- Ujawnienie, czy konto istnieje albo jest zablokowane. Dotyczy zarówno tekstu w UI, jak i odpowiedzi API widocznej w zakładce Network.
- Pętla przekierowań (`/login` ↔ `/tickets`) w jakimkolwiek stanie sesji.
- Layout, który na telefonie wymaga przewijania w poziomie albo ma sidebar zasłaniający treść na stałe.

## Kierunek wizualny: „Soft / pastel” (wybrany przez użytkownika)

Mockupy z sesji brainstormingu: `.superpowers/brainstorm/12623-1793308680/content/style-direction.html` (wariant B) i `login-and-shell.html`.

- **Tło aplikacji:** delikatny gradient od indygo do turkusu (w okolicach `#eef2ff` → `#f0fdfa`).
- **Powierzchnie:** białe karty, mocno zaokrąglone (ok. 14–18 px), z miękkim cieniem zabarwionym na indygo.
- **Akcent główny:** indygo (ok. `#4f46e5`), drugi akcent: turkus (ok. `#14b8a6`). Logo to kwadrat z zaokrąglonymi rogami i gradientem indygo → turkus, obok napis „helpdesk”.
- **Sidebar (desktop):** pływająca biała karta po lewej, oddzielona od krawędzi okna. U góry logo, pod nim nawigacja: Tickety (`/tickets`), Moje (`/tickets/mine`), Baza wiedzy (`/knowledge-base`), Użytkownicy (`/users`, tylko ADMIN). Aktywna pozycja ma jasne tło indygo i tekst w kolorze indygo. Ikony z `lucide-react`.
- **Header w obszarze treści:** powitanie „Dzień dobry,” z imieniem użytkownika pod spodem i emoji 👋, a po prawej avatar (gradientowe kółko z inicjałami). Kliknięcie avatara otwiera menu z imieniem, rolą i opcją „Wyloguj” w kolorze różowo-czerwonym.
- **Logowanie (`/login`):** ten sam gradient, na środku jedna biała karta z logo, podpisem „Zaloguj się do panelu agenta”, polami E-mail i Hasło, polem błędu (jasnoróżowe tło) i pełnoszerokościowym przyciskiem w kolorze indygo.
- **Implementacja stylu:** przez zmienne motywu shadcn w `client/src/index.css` (`--primary`, `--radius` itd.), żeby istniejące komponenty `ui/*` dostały nowy wygląd automatycznie. Gradient tła i cienie kart przez klasy Tailwind lub rozszerzenie `tailwind.config.js`. Sposób implementacji zostawiam wykonawcy. Blok `.dark` zostaje nietknięty, bo dark mode jest poza zakresem.
- **Język UI:** polski, jak w mockupach.

## Mobile (wymaganie użytkownika)

Breakpoint: poniżej `md` (768 px) obowiązuje układ mobilny.

- **Sidebar** jest ukryty. W headerze po lewej pojawia się przycisk menu (hamburger). Otwiera on wysuwany z lewej panel (drawer) z tą samą nawigacją, na przyciemnionym tle. Panel zamyka się po wyborze pozycji, a także przez kliknięcie tła, Esc lub przycisk X. Fokus i Esc zapewnia Radix, więc nie trzeba ich osobno implementować ani testować.
- **Header:** hamburger, logo lub powitanie (skrócone, jeśli brakuje miejsca) i avatar z tym samym menu.
- **Treść** zajmuje pełną szerokość z mniejszymi marginesami. Brak poziomego scrolla przy szerokości 360 px.
- **Logowanie:** karta zajmuje prawie pełną szerokość ekranu z bocznym marginesem.
- **Cele dotykowe** mają co najmniej 44 px wysokości (pozycje nawigacji, przyciski, menu avatara).
- Testujemy w przeglądarce w trybie responsywnym przy 360–390 px i przy 1280 px.

Komponenty: shadcn `sheet` (oparty na `@radix-ui/react-dialog`) dla drawera i `dropdown-menu` dla menu avatara. Dodanie ich i zależności Radix to moja decyzja.

## Przepływ i zachowanie

- **Start aplikacji:** dopóki `useSession()` ładuje sesję, widoczny jest pełnoekranowy stan ładowania na gradiencie (logo + spinner).
- **„Zalogowany” oznacza:** jest sesja **i** `user.isBlocked !== true`. Zablokowany użytkownik z istniejącą sesją jest traktowany jak niezalogowany wszędzie: w `ProtectedRoute` i w przekierowaniu z `/login`.
- **Brak sesji na trasie chronionej:** przekierowanie na `/login`, a oryginalna ścieżka (pathname + search) trafia do `location.state.from`.
- **Logowanie udane:** nawigacja do `from` z `replace`, żeby „wstecz” nie wracało do formularza. `from` jest akceptowane tylko wtedy, gdy jest ścieżką względną zaczynającą się od `/`, ale nie od `//`, i nie jest `/login`. W każdym innym przypadku cel to `/tickets`.
- **Logowanie nieudane:** `signIn.email` zwraca `{ error }` i nie rzuca wyjątkiem. Komunikat wybieramy po **statusie HTTP**, a nie po treści:
  - 401 / 403: „Nieprawidłowy e-mail lub hasło”;
  - 429 (rate limit Better Auth): „Za dużo prób. Spróbuj za chwilę.”;
  - pozostałe (sieć, 5xx): „Coś poszło nie tak. Spróbuj ponownie.”
- **Podczas wysyłania** przycisk jest nieaktywny i pokazuje stan ładowania. Pola mają walidację HTML (`type="email"`, `required`).
- **Zalogowany na `/login`:** od razu przekierowanie na `/tickets`.
- **`/`:** przekierowanie na `/tickets`.
- **Wylogowanie, w tej kolejności:** `await signOut()`, potem `navigate('/login', { replace: true })`, potem `queryClient.clear()`. Dzięki temu zamontowane zapytania nie robią refetchu i nie dostają 401 w trakcie wylogowania.
- **401 z API w trakcie pracy** (interceptor axios, tylko dla URL-i spoza `/auth`): wywołuje `authClient.signOut()` i `queryClient.clear()`. Ma ochronę przed wielokrotnym wywołaniem: jedna flaga „w toku”, więc równoległe 401 nie robią kilku wylogowań. Usunięcie sesji sprawia, że `ProtectedRoute` sam przekieruje na `/login`. Ten mechanizm obsługuje też zablokowanego użytkownika, bo `signOut` usuwa jego sesję na serwerze.
- **AGENT na `/users`:** przekierowanie na `/tickets`. Pozycja „Użytkownicy” nie jest renderowana w sidebarze. To tylko UX, bo właściwą ochronę daje serwer (`requireRole`).
- **Nieznana ścieżka:** strona 404 („Nie znaleziono strony”) z przyciskiem „Wróć do ticketów” zawsze prowadzącym na `/tickets`. Niezalogowanego przekieruje stamtąd `ProtectedRoute`.

## Wiring techniczny

### Klient

- **Zależność:** `better-auth` w `client/package.json` w tej samej wersji co na serwerze (`1.7.14`).
- **`lib/auth-client.ts`:** `createAuthClient` z `better-auth/react` **bez `baseURL`**. Fallback to `window.location.origin + '/api/auth'`, czyli przez proxy Vite. Nie wpisywać `localhost:3000`, bo to omija proxy i psuje ciasteczka. Typy dodatkowych pól przez **jawną** formę: `inferAdditionalFields({ user: { role: { type: ['AGENT','ADMIN'] }, isBlocked: { type: 'boolean' } } })`. Nie używać `inferAdditionalFields<typeof auth>()`, bo import `server/src/lib/auth.ts` do klienta wciąga Prismę, `env.ts` i typy Node, co psuje typecheck. Definicja jest ręcznie zsynchronizowana z `server/src/lib/auth.ts`, więc trzeba dodać komentarz o tym w obu miejscach. Moduł eksportuje instancję oraz `useSession`, `signIn` i `signOut`.
- **`lib/api.ts`:** instancja axios (`baseURL: '/api'`, `withCredentials: true`) z interceptorem 401 opisanym wyżej.
- **`lib/queryClient.ts`:** `QueryClient` z `retry: (count, err) => !isAxiosError(err) || ((err.response?.status ?? 500) >= 500 && count < 2)`, czyli bez ponawiania 4xx. Do tego `refetchOnWindowFocus: false`, bo sesję na focus odświeża już Better Auth, a dla danych ticketów decyzję podejmie Plan 06.
- **Routing:** `react-router-dom` 6 (`createBrowserRouter` albo `<Routes>`, do wyboru wykonawcy). Trasy: `/login`, `/` → `/tickets`, a chronione pod layoutem AppShell: `/tickets`, `/tickets/mine`, `/knowledge-base` i `/users` (ADMIN), oraz `*` → 404.
- **Komponenty:** `ProtectedRoute` (sesja niezablokowana + opcjonalna rola), `AppShell` (sidebar, header, drawer, `<Outlet/>`), `LoginPage`, `NotFoundPage` i proste strony-zaślepki.
- **Avatar i powitanie:** inicjały avatara z `user.name` (pole wymagane w modelu `User`), a imię w powitaniu to pierwsze słowo z `user.name`.

### Serwer

- **`trustedOrigins` w `server/src/lib/auth.ts`.** Potwierdzone w źródłach Better Auth 1.7.14: POST logowania niesie nagłówki `Sec-Fetch-*`, więc sprawdzanie originu jest wymuszone. Proxy Vite zachowuje `Origin: http://localhost:5173`, a jedynym zaufanym originem jest `BETTER_AUTH_URL` (`:3000`), więc bez tej zmiany logowanie dostaje 403.
  - Wartość pochodzi z nowej zmiennej `CLIENT_URL` w `env.ts`.
  - Poza produkcją ma domyślną wartość `http://localhost:5173`. W `NODE_ENV=production` jest **wymagana**, żeby błędny deployment nie przeszedł po cichu.
  - Trzeba ją dopisać do `.env.example`.
- **Jednolity błąd logowania.** Hook `session.create.before` dla zablokowanego konta rzuca dziś `APIError('UNAUTHORIZED', { message: 'Invalid credentials' })`, a Better Auth dla złego hasła zwraca `INVALID_EMAIL_OR_PASSWORD` („Invalid email or password”). Zmiana: hook ma rzucać **ten sam** błąd, czyli `APIError.from('UNAUTHORIZED', BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD)` lub równoważny o identycznym kodzie i treści. Test serwerowy porównuje treść odpowiedzi dla złego hasła i dla zablokowanego konta: mają być identyczne.
- **Test `trustedOrigins`.** Uwaga: pod Vitestem Better Auth pomija sprawdzanie originu (`skipOriginCheck = isTest()`), więc test „logowanie z `Origin: :5173` przechodzi” przeszedłby także bez zmiany. Wystarczy test jednostkowy, że `auth.options.trustedOrigins` zawiera `env.CLIENT_URL`, oraz ręczna weryfikacja logowania przez Vite.

### Założenie produkcyjne (moja decyzja)

`tech-stack.md` mówi, że nginx serwuje zbudowany frontend. Zakładamy, że w produkcji SPA i API są pod **jednym originem**: nginx proxuje `/api` do serwera, tak jak proxy Vite w dev. Wtedy `/api` w axios, brak `baseURL` w kliencie auth i ciasteczka `SameSite=Lax` działają bez zmian, a `CLIENT_URL` = publiczny URL aplikacji. Wariant cross-origin wymagałby innego projektu (CORS, ciasteczka) i nie jest planowany.

### Testy klienta (Vitest + React Testing Library + jsdom)

- **`test-setup.ts`:**
  - `import '@testing-library/jest-dom/vitest'` (dodać zależność `@testing-library/jest-dom`);
  - polyfille dla Radix w jsdom: `PointerEvent`, `Element.prototype.hasPointerCapture`/`releasePointerCapture` i `scrollIntoView`, a w razie potrzeby `matchMedia`.
- **Mockujemy `@/lib/auth-client`** (`useSession`, `signIn.email`, `signOut`), a nie `better-auth/react`, bo komponenty korzystają z instancji z tego modułu.
- **Scenariusze minimum:**
  - brak sesji na `/tickets` → widać stronę logowania;
  - stan ładowania sesji → nie widać ani formularza, ani treści;
  - zablokowany użytkownik z sesją → traktowany jak niezalogowany, bez pętli;
  - błąd 401 przy logowaniu → „Nieprawidłowy e-mail lub hasło”, a 429 → komunikat o zbyt wielu próbach;
  - udane logowanie → nawigacja na `from` / `/tickets`, a `from` w postaci `//evil.com` → `/tickets`;
  - AGENT nie widzi „Użytkownicy” i jest przekierowany z `/users`, a ADMIN widzi;
  - wylogowanie wywołuje `signOut` i trafia na `/login`;
  - interceptor 401 wywołuje `signOut` dokładnie raz przy kilku równoległych 401;
  - przycisk hamburgera otwiera drawer z nawigacją (test zachowania, nie wyglądu).
- **Weryfikacja wizualna** (desktop + mobile) ręcznie w przeglądarce, łącznie z prawdziwym logowaniem przez Vite. Testy E2E to Plan 11.

## Ograniczenia

- Pre-commit (`.husky/pre-commit`) uruchamia `pnpm typecheck` i `prettier --check .`, więc każdy commit musi się kompilować i być sformatowany.
- Pliki `.env*` (poza `.env.example`) wolno edytować tylko za zgodą użytkownika. Dzięki domyślnej wartości `CLIENT_URL` w dev nie trzeba ich ruszać.
- Dodać `.superpowers/` do `.gitignore` (katalog z mockupami brainstormingu).
- React 18, Tailwind 3 i shadcn „default” bez upgrade'ów w tym planie.

## Zostawione wykonawcy

- Dokładne odcienie, cienie i promienie w zakresie opisanego kierunku.
- Struktura katalogów w `client/src` (sugestia: `lib/`, `components/`, `components/layout/`, `pages/`).
- Wybór API routera (`createBrowserRouter` vs `<Routes>`).
- Wygląd stron-zaślepek (spójny ze stylem, np. pusta karta z ikoną i tekstem „Wkrótce”).
- Animacje (subtelne, np. wysuwanie drawera, są mile widziane, ale nie są wymagane).

## Decyzje podjęte przeze mnie (do sprawdzenia przez użytkownika)

1. Zablokowany użytkownik z sesją jest traktowany jak niezalogowany, a interceptor 401 wylogowuje (`signOut`).
2. Serwer zwraca identyczny błąd dla złego hasła i zablokowanego konta: mała zmiana w `auth.ts` i test.
3. `CLIENT_URL` jest wymagany w produkcji, w dev ma wartość domyślną `:5173`. Produkcja zakłada jeden origin (nginx proxuje `/api`).
4. Radix `sheet` + `dropdown-menu` dla drawera i menu avatara.
5. Warianty odznak priorytetu przeniesione do Planu 06.
