import { mask } from './mask'

// One log record = one line with fixed columns, the same for START and END:
//
//   timestamp (ISO 8601, UTC)  level  id         phase result      duration  kind    text
//   2026-11-01T10:15:02.300Z   INFO   T003.S012  START -                  -  ACTION  Click getByRole('button') (e2e/pages/AppShell.ts:20)
//   2026-11-01T10:15:02.380Z   INFO   T003.S012  END   PASS            80 ms  ACTION  Click getByRole('button') (e2e/pages/AppShell.ts:20)
//
// The id pairs START with END (T = test attempt, S = step within it) and the text after
// the kind is identical on both lines, so `grep T003.S012` returns exactly the pair.

export type Phase = 'START' | 'END' | 'ERROR'
export type Outcome = 'PASS' | 'FAIL' | 'TIMEOUT' | 'INTERRUPTED' | 'INCOMPLETE' | 'SKIPPED'
export type Kind = 'GLOBAL' | 'TEST' | 'HOOK' | 'STEP' | 'ACTION' | 'ASSERT'

export interface LogRecord {
  time: Date
  id: string
  phase: Phase
  outcome?: Outcome
  durationMs?: number
  kind: Kind
  text: string
}

const LEVEL: Record<Outcome, string> = {
  PASS: 'INFO',
  SKIPPED: 'WARN',
  FAIL: 'ERROR',
  TIMEOUT: 'ERROR',
  INTERRUPTED: 'ERROR',
  INCOMPLETE: 'ERROR',
}

export function formatRecord(record: LogRecord): string {
  const level = record.phase === 'ERROR' ? 'ERROR' : record.outcome ? LEVEL[record.outcome] : 'INFO'
  const duration = record.durationMs === undefined ? '-' : `${Math.round(record.durationMs)} ms`
  return mask(
    [
      record.time.toISOString(),
      level.padEnd(5),
      record.id.padEnd(9),
      record.phase.padEnd(5),
      (record.outcome ?? '-').padEnd(11),
      duration.padStart(9),
      record.kind.padEnd(6),
      record.text,
    ].join(' '),
  )
}

export const attemptId = (attempt: number) => `T${String(attempt).padStart(3, '0')}`
export const stepId = (attempt: number, step: number) =>
  `${attemptId(attempt)}.S${String(step).padStart(3, '0')}`
