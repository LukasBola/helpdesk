# ADR-0002: PostgreSQL 16 z pgvector jako jedyna baza, Prisma jako ORM

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-04-23 (źródło: commit `d1441c4`); wdrożenie 2026-05-11 (`117159e`, `3dfc0e7`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

System przechowuje tickety, użytkowników, historię zmian i odpowiedzi. Zaplanowana baza wiedzy ma używać embeddingów (RAG). Założenie z `tech-stack.md`: bez dodatkowej infrastruktury dla wektorów.

## Decyzja

PostgreSQL 16 z rozszerzeniem pgvector (obraz `pgvector/pgvector:pg16`) jako jedyny magazyn danych. Dostęp przez Prisma 5. Kolumna `embedding vector(1536)` istnieje w schemacie od pierwszej migracji.

## Rozważane opcje

Brak zapisu o rozważanych alternatywach.

## Konsekwencje

**Pozytywne**

- Jedna baza dla danych domenowych, sesji, kolejki zadań (ADR-0003) i przyszłych embeddingów.
- Ten sam obraz w docker-compose i w testach integracyjnych (ADR-0010).

**Negatywne / koszty**

- Prisma 5 nie obsługuje typu `vector`: kolumna jest `Unsupported("vector(1536)")`, więc zapytania wektorowe będą wymagały surowego SQL.
- CLI Prisma 5 nie działa na Node 24, co wymusiło ograniczenie wersji Node (ADR-0013).

**Niewiadome**

- pgvector nie jest jeszcze używany przez kod; `tech-stack.md` określa format bazy wiedzy jako „TBD”.

## Dowody

- `d1441c4` – `tech-stack.md`: „pgvector — Postgres extension for knowledge base embeddings (no extra infra)”
- `117159e` – „docker compose with postgres 16 + pgvector”
- `3dfc0e7` – schemat Prisma i migracja `20260511165002_init` (`CREATE EXTENSION "vector"`, `vector(1536)`)
- `server/prisma/schema.prisma` – `Unsupported("vector(1536)")`
- `2a28506` – „Node 24 incompatible with Prisma v5 CLI”
