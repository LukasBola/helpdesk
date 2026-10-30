# ADR-0006: Better Auth jako warstwa uwierzytelniania

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-07-28 (źródło: commit `63c68d0`, spec); wdrożenie 2026-10-28 (`dbc9243`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** Zastępuje ADR-0005

## Kontekst

Własna autentykacja (ADR-0005) działała, ale wymagała utrzymywania kodu sesji, haszowania i logowania. Nie było prawdziwych użytkowników produkcyjnych, tylko seedowany admin. Cel ze specyfikacji: „mniej własnego kodu do utrzymania”.

## Decyzja

Better Auth jako zamiennik 1:1: tylko e-mail i hasło, role i `isBlocked` jako `additionalFields` z `input: false`, przejęcie istniejącego modelu `User`. Rejestracja wyłączona (`disableSignUp`). Blokada w `databaseHooks.session.create.before`. Bez `cookieCache`. Użytkowników tworzy `createCredentialUser()`.

## Rozważane opcje

Specyfikacja dokumentuje warianty szczegółowe: blokada przez `hooks.before` na `/sign-in/email` (odrzucona: wyciek czasowy, nie obejmuje innych ścieżek tworzenia sesji) i włączony `cookieCache` (odrzucony: nieaktualne `role`/`isBlocked`). Brak zapisu o porównaniu z innymi bibliotekami.

## Konsekwencje

**Pozytywne**

- Usunięto `express-session`, `connect-pg-simple`, `bcrypt` i `SESSION_SECRET`.
- Blokada obejmuje każdą ścieżkę tworzenia sesji; brak publicznej rejestracji.

**Negatywne / koszty**

- Sesja zablokowanego użytkownika nadal działa na endpointach samego Better Auth; unieważnianie sesji przy blokadzie przeniesiono do Planu 09 (test e2e A14 oznaczony `fixme`).
- Pola użytkownika w kliencie są definiowane ręcznie, bez importu typów z serwera.
- Klient SPA wymaga `trustedOrigins` dla originu frontendu (ADR-0007).

**Niewiadome**

- Brak.

## Dowody

- `docs/superpowers/specs/2026-07-28-better-auth-migration-design.md` – cel, decyzje rewizji 2, odrzucone warianty
- `dbc9243`, `b73d4a1`, `243a996` – wdrożenie, seed, usunięcie starych zależności
- `f70021e` – wymaganie unieważniania sesji przeniesione do Planu 09
- `e2e/api/auth.api.spec.ts` – test A14 (`test.fixme`)
