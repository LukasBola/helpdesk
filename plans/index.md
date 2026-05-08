# Helpdesk — Implementation Plan Index

## Overview

AI-powered ticket management system. Inbound emails become tickets, Claude classifies and suggests replies, agents review and approve before sending.

## Plans (in order of implementation)

| #      | Plan                                             | Description                                                              |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------ |
| 00     | [Code Quality](./00-code-quality.md)             | Prettier, ESLint strict, Husky, lint-staged, CI pipeline                 |
| 01     | [Setup & Database](./01-setup-database.md)       | Monorepo, TypeScript, Prisma schema, Docker, ENV validation              |
| 02     | [Authentication](./02-authentication.md)         | express-session, login/logout, auth middleware, user roles               |
| 03     | [Inbound Email → Tickets](./03-inbound-email.md) | Postmark webhook, pg-boss queue, ticket creation, deduplication          |
| 04     | [Ticket REST API](./04-ticket-api.md)            | CRUD endpoints, filtering, sorting, history, status/priority             |
| 05     | [Frontend Core](./05-frontend-core.md)           | Vite + React Router, TanStack Query, auth flow, layout                   |
| 06     | [Frontend Tickets](./06-frontend-tickets.md)     | Ticket list, filters, detail view, history timeline                      |
| 07     | [AI Pipeline](./07-ai-pipeline.md)               | Classification, summary, suggested replies, ai_interactions log          |
| 08     | [Email Replies](./08-email-replies.md)           | Resend outbound, reply threading, agent approval flow                    |
| 09     | [User Management](./09-user-management.md)       | Admin CRUD for users, roles, blocking                                    |
| ~~10~~ | ~~Knowledge Base~~                               | ~~pgvector embeddings, RAG~~ — **pominięte** (wymagałoby OpenAI API key) |
| 11     | [E2E Tests](./11-e2e-playwright.md)              | Playwright — login, reply flow, role restrictions (15–25 tests)          |
| 12     | [AI Eval Suite](./12-promptfoo-evals.md)         | promptfoo nightly evals — classification, summary, reply quality checks  |

## Dependencies

```
00 → 01 → 02 → 03 → 04 → 07
                04 → 05 → 06
                     05 → 08
                02 → 09
01–09 → 11 (E2E wymaga działającej aplikacji)
```

Each plan produces working, testable software on its own before the next begins.

## Tech Stack Quick Reference

- **Server:** Express + TypeScript + Prisma + PostgreSQL
- **Client:** React + Vite + TanStack Query + Tailwind + shadcn/ui
- **Auth:** express-session + connect-pg-simple
- **Queue:** pg-boss (stored in Postgres)
- **AI:** Anthropic Claude API (direct SDK, no LangChain)
- **Email in:** Postmark webhook
- **Email out:** Resend
- **Tests:** Vitest + testcontainers + Playwright + promptfoo
