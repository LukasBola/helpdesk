# Plan 01: Setup & Database

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the monorepo with TypeScript, Prisma schema covering all domain models, Docker Compose for local dev, and Zod ENV validation on startup.

**Architecture:** pnpm workspaces monorepo with `/client` and `/server` packages. Prisma schema defines all domain models upfront so every subsequent plan has a stable database contract. ENV validated at startup — server refuses to start with missing vars.

**Tech Stack:** pnpm workspaces, TypeScript 5, Prisma 5, PostgreSQL 16, Docker Compose, Zod

---

## File Map

```
helpdesk/
├── package.json                    # workspace root (pnpm)
├── pnpm-workspace.yaml
├── .env.example
├── docker-compose.yml
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma           # all domain models
│   └── src/
│       ├── index.ts                # listen()
│       ├── app.ts                  # express app factory
│       ├── env.ts                  # zod env validation
│       └── db.ts                   # prisma client singleton
└── client/
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts
```

---

### Task 1: Monorepo root

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Create workspace root `package.json`**

```json
{
  "name": "helpdesk",
  "private": true,
  "scripts": {
    "dev": "concurrently \"pnpm --filter server dev\" \"pnpm --filter client dev\"",
    "build": "pnpm --filter server build && pnpm --filter client build"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'client'
  - 'server'
```

- [ ] **Step 3: Install root deps**

Run: `pnpm install`

---

### Task 2: Server package

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "server",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "express": "^4.21.2",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "prisma": "^5.22.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "@vitest/coverage-v8": "^2.1.8",
    "testcontainers": "^10.14.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Install server deps**

Run: `cd server && pnpm install`

---

### Task 3: Client package

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`

- [ ] **Step 1: Scaffold client with Vite**

Run: `pnpm create vite@latest client -- --template react-ts`

(If directory already exists, do it manually — create the files below.)

- [ ] **Step 2: Add dependencies to `client/package.json`**

```json
{
  "name": "client",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "@tanstack/react-query": "^5.62.7",
    "axios": "^1.7.9"
  },
  "devDependencies": {
    "@types/react": "^18.3.14",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vitest": "^2.1.8",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^25.0.1",
    "tailwindcss": "^3.4.16",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49"
  }
}
```

- [ ] **Step 3: Create `client/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 4: Install client deps**

Run: `cd client && pnpm install`

---

### Task 4: Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: helpdesk
      POSTGRES_PASSWORD: helpdesk
      POSTGRES_DB: helpdesk
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

- [ ] **Step 2: Create `.env.example`**

```bash
DATABASE_URL="postgresql://helpdesk:helpdesk@localhost:5432/helpdesk"
SESSION_SECRET="change-me-in-production-min-32-chars"
ANTHROPIC_API_KEY=""
POSTMARK_WEBHOOK_TOKEN=""
RESEND_API_KEY=""
PORT=3000
NODE_ENV=development
```

- [ ] **Step 3: Copy to `.env` and fill values**

Run: `cp .env.example .env`

- [ ] **Step 4: Start Postgres**

Run: `docker compose up -d postgres`
Expected: container starts, `docker compose ps` shows `postgres` as healthy.

---

### Task 5: ENV validation

**Files:**
- Create: `server/src/env.ts`

- [ ] **Step 1: Write failing test**

Create `server/src/env.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('env', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('throws when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '')
    await expect(import('./env')).rejects.toThrow()
  })

  it('parses valid env without throwing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5432/db')
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(32))
    vi.stubEnv('PORT', '3000')
    const { env } = await import('./env')
    expect(env.PORT).toBe(3000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/env.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/src/env.ts`**

```typescript
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ANTHROPIC_API_KEY: z.string().optional(),
  POSTMARK_WEBHOOK_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
})

const result = schema.safeParse(process.env)

if (!result.success) {
  console.error('Invalid environment variables:')
  console.error(result.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = result.data
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && pnpm test src/env.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/env.ts server/src/env.test.ts
git commit -m "feat: zod env validation — server refuses to start with missing vars"
```

---

### Task 6: Prisma schema

**Files:**
- Create: `server/prisma/schema.prisma`

- [ ] **Step 1: Initialise Prisma**

Run: `cd server && pnpm prisma init --datasource-provider postgresql`

- [ ] **Step 2: Replace generated schema with full domain model**

Replace `server/prisma/schema.prisma`:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

enum Role {
  AGENT
  ADMIN
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}

enum TicketPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum AIInteractionType {
  CLASSIFICATION
  SUMMARY
  SUGGESTED_REPLY
  EMBEDDING
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  name         String
  passwordHash String
  role         Role      @default(AGENT)
  isBlocked    Boolean   @default(false)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  assignedTickets Ticket[]        @relation("AssignedTickets")
  history         TicketHistory[]
  replies         Reply[]

  @@map("users")
}

model Ticket {
  id            String         @id @default(cuid())
  subject       String
  body          String
  summary       String?
  category      String?
  status        TicketStatus   @default(OPEN)
  priority      TicketPriority @default(MEDIUM)
  customerEmail String
  customerName  String?
  messageId     String         @unique
  assigneeId    String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  assignee       User?           @relation("AssignedTickets", fields: [assigneeId], references: [id])
  history        TicketHistory[]
  replies        Reply[]
  aiInteractions AIInteraction[]

  @@map("tickets")
}

