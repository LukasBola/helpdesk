# Plan 10: Knowledge Base (pgvector RAG)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store support documents as vector embeddings in PostgreSQL (pgvector). When generating a suggested reply, retrieve the top-3 relevant passages and include them as context for Claude.

**Architecture:** `embeddingService.ts` calls `text-embedding-3-small` (via Anthropic or OpenAI) to convert text to 1536-dim vectors stored in the `documents` table. `retrieveContext(query)` does a cosine-similarity search via pgvector `<=>` operator. `suggestReply` in `aiService.ts` receives the retrieved context string.

**Tech Stack:** pgvector (Postgres extension, already in schema), `@anthropic-ai/sdk` or `openai` SDK for embeddings, Prisma raw query for vector search

**Prerequisite:** Plan 01 (schema has `documents` table with `embedding` column), Plan 07 (suggestReply accepts `context` param).

---

## File Map

```
server/src/
├── services/
│   └── embeddingService.ts    # embedText, indexDocument, retrieveContext
└── routes/
    └── documents.ts           # POST /api/documents (admin only), GET /api/documents
```

---

### Task 1: Embedding service

**Files:**

- Create: `server/src/services/embeddingService.ts`

- [ ] **Step 1: Install OpenAI SDK for embeddings**

Note: Anthropic does not have an embeddings endpoint as of the project cutoff. Use OpenAI `text-embedding-3-small`.

Run: `cd server && pnpm add openai`

Add to `server/src/env.ts`:

```typescript
OPENAI_API_KEY: z.string().optional(),
```

Add to `.env.example`:

```bash
OPENAI_API_KEY=""
```

- [ ] **Step 2: Write failing unit tests**

Create `server/src/services/embeddingService.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { chunkText } from './embeddingService'

describe('chunkText', () => {
  it('splits text into chunks under maxChars', () => {
    const text = 'word '.repeat(300)
    const chunks = chunkText(text, 200)
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(210))
  })

  it('returns single chunk for short text', () => {
    const text = 'Short document.'
    const chunks = chunkText(text, 500)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe('Short document.')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && pnpm test src/services/embeddingService.test.ts`
Expected: FAIL.

- [ ] **Step 4: Create `server/src/services/embeddingService.ts`**

```typescript
import OpenAI from 'openai'
import { prisma } from '../db'
import { env } from '../env'

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

export function chunkText(text: string, maxChars = 500): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars && current) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current += sentence
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export async function embedText(text: string): Promise<number[]> {
  if (!openai) throw new Error('OPENAI_API_KEY not set')

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  })

  return response.data[0].embedding
}

export async function indexDocument(title: string, content: string): Promise<void> {
  const chunks = chunkText(content)

  for (const chunk of chunks) {
    const embedding = await embedText(chunk)
    const vectorLiteral = `[${embedding.join(',')}]`

    await prisma.$executeRaw`
      INSERT INTO documents (id, title, content, embedding, "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        ${title},
        ${chunk},
        ${vectorLiteral}::vector,
        NOW(),
        NOW()
      )
    `
  }
}

export async function retrieveContext(query: string, topK = 3): Promise<string> {
  if (!openai) return ''

  const queryEmbedding = await embedText(query)
  const vectorLiteral = `[${queryEmbedding.join(',')}]`

  const results = await prisma.$queryRaw<{ content: string; title: string }[]>`
    SELECT content, title
    FROM documents
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `

  return results.map(r => `[${r.title}]\n${r.content}`).join('\n\n')
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/services/embeddingService.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/services/embeddingService.ts server/src/services/embeddingService.test.ts server/src/env.ts .env.example
git commit -m "feat: embedding service — chunk, embed, index, retrieve context via pgvector"
```

---

### Task 2: Wire context into suggestReply

**Files:**

- Modify: `server/src/routes/ai.ts`

- [ ] **Step 1: Update suggest-reply route to fetch context first**

In `server/src/routes/ai.ts`, update the `/suggest-reply` handler:

```typescript
import { retrieveContext } from '../services/embeddingService'

// replace the suggest-reply route:
router.post('/suggest-reply', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.ticketId } })
  if (!ticket) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const context = await retrieveContext(`${ticket.subject} ${ticket.body}`).catch(() => '')
  const reply = await suggestReply(ticket, context, ticket.id)
  res.json({ reply })
})
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/ai.ts
git commit -m "feat: inject RAG context into suggested reply prompt"
```

---

### Task 3: Documents API

**Files:**

- Create: `server/src/routes/documents.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/routes/documents.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { prisma } from '../db'
import bcrypt from 'bcrypt'

vi.mock('../services/embeddingService', () => ({
  indexDocument: vi.fn().mockResolvedValue(undefined),
  retrieveContext: vi.fn().mockResolvedValue(''),
  chunkText: vi.fn().mockReturnValue(['chunk']),
}))

let adminCookie: string

beforeAll(async () => {
  await prisma.user.create({
    data: {
      email: 'admin-docs@test.com',
      name: 'Admin',
      passwordHash: await bcrypt.hash('pass123', 10),
      role: 'ADMIN',
    },
  })
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin-docs@test.com', password: 'pass123' })
  adminCookie = login.headers['set-cookie'][0]
})

afterAll(async () => {
  await prisma.user.deleteMany()
})

describe('POST /api/documents', () => {
  it('accepts document and triggers indexing', async () => {
    const res = await request(app).post('/api/documents').set('Cookie', adminCookie).send({
      title: 'Course access FAQ',
      content: 'To access your course, log in and go to My Courses.',
    })
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ ok: true })
  })

  it('returns 422 for missing title', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Cookie', adminCookie)
      .send({ content: 'Something' })
    expect(res.status).toBe(422)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test src/routes/documents.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `server/src/routes/documents.ts`**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../middleware/auth'
import { indexDocument } from '../services/embeddingService'
import { prisma } from '../db'

const router = Router()

router.use(requireAuth, requireRole('ADMIN'))

const createSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

router.get('/', async (_req, res) => {
  const docs = await prisma.document.findMany({
    select: { id: true, title: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(docs)
})

router.post('/', async (req, res) => {
  const result = createSchema.safeParse(req.body)
  if (!result.success) {
    res.status(422).json({ error: result.error.flatten() })
    return
  }

  res.status(202).json({ ok: true })

  // Index asynchronously after responding
  indexDocument(result.data.title, result.data.content).catch(err =>
    console.error('[documents] indexing failed:', err),
  )
})

export default router
```

- [ ] **Step 4: Wire route in `server/src/app.ts`**

```typescript
import documentsRouter from './routes/documents'
// ...
app.use('/api/documents', documentsRouter)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && pnpm test src/routes/documents.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/documents.ts server/src/routes/documents.test.ts server/src/app.ts
git commit -m "feat: documents API — admin uploads knowledge base articles for RAG"
```
