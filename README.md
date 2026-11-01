# Helpdesk — AI-Powered Ticket Management

A full-stack support ticket management system that uses AI to automatically classify, summarize, and suggest replies for incoming support emails — helping agents respond faster and more consistently.

## Features

- **Email-to-ticket** — inbound emails are parsed and turned into tickets automatically
- **AI classification** — tickets are categorized and prioritized by Claude
- **AI suggested replies** — agents review AI-drafted replies before sending, never auto-send
- **Knowledge base** — RAG-powered reply generation using pgvector embeddings
- **Ticket lifecycle** — Open → In Progress → Resolved → Closed with full change history
- **Role-based access** — Agent and Admin roles with separate permissions
- **User management** — admin panel for creating, blocking, and managing agents
- **Email threading** — customer replies are matched back to the original ticket

## Tech Stack

| Layer    | Technology                                                           |
| -------- | -------------------------------------------------------------------- |
| Frontend | React, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query     |
| Backend  | Express.js, TypeScript, Prisma, PostgreSQL, pgvector, pg-boss        |
| Auth     | Better Auth (email + password, sessions in Postgres via Prisma)      |
| AI       | Anthropic Claude API (direct SDK, structured output via Zod)         |
| Email    | Postmark (inbound), Resend (outbound)                                |
| Testing  | Vitest, React Testing Library, testcontainers, Playwright, promptfoo |
| DevOps   | Docker, GitHub Actions, Railway                                      |

## Project Structure

```text
helpdesk/
├── client/          # React SPA (Vite)
├── server/          # Express REST API
│   └── prisma/      # Database schema and migrations
├── docs/            # Architecture docs and learning notes
├── .env.example     # Required environment variables
└── docker-compose.yml
```

## Getting Started

Run every command below from the repository root (the `helpdesk/` folder) unless stated otherwise.

### Prerequisites

You need three tools installed. Check each one:

- **Node.js 22+**: runs the server, the client build and the tooling.

  ```bash
  node --version
  ```

- **pnpm 11+**: the package manager for this monorepo (`client/`, `server/`, `e2e/`). If it is missing, enable it through Corepack, which ships with Node.js:

  ```bash
  pnpm --version
  ```

  ```bash
  corepack enable pnpm
  ```

- **Docker** (Docker Desktop on macOS/Windows): runs the local PostgreSQL database. Make sure Docker is started:

  ```bash
  docker --version
  ```

### First-time setup

#### 1. Clone the repository

```bash
git clone https://github.com/LukasBola/helpdesk.git
```

```bash
cd helpdesk
```

#### 2. Install dependencies

Installs the packages of all workspaces and generates the Prisma client (the `postinstall` script in `server/`).

```bash
pnpm install
```

#### 3. Create the `.env` file

The app reads its configuration from a `.env` file in the repository root. Start from the template:

```bash
cp .env.example .env
```

Open `.env` in your editor and set the three required variables:

- `DATABASE_URL`: where the database lives. For the Docker database from step 4 use exactly:

  ```text
  postgresql://helpdesk:helpdesk@localhost:5432/helpdesk
  ```

- `BETTER_AUTH_SECRET`: a random secret (at least 32 characters) that signs session cookies. Generate your own and paste the output:

  ```bash
  openssl rand -base64 32
  ```

- `BETTER_AUTH_URL`: the backend address. Locally:

  ```text
  http://localhost:3000
  ```

