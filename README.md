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
pnpm e2e                     # everything, headless
pnpm e2e --project=api       # API tests only
pnpm e2e:headed              # watch the browser (slowed down by E2E_SLOWMO=400 ms)
pnpm e2e:ui                  # Playwright UI mode
pnpm e2e:report              # open the last HTML report
```

Structure: `e2e/pages/` holds the page objects (`LoginPage`, `AppShell`), `e2e/fixtures/` the users, tickets, API helpers and DB helpers (block/unblock a user). `e2e/tests/auth.setup.ts` logs in once per role and saves the session in `e2e/.auth/`. Reporters: list (console), HTML (`e2e/playwright-report/`), JUnit (`e2e/test-results/junit.xml`).

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
