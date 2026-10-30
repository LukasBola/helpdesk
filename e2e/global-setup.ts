import { db } from './fixtures/db'

// Recreates the e2e users and fixture tickets in the dev database (idempotent).
export default function globalSetup() {
  db.seed()
}