The remaining variables (`ANTHROPIC_API_KEY`, `POSTMARK_WEBHOOK_TOKEN`, `RESEND_API_KEY`) are only needed for AI and email features. The app starts without them. See [Environment variables](#environment-variables).

> `.env` is in `.gitignore` and must never be committed. Never put real secrets or API keys in this README, `.env.example` or any other tracked file.

#### 4. Start the database

Starts PostgreSQL 16 with the pgvector extension in Docker, on port `5432`. `-d` runs it in the background. Data is kept in a Docker volume, so it survives restarts.

```bash
docker compose up -d
```

Check that the `postgres` container is `running`:

```bash
docker compose ps
```

#### 5. Create the database tables

Applies all migrations from `server/prisma/migrations` to the empty database. (`prisma migrate dev` is only for creating new migrations after a schema change, see [Database](#database).)

```bash
pnpm --filter server exec prisma migrate deploy
```

#### 6. Create the admin account

The seed script creates the first user, an admin you can log in with. It is safe to run more than once.

```bash
pnpm --filter server exec prisma db seed
```

Default local credentials:

| Email                  | Password      |
| ---------------------- | ------------- |
| `admin@helpdesk.local` | `changeme123` |

> These defaults are for local development only and are already public in `server/prisma/seed.ts`. To use your own, set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` before running the seed. Any shared or production environment must always set its own `SEED_ADMIN_PASSWORD`.

#### 7. Start the app

Starts the backend and the frontend together, with hot reload. Keep this terminal open; stop with `Ctrl+C`.

```bash
pnpm dev
```

| Service     | URL                     |
| ----------- | ----------------------- |
| Frontend    | <http://localhost:5173> |
| Backend API | <http://localhost:3000> |

> If port 5173 is taken, Vite picks the next available one (5174, 5175…). Check the terminal output for the actual URL.

#### 8. Log in

Open <http://localhost:5173> and sign in with the admin account from step 6.

### Running locally (every next time)

After the first-time setup you only need two commands: start the database (if Docker was restarted)...

```bash
docker compose up -d
```

...and start the app:

```bash
pnpm dev
```

After pulling changes that touch `package.json` or `server/prisma/migrations`, run `pnpm install` and step 5 again.

To stop the database (data is kept):

```bash
docker compose down
```

### Troubleshooting

- **`Can't reach database server at localhost:5432`**: the database is not running. Start Docker, then run `docker compose up -d`.
- **`port is already allocated` when starting the database**: another PostgreSQL already uses port `5432`. Stop it, or change the left port in `docker-compose.yml` (e.g. `'5433:5432'`) and in `DATABASE_URL`.
- **Login fails with the default credentials**: the seed has not run. Run step 6.
- **`Environment variable not found`**: `.env` is missing or not in the repository root. Repeat step 3.

### Environment variables

| Variable                 | Required           | Description                                                                                    |
| ------------------------ | ------------------ | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | Yes                | PostgreSQL connection string                                                                   |
| `BETTER_AUTH_SECRET`     | Yes                | Min 32 characters, used to sign session cookies                                                |
| `BETTER_AUTH_URL`        | Yes                | Backend base URL, e.g. `http://localhost:3000`                                                 |
| `CLIENT_URL`             | Production only    | Frontend origin trusted by Better Auth; defaults to `http://localhost:5173` outside production |
| `ANTHROPIC_API_KEY`      | For AI features    | Claude API key                                                                                 |
| `POSTMARK_WEBHOOK_TOKEN` | For inbound email  | Postmark webhook validation token                                                              |
| `RESEND_API_KEY`         | For outbound email | Resend API key for sending replies                                                             |
| `PORT`                   | No                 | Backend port, defaults to `3000`                                                               |

## Testing

```bash
# Run all tests
pnpm test

# Server tests only (Vitest + testcontainers)
pnpm --filter server test

# Client tests only (Vitest + React Testing Library)
pnpm --filter client test

# Watch mode
pnpm --filter server test:watch
```

Server integration tests spin up a real PostgreSQL instance via testcontainers — Docker must be running.

### End-to-end (Playwright)

The suite in `e2e/` runs against the real app (`pnpm dev`, started automatically if not running) and the local database (`docker compose up -d`). Global setup recreates the e2e users (`e2e-*@helpdesk.local`, password `e2e-password-123`, override with `E2E_PASSWORD`) and fixture tickets via `pnpm --filter server e2e:fixtures seed`.

Two projects:

- `chromium`: UI tests in `e2e/tests/` (Chrome only; Firefox/WebKit are installed but not used).
- `api`: frontend↔backend contract tests in `e2e/api/`. HTTP calls go to `http://localhost:5173/api/*`, through the Vite proxy, with the browser's `Origin` header.

```bash
pnpm e2e:install             # one-time: download Chromium, Firefox and WebKit
pnpm e2e                     # everything; browser visible with the example .env
E2E_HEADLESS=true pnpm e2e   # run without a visible browser
pnpm e2e --project=api       # API tests only
pnpm e2e:headed              # watch the browser (slowed down by E2E_SLOWMO=400 ms)
pnpm e2e:ui                  # Playwright UI mode
pnpm e2e:report              # open the last HTML report
```

`E2E_HEADLESS` accepts `true` or `false`; the example `.env` sets it to `false`, while the default is `true` if the variable is unset. Set `E2E_SLOWMO` to the delay in milliseconds between browser actions when watching tests.

Structure: `e2e/pages/` holds the page objects (`LoginPage`, `AppShell`), `e2e/fixtures/` the users, tickets, API helpers and DB helpers (block/unblock a user). `e2e/tests/auth.setup.ts` logs in once per role and saves the session in `e2e/.auth/`. Reporters: step log (console, `e2e/reporters/step-log.ts`), HTML (`e2e/playwright-report/`), JUnit (`e2e/test-results/junit.xml`).

#### Test log

Tests are plain Playwright code: no logging calls inside tests, page objects or helpers. The step-log reporter (`e2e/reporters/step-log.ts`) listens to Playwright's own step events and writes one line per event for every test, hook, `test.step`, Playwright action and assertion. It sees only what Playwright reports: steps inside fixtures are hidden, and plain Node code (e.g. `db.*` helpers running `execSync`) produces no lines.

Each line has fixed-width columns: timestamp (ISO 8601, UTC), level (`INFO`, `WARN`, `ERROR`), id, symbol, phase, outcome and duration. Then comes the tree part: kind (`TEST`, `HOOK`, `STEP`, `ACTION`, `ASSERT`, `GLOBAL`), indented by nesting, text and `@ file:line`. `START` and `END` of the same step have the same id and exactly the same tree part:

```text
2026-11-01T10:15:02.294Z INFO  T001.S003 ▸ START                          STEP   AppShell.expectSignedInAs @ e2e/tests/session.spec.ts:7
2026-11-01T10:15:02.297Z INFO  T001.S004 ▸ START                            ASSERT Powitanie „Dzień dobry,” jest widoczne [getByText('Dzień dobry,')] @ e2e/pages/AppShell.ts:31
2026-11-01T10:15:07.307Z ERROR T001.S004 ✗ END   FAIL          5010 ms      ASSERT Powitanie „Dzień dobry,” jest widoczne [getByText('Dzień dobry,')] @ e2e/pages/AppShell.ts:31
2026-11-01T10:15:07.307Z ERROR T001.S004 ↳ ERROR                            ASSERT Error: Powitanie „Dzień dobry,” jest widoczne | Expected: visible | Error: element(s) not found
2026-11-01T10:15:07.308Z ERROR T001.S003 ✗ END   FAIL          5014 ms    STEP   AppShell.expectSignedInAs @ e2e/tests/session.spec.ts:7
```

- **Symbols:** `▸` start, `✓` pass, `✗` fail/timeout/incomplete, `⊘` skipped, `↳` error detail. They are plain Unicode text characters (not emoji), one column wide in a terminal and in CI logs.
- **Colors:** ANSI colors only in a terminal or CI (GitHub Actions shows them). Piped or redirected output has none; `NO_COLOR=1` turns them off, `FORCE_COLOR=1` on. The `step-log.log` attachment is always plain text.
- **Id:** `T001` is one test attempt (each retry gets a new one), `T001.S004` is a step in it. Lines of parallel tests interleave; filter one attempt with `grep -F T001` or one step with `grep -F T001.S004`. A line break in a step title or assertion message is shown as `⏎`, so one event is always one line.
- **Outcome:** `PASS`, `FAIL`, `TIMEOUT`, `INTERRUPTED`, `SKIPPED`, or `INCOMPLETE` for a step that never ended (timeout, killed worker); an unfinished step is never shown as `PASS`.
- **Summary:** the last line counts `passed`, `failed`, `flaky`, `skipped`, `expected to fail` (`test.fail()`) and `not run` (e.g. after `--max-failures`) tests.
- **Failures:** at the end of the run every failed test is listed with the first step that failed, innermost in its branch (id, kind, text, location), its step path, the trace command and the full Playwright error (expected/received, call log).
- **HTML report:** every attempt has its own log as the `step-log.log` attachment, next to its trace. The trace itself shows the same steps in its Actions panel.

To make the log readable:

- Every assertion has a description as the second argument of `expect` (in Polish, like the test titles): `await expect(menu, 'Menu avatara zawiera rolę „administrator”').toContainText('administrator')`. It names the assertion in the step log, the HTML report and the failure message. ESLint (`no-restricted-syntax` in `eslint.config.js`) rejects `expect(...)`, `expect.soft(...)` and `expect.poll(...)` without it in `e2e/{tests,api,pages,fixtures}`, so the pre-commit hook blocks an undescribed assertion.
- Group several actions with `await test.step('Assign the ticket', async () => { ... })`.
- Page object methods marked `@step` (see `e2e/pages/step.ts`) appear as one step, e.g. `LoginPage.login`, with the line of the test that called them.

`E2E_LOG=tests pnpm e2e` prints only test `START`/`END` lines (the attachment is always complete). The reporter masks known secrets in the terminal and in `step-log.log` (`e2e/reporters/mask.ts`): e2e passwords (including `E2E_PASSWORD` from `.env`), full names of e2e users, `POSTMARK_WEBHOOK_TOKEN`, e-mail addresses, `Bearer`/`Basic` credentials and token/cookie/password values. Values typed by actions stay visible for debugging (`Fill "to-nie-jest-email"`, `Fill ""`); only the known secrets above are replaced (`Fill "[REDACTED]"`). Test output (`console.log`) is masked line by line, so a secret split across two writes is still caught. It is a safety net, not a guarantee (a value typed by a test that is not on the list, a first name alone or a free-text secret is printed as is), so e2e tests must use fictional data only. Playwright's own HTML step tree and traces (which also capture stdout) are not masked. Reporter checks: `pnpm e2e:reporter:test` (no app or database needed; also runs in CI as the `e2e-reporter` job). Design: [ADR-0016](docs/adr/0016-logowanie-e2e-reporter-playwright.md).

Traces are kept for every failed test locally (`retain-on-failure`) and recorded on the first retry in CI (`on-first-retry`, as recommended by Playwright). Open them from the HTML report with `pnpm e2e:report`, or run `pnpm exec playwright show-trace <path-to-trace.zip>`. Traces may contain sensitive test data and are overwritten by subsequent runs.

## Code Quality

```bash
# Lint
pnpm lint

# Auto-fix lint issues
pnpm lint:fix

# Type check
pnpm typecheck
```

Pre-commit hooks (Husky + lint-staged) run Prettier and ESLint automatically on staged files. The CI pipeline runs lint, typecheck, and tests on every pull request.

## Database

```bash
# Create a new migration after schema changes
pnpm --filter server exec prisma migrate dev --name <migration-name>

# Open Prisma Studio (database GUI)
pnpm --filter server exec prisma studio

# Reset database (drops all data)
pnpm --filter server exec prisma migrate reset
```

## Architecture

The system is designed to handle high email volume without blocking the HTTP layer:

- **Async processing** — inbound webhook returns `200` immediately; AI classification and reply generation happen via a pg-boss job queue stored in Postgres
- **Idempotency** — unique constraint on email `Message-ID` prevents duplicate tickets from webhook retries
- **Structured AI output** — Claude responses are parsed and validated with Zod before being saved; invalid responses are logged and discarded
- **AI observability** — every Claude call is logged to `ai_interactions` (prompt, tokens, cost, latency) for cost tracking and prompt debugging
- **No mock databases in tests** — integration tests use testcontainers to spin up a real Postgres instance, eliminating mock/production divergence

For a deeper walkthrough, see [`docs/learning/01-architecture-explained.md`](docs/learning/01-architecture-explained.md).
