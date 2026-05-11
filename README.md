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
| Auth     | express-session + connect-pg-simple (database sessions)              |
| AI       | Anthropic Claude API (direct SDK, structured output via Zod)         |
| Email    | Postmark (inbound), Resend (outbound)                                |
| Testing  | Vitest, React Testing Library, testcontainers, Playwright, promptfoo |
| DevOps   | Docker, GitHub Actions, Railway                                      |

## Project Structure

```
helpdesk/
├── client/          # React SPA (Vite)
├── server/          # Express REST API
│   └── prisma/      # Database schema and migrations
├── docs/            # Architecture docs and learning notes
├── .env.example     # Required environment variables
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 11+
- Docker (for local Postgres)

### First-time setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd helpdesk

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and SESSION_SECRET

# 4. Start the database
docker compose up -d

# 5. Run database migrations
pnpm --filter server exec prisma migrate dev
```

### Running locally

```bash
# Start both server and client (hot reload)
pnpm dev
```

| Service     | URL                   |
| ----------- | --------------------- |
| Frontend    | http://localhost:5173 |
| Backend API | http://localhost:3000 |

> If port 5173 is taken, Vite picks the next available one (5174, 5175…).

### Environment variables

| Variable                 | Required           | Description                                     |
| ------------------------ | ------------------ | ----------------------------------------------- |
| `DATABASE_URL`           | Yes                | PostgreSQL connection string                    |
| `SESSION_SECRET`         | Yes                | Min 32 characters, used to sign session cookies |
| `ANTHROPIC_API_KEY`      | For AI features    | Claude API key                                  |
| `POSTMARK_WEBHOOK_TOKEN` | For inbound email  | Postmark webhook validation token               |
| `RESEND_API_KEY`         | For outbound email | Resend API key for sending replies              |
| `PORT`                   | No                 | Backend port, defaults to `3000`                |

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
