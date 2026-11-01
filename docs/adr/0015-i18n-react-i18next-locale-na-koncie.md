# ADR-0015: Interfejs PL/EN przez react-i18next, język zapisany na koncie użytkownika

- **Status:** Zaakceptowany
- **Retrospektywny:** nie
- **Data decyzji:** 2026-10-30 (źródło: spec Planu 06)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Cały tekst interfejsu klienta jest dziś wpisany na sztywno po polsku. Użytkownik zażądał co najmniej dwóch wersji językowych interfejsu: polskiej i angielskiej. Plan 06 dodaje ekran ticketów z kilkudziesięcioma nowymi napisami. Treść ticketów i odpowiedzi nie podlega tłumaczeniu.

## Decyzja

Interfejs tłumaczymy przez `i18next` + `react-i18next` + `i18next-browser-languagedetector`. Tłumaczenia `pl.json` i `en.json` są wbudowane w bundle, a `fallbackLng` to `pl`. Język zalogowanego użytkownika zapisujemy w nowej kolumnie `User.locale` (`pl` | `en` | `null`), dodanej jako `additionalFields` w Better Auth. Niezalogowany użytkownik korzysta z języka zapisanego w przeglądarce.

## Rozważane opcje

- **Wczytywanie tłumaczeń z serwera (`i18next-http-backend`) albo bundle:** wybrano bundle.
- **Zapis języka tylko w przeglądarce albo na koncie:** wybrano konto, a przeglądarkę tylko dla niezalogowanych (decyzja użytkownika).

## Konsekwencje

**Pozytywne**

- Język jest ten sam na każdym urządzeniu zalogowanego użytkownika.
- Klucze tłumaczeń są typowane, więc literówka zatrzymuje `pnpm typecheck` i commit [wniosek].
- Serwer nie musi znać języka: kody statusów i błędów tłumaczy front.

**Negatywne / koszty**

- Każdy napis w UI musi przejść przez klucz tłumaczenia, łącznie z ekranami z Planu 05.
- Kolejny język powiększa bundle, bo tłumaczenia nie są dociągane osobno [wniosek].
- Testy szukające elementów po tekście muszą startować ze stałym językiem.

**Niewiadome**

- Czy maile do klientów (Plan 08) mają używać języka agenta, klienta czy stałego.

## Dowody

- `docs/superpowers/specs/2026-10-30-frontend-tickets-design.md` – sekcje „Wielojęzyczność (i18n)” i „Pole `locale` na użytkowniku”
- `client/src/pages/LoginPage.tsx`, `client/src/App.tsx` – napisy UI wpisane po polsku przed Planem 06
- `server/src/lib/auth.ts` – istniejące `additionalFields` (`role`, `isBlocked`)
