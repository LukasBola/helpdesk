# ADR-0005: Sesje w bazie przez express-session i connect-pg-simple

- **Status:** Zastąpiony przez ADR-0006
- **Retrospektywny:** tak
- **Data decyzji:** 2026-04-23 (źródło: commit `d1441c4`); wdrożenie 2026-05-12 (`b00e5f8`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** Zastąpiony przez ADR-0006 (2026-10-28)

## Kontekst

Aplikacja wymaga logowania e-mail/hasło i ról `AGENT`/`ADMIN`. Wymaganie z `tech-stack.md`: sesję trzeba móc unieważnić natychmiast (prawdziwe wylogowanie, blokada użytkownika).

## Decyzja

Własna implementacja: `express-session` z magazynem `connect-pg-simple` w PostgreSQL, hasła w `bcrypt`, middleware `requireAuth`/`requireRole`, endpointy login/logout/me.

## Rozważane opcje

Brak zapisu o rozważanych alternatywach.

## Konsekwencje

**Pozytywne**

- Sesje w bazie, więc wylogowanie i blokada działają od razu.

**Negatywne / koszty**

- Własny kod bezpieczeństwa do utrzymania: regeneracja sesji, ochrona przed atakiem czasowym (porównanie z `DUMMY_HASH`), obsługa zablokowanych sesji. Wymagał kilku poprawek po review (`42183fc`, `b45caaa`, `6c03796`).
- Ten koszt był powodem zastąpienia rozwiązania (ADR-0006).

**Niewiadome**

- Brak.

## Dowody

- `d1441c4` – `tech-stack.md`: „express-session + connect-pg-simple”, „Sessions can be invalidated immediately”
- `c89fab9`, `5944b4d`, `b00e5f8` – middleware sesji, `requireAuth`/`requireRole`, endpointy
- `42183fc`, `b45caaa`, `6c03796` – poprawki: timing, regeneracja sesji, zablokowane sesje
- `243a996` – usunięcie `express-session`, `connect-pg-simple`, `bcrypt`
