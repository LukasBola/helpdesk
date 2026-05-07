# AI-Powered Ticket Management System

## Problem

We receive hundreds of support emails daily. Our agents manually read, classify, and respond to each ticket — which is slow and leads to impersonal, canned responses.

## Solution

Build a ticket management system that uses AI to automatically classify, respond to, and route support tickets — delivering faster, more personalized responses to students while freeing up agents for complex issues.

## Features

- Receive support emails and create tickets
- Auto-generate human-friendly responses using a knowledge base
- Ticket list with filtering and sorting
- Ticket detail view
- AI-powered ticket classification
- AI summaries
- AI-suggested replies
- User management (admin only)
- Dashboard to view and manage all tickets
- Ticket statuses (open → in progress → resolved → closed)
- Ticket priority levels (low / medium / high / urgent)
- Send replies back to the customer via email
- Ticket change history (who did what and when)
- Authentication — login and user roles

## Code Quality

- Consistent code formatting enforced automatically (Prettier)
- Static analysis and error prevention (ESLint)
- Pre-commit hooks that block commits with formatting or lint errors (Husky + lint-staged)
- All rules shared across client and server from a single root config
- TypeScript compilation check in CI (`tsc --noEmit`) — blocks merge on type errors
