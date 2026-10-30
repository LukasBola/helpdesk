# Architecture Decision Records

Każdy plik opisuje jedną decyzję architektoniczną: kontekst, decyzję, konsekwencje i dowody (commity, pliki).

**ADR-0001–0014 są retrospektywne** (0015 i kolejne spisywane na bieżąco). Spisano je 2026-10-30, po wdrożeniu decyzji, wyłącznie na podstawie historii gita, `tech-stack.md`, `project-scope.md`, specyfikacji i planów. Tam, gdzie brak zapisu o alternatywach lub przyczynach, ADR mówi to wprost zamiast je dopisywać.

Nowy ADR: skopiuj [`0000-template.md`](0000-template.md), nadaj kolejny numer. Zmiana decyzji to nowy ADR; stary dostaje status „Zastąpiony przez”.

| ADR                                                 | Decyzja                                         | Status                |
| --------------------------------------------------- | ----------------------------------------------- | --------------------- |
| [0001](0001-monorepo-pnpm-client-server.md)         | Monorepo pnpm, `client` + `server`, TypeScript  | Zaakceptowany         |
| [0002](0002-postgresql-prisma-pgvector.md)          | PostgreSQL 16 + pgvector, Prisma                | Zaakceptowany         |
| [0003](0003-pg-boss-kolejka-zadan.md)               | Kolejka zadań pg-boss w Postgresie              | Zaakceptowany         |
| [0004](0004-postmark-inbound-idempotencja.md)       | Webhook Postmark, idempotencja po `Message-ID`  | Zaakceptowany         |
| [0005](0005-sesje-express-session.md)               | Sesje express-session + connect-pg-simple       | Zastąpiony przez 0006 |
| [0006](0006-better-auth.md)                         | Better Auth                                     | Zaakceptowany         |
| [0007](0007-jeden-origin-spa-api.md)                | SPA i API pod jednym originem                   | Zaakceptowany         |
| [0008](0008-ochrona-csrf-origin.md)                 | Ochrona CSRF przez sprawdzanie `Origin`         | Zaakceptowany         |
| [0009](0009-walidacja-env-zod.md)                   | Walidacja env przez Zod przy starcie            | Zaakceptowany         |
| [0010](0010-testy-integracyjne-testcontainers.md)   | Testy integracyjne z testcontainers             | Zaakceptowany         |
| [0011](0011-e2e-playwright.md)                      | E2E Playwright: Chromium, API przez proxy       | Zaakceptowany         |
| [0012](0012-jakosc-kodu-hooki-ci.md)                | Prettier, ESLint, typecheck w hookach i CI      | Zaakceptowany         |
| [0013](0013-node-22.md)                             | Node.js 22                                      | Zaakceptowany         |
| [0014](0014-frontend-spa-react-vite.md)             | SPA: React, Vite, TanStack Query, Tailwind      | Zaakceptowany         |
| [0015](0015-i18n-react-i18next-locale-na-koncie.md) | Interfejs PL/EN, react-i18next, język na koncie | Zaakceptowany         |

Decyzje tylko zaplanowane w `tech-stack.md` (Claude API, Resend, Railway, promptfoo, express-rate-limit) nie mają ADR-ów, bo nie zostały jeszcze wdrożone.
