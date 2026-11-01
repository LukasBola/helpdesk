import { db } from './fixtures/db'
import { formatRecord, type LogRecord, useColor } from './reporters/format'

const SEED = {
  id: 'G000',
  kind: 'GLOBAL',
  text: 'Seed e2e users and tickets',
  location: 'e2e/global-setup.ts',
} as const

function log(record: LogRecord) {
  const line = formatRecord(record)
  console.log(useColor ? line.colored : line.plain)
}

// Recreates the e2e users and fixture tickets in the dev database (idempotent).
// Runs once per run, outside any test, so it logs under its own GLOBAL id (same format as the step log).
export default function globalSetup() {
  const started = new Date()
  const end = (outcome: LogRecord['outcome']) =>
    log({
      ...SEED,
      time: new Date(),
      phase: 'END',
      outcome,
      durationMs: Date.now() - started.getTime(),
    })
  log({ ...SEED, time: started, phase: 'START' })
  try {
    db.seed()
  } catch (error) {
    end('FAIL')
    throw error
  }
  end('PASS')
}
