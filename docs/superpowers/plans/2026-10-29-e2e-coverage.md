# E2E Coverage Round 2: Test Plan

**Goal:** Broaden the Playwright suite. Add UI cases and a set of **API tests that go through the frontend origin** (`http://localhost:5173/api/*` → Vite proxy → Express/Better Auth). Those tests check the connection between frontend and backend, not just the backend in isolation. Use the results to find real bugs.

**Why API tests through the proxy:** server unit tests call `app` directly with supertest. They don't exercise the Vite proxy, the `Origin` header, `trustedOrigins`, cookie attributes as a browser receives them, or the shape of responses the SPA depends on.

## Test data

`server/prisma/e2e-fixtures.ts` (CLI, run against the dev DB):

- `seed`: users `e2e-admin`, `e2e-agent` and `e2e-blocked` (initially _not_ blocked), plus fixture tickets with `messageId` prefix `e2e-`. Previous fixture tickets are deleted and recreated, so every run starts clean.
- `block <email>` / `unblock <email>`: toggle `isBlocked` (used by the blocked-user scenarios).

The e2e helper `e2e/fixtures/db.ts` wraps these commands with `execSync`.

## Matrix

### API, auth (`e2e/api/auth.api.spec.ts`)

| #   | Case                                                   | Expected                                                                                 |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| A1  | sign-in valid                                          | 200, `Set-Cookie` HttpOnly + SameSite=Lax, body has `user.role`, no password/hash fields |
| A2  | sign-in wrong password / unknown email / blocked user  | 401, **identical** bodies (`INVALID_EMAIL_OR_PASSWORD`)                                  |
| A3  | sign-in missing password, malformed email              | 400                                                                                      |
| A4  | sign-in with upper-case email                          | 200                                                                                      |
| A5  | sign-in from untrusted Origin                          | 403 `INVALID_ORIGIN`                                                                     |
| A6  | sign-up                                                | rejected, no user created                                                                |
| A7  | get-session without / with cookie                      | `null` / user with `role`, `isBlocked`                                                   |
| A8  | sign-out                                               | session gone: get-session `null`, `/api/tickets` 401                                     |
| A9  | update-user with `role: 'ADMIN'` or `isBlocked: false` | rejected or ignored: role unchanged (no privilege escalation)                            |
| A10 | change-password with wrong current password            | 4xx, old password still works                                                            |

### API, tickets (`e2e/api/tickets.api.spec.ts`)

| #   | Case                                                                      | Expected                                                    |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| T1  | list / detail / patch without session                                     | 401                                                         |
| T2  | list default shape                                                        | `{ tickets, total, page: 1, limit: 25 }`, includes fixtures |
| T3  | filters `status`, `priority`, `search` (case-insensitive), `limit`/`page` | correct subset and pagination                               |
| T4  | invalid query (`status=FOO`, `limit=101`, `page=0`, `orderBy=x`)          | 422                                                         |
| T5  | detail of existing / unknown id                                           | 200 with `history`/`replies` / 404                          |
| T6  | PATCH status and priority as AGENT                                        | 200, history entries with the actor                         |
| T7  | PATCH invalid enum, assigneeId not a cuid                                 | 422                                                         |
| T8  | PATCH assigneeId = valid cuid of a non-existent user                      | **4xx, not 500**                                            |
| T9  | PATCH malformed JSON body                                                 | **400, not 500**                                            |
| T10 | PATCH unknown ticket                                                      | 404                                                         |
| T11 | PATCH `assigneeId: null` (unassign)                                       | 200, assignee null                                          |
| T12 | blocked user with a live session                                          | 401 on `/api/tickets`                                       |

### API, misc (`e2e/api/misc.api.spec.ts`)

| #   | Case                                                                                           | Expected |
| --- | ---------------------------------------------------------------------------------------------- | -------- |
| M1  | Postmark webhook without / with wrong token                                                    | 401      |
| M2  | Postmark webhook, invalid payload with a valid token (only if `POSTMARK_WEBHOOK_TOKEN` is set) | 400      |
| M3  | unknown `/api/*` route                                                                         | 404      |

### UI (additions to `e2e/tests/*`)

| #   | Case                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------- |
| U1  | empty form / malformed email: native validation, no request sent                                           |
| U2  | submit with Enter key                                                                                      |
| U3  | button disabled + spinner while sign-in is slow (route delay)                                              |
| U4  | mocked 429 → rate-limit message; mocked 500 / network abort → generic message                              |
| U5  | logged-in user opening `/login` → `/tickets`                                                               |
| U6  | redirect keeps the query string (`/tickets?status=OPEN`)                                                   |
| U7  | after logout, browser Back does not show the app                                                           |
| U8  | session shared across tabs; logout in one tab → other tab shows login after focus/reload                   |
| U9  | user blocked while signed in → reload shows the login form, no loop; login attempt shows the generic error |
| U10 | avatar menu shows name + role label (administrator / agent)                                                |
| U11 | mobile drawer closes with Escape and the X button; agent's drawer has no Użytkownicy                       |
| U12 | 404 while logged out → "Wróć do ticketów" leads to login                                                   |
| U13 | page `<html lang="pl">` and title                                                                          |
| U14 | expired/cleared cookies + reload → login, then back to the same page                                       |

## Procedure

1. Implement fixtures, then the API specs, then the UI additions.
2. Run. Triage every failure: is it a **test bug** (fix the test) or a **product bug**?
3. For each product bug: write a failing server or client unit test, fix it, and keep the e2e case as a regression test.
4. Get a fresh-eyes review of the suite (gaps, flakiness, wrong assertions), apply the findings, and run everything again.
