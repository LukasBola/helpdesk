import { db } from './fixtures/db'
import { formatRecord, type LogRecord } from './reporters/format'

const record = {
  id: 'G000',
  kind: 'GLOBAL',
  text: 'Seed e2e users and tickets (e2e/global-setup.ts)',
} as const

// Recreates the e2e users and fixture tickets in the dev database (idempotent).
// Runs once per run, outside any test, so it logs under its own GLOBAL id (same format as the step log).
export default function globalSetup() {
  const started = new Date()
  const end = (outcome: LogRecord['outcome']): string =>
    formatRecord({
      ...record,
      time: new Date(),
      phase: 'END',
      outcome,
      durationMs: Date.now() - started.getTime(),
    })
  console.log(formatRecord({ ...record, time: started, phase: 'START' }))
  try {
    db.seed()
  } catch (error) {
    console.log(end('FAIL'))
    throw error
  }
  console.log(end('PASS'))
}
