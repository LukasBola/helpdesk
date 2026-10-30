# ADR-0001: Monorepo pnpm z osobnymi aplikacjami `client` i `server` w TypeScript

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-04-23 (źródło: commit `d1441c4`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Projekt to system ticketów z frontendem (SPA) i backendem (REST API). Od początku zakładano jeden język dla obu części oraz wspólne reguły jakości kodu dla całego repozytorium.

## Decyzja

Jedno repozytorium, workspace pnpm z dwoma pakietami: `client` (React) i `server` (Express). TypeScript w obu. Wspólna konfiguracja Prettier i ESLint w katalogu głównym. Testy e2e w katalogu `e2e/` poza workspace'ami, uruchamiane z roota.

## Rozważane opcje

Brak zapisu o rozważanych alternatywach.

## Konsekwencje

**Pozytywne**

- Jeden `pnpm install`, jeden lockfile, jedna konfiguracja lint/format/CI dla całego kodu.
- Zmiana obejmująca client i server mieści się w jednym PR.

**Negatywne / koszty**

- Brak współdzielonego pakietu typów: pola użytkownika Better Auth są po stronie klienta zdefiniowane ręcznie i synchronizowane z serwerem komentarzem (patrz ADR-0006).

**Niewiadome**

- Brak.

## Dowody

- `d1441c4` – `tech-stack.md`: „Monorepo with two separate apps”, „TypeScript — used across both client and server”
- `cbde940`, `500c726` – utworzenie pakietów `server` i `client`
- `pnpm-workspace.yaml` – pakiety `client`, `server`
- `project-scope.md` – „All rules shared across client and server from a single root config”
- `docs/superpowers/specs/2026-10-29-frontend-core-design.md` – jawna forma `inferAdditionalFields` zamiast importu typów z serwera