model TicketHistory {
  id        String   @id @default(cuid())
  ticketId  String
  userId    String?
  field     String
  oldValue  String?
  newValue  String?
  createdAt DateTime @default(now())

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  user   User?  @relation(fields: [userId], references: [id])

  @@map("ticket_history")
}

model Reply {
  id       String   @id @default(cuid())
  ticketId String
  userId   String
  body     String
  sentAt   DateTime @default(now())
  resendId String?

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id])

  @@map("replies")
}

model AIInteraction {
  id         String            @id @default(cuid())
  ticketId   String?
  type       AIInteractionType
  prompt     String
  response   String
  inputTokens  Int             @default(0)
  outputTokens Int             @default(0)
  costUsd    Float             @default(0)
  latencyMs  Int               @default(0)
  createdAt  DateTime          @default(now())

  ticket Ticket? @relation(fields: [ticketId], references: [id])

  @@map("ai_interactions")
}

model Document {
  id        String                      @id @default(cuid())
  title     String
  content   String
  embedding Unsupported("vector(1536)")?
  createdAt DateTime                    @default(now())
  updatedAt DateTime                    @updatedAt

  @@map("documents")
}

model Session {
  sid    String   @id @db.VarChar
  sess   Json
  expire DateTime @db.Timestamp(6)

  @@index([expire])
  @@map("session")
}
```

- [ ] **Step 3: Create and run migration**

Run: `cd server && pnpm prisma migrate dev --name init`
Expected: migration file created in `prisma/migrations/`, tables created in DB.

- [ ] **Step 4: Generate Prisma client**

Run: `cd server && pnpm prisma generate`
Expected: `@prisma/client` types updated.

- [ ] **Step 5: Verify schema in DB**

Run: `cd server && pnpm prisma studio`
Expected: Prisma Studio opens, shows all tables.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/
git commit -m "feat: prisma schema with all domain models and initial migration"
```

---

### Task 7: Prisma client singleton

**Files:**
- Create: `server/src/db.ts`

- [ ] **Step 1: Create `server/src/db.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

---

### Task 8: Express app bootstrap

**Files:**
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`

- [ ] **Step 1: Write failing test for health endpoint**

Create `server/src/app.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from './app'

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
```

Add `supertest` to devDependencies: `cd server && pnpm add -D supertest @types/supertest`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/app.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/src/app.ts`**

```typescript
import express from 'express'

export const app = express()

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})
```

- [ ] **Step 4: Create `server/src/index.ts`**

```typescript
import './env'
import { app } from './app'
import { env } from './env'

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`)
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/app.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/app.ts server/src/app.test.ts server/src/index.ts server/src/db.ts
git commit -m "feat: express app bootstrap with health endpoint"
```

---

### Task 9: testcontainers setup

**Files:**
- Create: `server/src/test/setup.ts`
- Create: `server/vitest.config.ts`

- [ ] **Step 1: Create `server/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: './src/test/setup.ts',
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
```

- [ ] **Step 2: Create `server/src/test/setup.ts`**

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from 'testcontainers'
import { execSync } from 'child_process'

let container: StartedPostgreSqlContainer

export async function setup() {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('helpdesk_test')
    .withUsername('test')
    .withPassword('test')
    .start()

  const url = container.getConnectionUri()
  process.env.DATABASE_URL = url
  process.env.SESSION_SECRET = 'test-secret-that-is-at-least-32-chars'
  process.env.NODE_ENV = 'test'

  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
}

export async function teardown() {
  await container?.stop()
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/test/ server/vitest.config.ts
git commit -m "feat: testcontainers global setup for integration tests"
```

---

### Task 10: Tailwind + shadcn/ui setup

**Files:**
- Modify: `client/`

- [ ] **Step 1: Init Tailwind**

Run:
```bash
cd client
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: Configure `client/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 3: Add Tailwind directives to `client/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Init shadcn/ui**

Run: `cd client && npx shadcn@latest init`

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

- [ ] **Step 5: Add core components**

Run:
```bash
cd client
npx shadcn@latest add button input label card badge table select
```

- [ ] **Step 6: Commit**

```bash
git add client/
git commit -m "feat: tailwind + shadcn/ui setup"
```

---

### Task 11: Pino structured logging

**Files:**
- Create: `server/src/lib/logger.ts`
- Modify: `server/src/middleware/errorHandler.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Install Pino**

Run: `cd server && pnpm add pino pino-pretty && pnpm add -D @types/pino`

Note: `pino-pretty` is for local dev only — production logs raw JSON.

- [ ] **Step 2: Create `server/src/lib/logger.ts`**

```typescript
import pino from 'pino'
import { env } from '../env'

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})
```

- [ ] **Step 3: Replace `console.error` in `server/src/middleware/errorHandler.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'
import { logger } from '../lib/logger'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error({ err }, 'Unhandled error')
  res.status(500).json({ error: 'Internal server error' })
}
```

- [ ] **Step 4: Use logger in `server/src/index.ts`**

```typescript
import './env'
import { app } from './app'
import { env } from './env'
import { logger } from './lib/logger'
import { getQueue } from './jobs/queue'
import { registerEmailWorker } from './jobs/processEmail'

async function main() {
  const queue = await getQueue()
  await registerEmailWorker(queue)
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Server started')
  })
}

main().catch(err => {
  logger.error({ err }, 'Failed to start server')
  process.exit(1)
})
```

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/logger.ts server/src/middleware/errorHandler.ts server/src/index.ts
git commit -m "feat: pino structured logging — JSON in production, pretty in dev"
```
