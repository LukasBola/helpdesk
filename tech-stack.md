# Tech Stack

## Structure

Monorepo with two separate apps:

- `/client` — React frontend
- `/server` — Express backend

## Language

- **TypeScript** — used across both client and server

## Frontend

- **React + Vite** — SPA
- **React Router** — client-side routing
- **TanStack Query** — data fetching and caching
- **Tailwind CSS** + **shadcn/ui** — styling and components

## Backend

- **Express.js** — REST API
- **Prisma** — ORM
- **PostgreSQL** — database
- **pgvector** — Postgres extension for knowledge base embeddings (no extra infra)
- **pg-boss** — job queue for async AI processing (stored in Postgres)
- **Zod** — validation for API input and Claude output
- **express-rate-limit** — rate limiting on AI endpoints
- **Pino** — structured logging

## Code Quality

- **Prettier** — opinionated code formatter, single config at repo root, runs on save and pre-commit
- **ESLint** — static analysis for TypeScript, React hooks rules, import order; shared flat config across client and server
- **Husky** — git hooks manager; installs hooks automatically after `pnpm install`
- **lint-staged** — runs Prettier + ESLint only on staged files (fast pre-commit, not full repo scan)
- **tsc --noEmit** — TypeScript compilation check run in CI; catches type errors that ESLint misses

## Authentication

- **express-session** + **connect-pg-simple** — database sessions stored in PostgreSQL
- Sessions can be invalidated immediately (real logout, user blocking)

## Email

- **Postmark** — inbound email parsing (better quoted reply and threading support)
- **Resend** — sending replies to customers

## AI

- **Anthropic Claude API** — ticket classification, priorities, summaries, suggested replies
- Direct SDK calls (no LangChain)
- AI suggests replies, agent always approves before sending
- Structured output via tool use — Zod validates Claude response before saving

## Testing

### Tools

- **Vitest** — unit and integration tests for backend logic and utilities
- **React Testing Library** — component tests (forms, lists, filtering, UI state)
- **testcontainers** — spins up a real Postgres instance for integration tests; no mocking the database
- **Playwright** — E2E tests for critical paths only (max 15-25 tests: login, review → approve → send, role restrictions)
- **promptfoo** — eval suite for Claude prompts (runs nightly, not on every PR)

### Testing layers

**Unit / integration (Vitest + testcontainers)**
Standard tests for Express route handlers, Prisma queries, Zod schemas, and React components. Integration tests hit a real Postgres instance spun up by testcontainers — no mocks, no divergence from production behavior.

**E2E (Playwright)**
Limited to critical user flows only: agent logs in, opens a ticket, reviews AI-suggested reply, approves and sends. Also covers role restrictions (agent cannot access admin pages). Kept small on purpose — E2E tests are slow and expensive to maintain.

**AI eval suite (promptfoo — nightly)**
LLMs are non-deterministic, so standard unit tests are not enough. The eval suite runs ~50-200 hand-verified ticket samples through Claude and checks output _properties_, not exact text — e.g. "classification is one of the valid enum values", "summary does not hallucinate a price", "reply tone is polite". Detects prompt regressions when the model is updated or prompts are changed. Runs nightly to keep CI fast.

**AI cached replay (fixtures)**
Real Claude responses are recorded to `__fixtures__/claude/*.json`. Unit and integration tests replay these fixtures instead of calling the real API — zero cost, deterministic, fast. Fixtures are updated manually when prompts change intentionally.

**Guardrail tests**
Adversarial inputs run through the full AI pipeline before going to production: prompt injection hidden in email body, PII leakage across tickets, jailbreak attempts. Must pass before any production deployment.

**pg-boss queue tests**
Job queue behavior is tested explicitly: retry after failure, idempotency (same email arriving twice creates only one ticket), stuck job recovery, concurrency (two workers pick different jobs, not the same one).

**Inbound email fixtures**
~20 real Postmark webhook payloads covering edge cases: plain text, HTML, quoted reply, forwarded email, auto-responder, non-UTF8 encoding. Includes anti-loop detection — AI must not respond to its own outbound emails.

### Test pyramid proportions

```
        E2E (Playwright)              15-25
      Eval suite (nightly)           50-200
    Integration (testcontainers)    100-300
  Unit (Vitest) + component (RTL)  500-1500+
```

## DevOps

- **Docker** — Dockerfile per app, nginx serves built Vite frontend
- **docker-compose** — local dev environment (client + server + postgres)
- **GitHub Actions** — CI/CD pipeline (lint → build → deploy)
- **Railway** — production deployment (managed Postgres, auto SSL, push-to-deploy)

## Architecture Notes

- **Job queue is required** — at 2000 emails/day, inbound webhook must return 200 immediately, AI processing happens async via pg-boss workers
- **Idempotency** — unique constraint on email `Message-ID` header prevents duplicate tickets from webhook retries
- **Email threading** — replies from customers are matched to existing tickets via `In-Reply-To` header or plus-addressing (`support+ticket-{id}@domain.com`)
- **Knowledge base** — storage format TBD; pgvector ready for embeddings-based RAG when decided
- **AI observability** — `ai_interactions` table logs every Claude call (prompt, tokens, cost, latency, ticket_id) for cost tracking and prompt improvement
- **Prisma migrations** — run automatically in CI/CD before deployment
- **ENV validation** — Zod schema validates `process.env` on startup; app refuses to start if required vars are missing
