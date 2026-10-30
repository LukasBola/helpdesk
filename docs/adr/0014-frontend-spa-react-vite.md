# ADR-0014: Frontend jako SPA: React, Vite, TanStack Query, Tailwind i shadcn/ui

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-04-23 (źródło: commit `d1441c4`); scaffold 2026-05-11 (`500c726`, `14e5cbd`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Interfejs dla agentów i administratorów za logowaniem: lista ticketów, szczegóły, zarządzanie użytkownikami. Treści nie muszą być indeksowane ani renderowane po stronie serwera.

## Decyzja

SPA na React 18 + Vite, routing React Router 6, dane serwerowe przez TanStack Query 5 i axios, styl Tailwind 3 z komponentami shadcn/ui (Radix). Bez SSR. W produkcji zbudowany frontend ma serwować nginx.

## Rozważane opcje

Brak zapisu o rozważanych alternatywach.

## Konsekwencje

**Pozytywne**

- Komponenty shadcn są kodem w repozytorium (`client/src/components/ui`), więc można je dowolnie zmieniać (np. przycisk zamknięcia w drawerze 44 px).

**Negatywne / koszty**

- Stan sesji pochodzi z asynchronicznego magazynu Better Auth; wymagało to poprawek kolejności nawigacji po logowaniu i wylogowaniu (`059b149`, `3edf8b5`).

**Niewiadome**

- Konfiguracja nginx nie istnieje.

## Dowody

- `d1441c4` – `tech-stack.md`, sekcje Frontend i DevOps
- `500c726`, `14e5cbd` – scaffold klienta, Tailwind + shadcn/ui
- `bbccb84`, `49a6ea1` – routing, app shell
- `059b149`, `3edf8b5` – poprawki wyścigu z magazynem sesji
