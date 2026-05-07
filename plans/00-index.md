# Helpdesk — Implementation Plan Index

## Overview

AI-powered ticket management system. Inbound emails become tickets, Claude classifies and suggests replies, agents review and approve before sending.

## Plans (in order of implementation)

| # | Plan | Description |
|---|------|-------------|
| 01 | [Setup & Database](./01-setup-database.md) | Monorepo, TypeScript, Prisma schema, Docker, ENV validation |
| 02 | [Authentication](./02-authentication.md) | express-session, login/logout, auth middleware, user roles |
| 03 | [Inbound Email → Tickets](./03-inbound-email.md) | Postmark webhook, pg-boss queue, ticket creation, deduplication |
| 04 | [Ticket REST API](./04-ticket-api.md) | CRUD endpoints, filtering, sorting, history, status/priority |
| 05 | [Frontend Core](./05-frontend-core.md) | Vite + React Router, TanStack Query, auth flow, layout |
| 06 | [Frontend Tickets](./06-frontend-tickets.md) | Ticket list, filters, detail view, history timeline |
| 07 | [AI Pipeline](./07-ai-pipeline.md) | Classification, summary, suggested replies, ai_interactions log |
| 08 | [Email Replies](./08-email-replies.md) | Resend outbound, reply threading, agent approval flow |
| 09 | [User Management](./09-user-management.md) | Admin CRUD for users, roles, blocking |
| 10 | [Knowledge Base](./10-knowledge-base.md) | pgvector embeddings, RAG retrieval for reply context |

## Dependencies

```
01 → 02 → 03 → 04 → 07
                04 → 05 → 06
                     05 → 08
                02 → 09
                07 → 10 (optional, can come after 07)
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
