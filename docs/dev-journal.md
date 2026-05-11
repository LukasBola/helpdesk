# Dev Journal — Helpdesk Project

Historia komend i decyzji podczas pracy nad projektem.

---

## 2026-05-11

### Plan 01: Setup & Database (monorepo, TypeScript, Prisma, Docker, ENV)

```text
/using-git-worktrees feature/setup-database

Kiedy worktree będzie gotowy:

/subagent-driven-development plans/01-setup-database.md
```

**Dlaczego `/subagent-driven-development`?**
11 taskow, kazdy ciezki (Prisma schema, testcontainers, shadcn/ui). Jeden wspolny kontekst "meczy sie" po 6-7 taskach i zaczyna robic bledy lub pomijac szczegoly. Kazdy subagent startuje swiezym kontekstem i dostaje tylko swoj task — jakos wykonania jest wyzsza niz przy `/executing-plans`.

**Prerequisite — Docker musi działac przed odpaleniem planu:**

```bash
docker info
```

Task 4 odpala `docker compose up -d postgres` — bez tego plan zatrzyma sie w polowie.

**Co robi ten plan** (11 taskow, szkielet aplikacji przed logika biznesowa):

- **Monorepo root** — pnpm workspaces z pakietami `client` i `server`
- **Server package** — TypeScript + Express + Prisma, tsconfig, skrypty dev/build/test
- **Client package** — Vite + React + TanStack Query + Tailwind, scaffold przez `create vite`
- **Docker Compose** — PostgreSQL 16 z pgvector, wolumen na dane
- **ENV validation** — Zod waliduje zmienne przy starcie, serwer nie startuje bez wymaganych kluczy (TDD)
- **Prisma schema** — wszystkie modele domeny naraz: User, Ticket, TicketHistory, Reply, AIInteraction, Session, migracja `init`
- **Prisma client singleton** — jeden klient na caly proces, bezpieczny przy hot-reload
- **Express bootstrap** — app factory + `/health` endpoint (TDD)
- **testcontainers** — osobny kontener Postgres na testy integracyjne, uruchamiany przez Vitest globalSetup
- **Tailwind + shadcn/ui** — komponenty: button, input, label, card, badge, table, select
- **Pino logging** — JSON w produkcji, pretty w dev

**Prisma schema upfront** — kolejne plany (auth, tickets, AI, email) tylko dodaja endpointy, nie modyfikuja schematu. Stabilny kontrakt od poczatku.

**testcontainers zamiast mockow** — nauczka z code review planu 00: mockowany DB maskuje bledy migracji. Prawdziwy Postgres w kontenerze weryfikuje rzeczywiste zachowanie.

---

```text
/requesting-code-review
Sprawdz zmiany wprowadzone podczas implementacji plans/01-setup-database.md

Kiedy review bedzie gotowe i poprawki wdrozone:

/verification-before-completion

Kiedy weryfikacja przejdzie:

/finishing-a-development-branch
```

---

## 2026-05-08

### Plan 00: Code Quality (Prettier, ESLint, Husky, CI)

```text
/using-git-worktrees feature/code-quality

Kiedy worktree będzie gotowy:

/executing-plans plans/00-code-quality.md
```

**Dlaczego `/using-git-worktrees`?**
Tworzy odizolowaną kopię repo w osobnym katalogu. Wszystkie zmiany lądują tam — `main` zostaje nienaruszony. Jeśli coś pójdzie nie tak w połowie planu, możesz po prostu usunąć worktree bez konsekwencji.

**Czy trzeba najpierw utworzyć branch?**
Nie. `/using-git-worktrees feature/code-quality` tworzy branch i worktree jednocześnie — nie trzeba robić `git checkout -b` wcześniej. Pod spodem wykonuje:

```bash
git worktree add -b feature/code-quality ../helpdesk-code-quality
```

**Dlaczego `/executing-plans` a nie `/subagent-driven-development`?**
Plan 00 ma tylko 4 taski i są sekwencyjne (Prettier → ESLint → Husky → CI). Żaden task nie zależy od równoległości ani nie jest na tyle długi żeby "zmęczyć" kontekst. `/subagent-driven-development` ma sens od planu 02+ gdzie taski są bardziej złożone.

**Co robi ten plan?**
Konfiguruje całe środowisko jakości kodu zanim napisze się choćby linijkę logiki:

- **Prettier** — formatowanie kodu (średniki, cudzysłowy, długość linii)
- **ESLint strict** — statyczna analiza TypeScript, wykrywanie błędów przed uruchomieniem
- **Husky + lint-staged** — pre-commit hook blokuje commit jeśli jest błąd formatowania lub lint
- **CI pipeline** — GitHub Actions uruchamia lint + typecheck + testy przy każdym push

**Plusy tej kolejności (code quality jako Plan 00):**
Każdy kolejny commit od teraz będzie automatycznie sprawdzany. Nie ma długu technicznego w formatowaniu od pierwszego dnia.

**Minusy / na co uważać:**
Po `npx prettier --write .` (Step 4 w Task 1) wszystkie pliki zostaną sformatowane — git pokaże dużo zmian naraz. To normalne i oczekiwane.

---

Po skończeniu implementacji:

```text
/requesting-code-review
Sprawdź zmiany wprowadzone podczas implementacji plans/00-code-quality.md

Kiedy review będzie gotowe i poprawki wdrożone:

/verification-before-completion

Kiedy weryfikacja przejdzie:

/finishing-a-development-branch
```

**Dlaczego `/requesting-code-review` przed mergem?**
Claude sprawdza czy konfiguracja jest kompletna i poprawna — czy czegoś nie brakuje w ESLint config, czy Husky hook faktycznie blokuje złe commity, czy CI pipeline ma wszystkie wymagane kroki. Lepiej wyłapać to teraz niż po mergu do `main`.

**Co robi `/verification-before-completion`?**
Uruchamia testy, lint i prettier --check, pokazuje rzeczywisty output z exit code. Żadnych twierdzeń "powinno działać" — tylko twarde dowody że działa. Skill wymusza to przed każdym commitem/PR.

**Co robi `/finishing-a-development-branch`?**
Pyta co zrobić z gotowym worktree — możesz wybrać merge do `main`, stworzenie PR na GitHubie, lub cleanup (usunięcie brancha jeśli coś poszło nie tak).
