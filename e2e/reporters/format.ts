import { mask } from './mask'

// One log record = one line with fixed-width columns:
//
//   2026-11-01T10:15:02.143Z INFO  T001.S002 ▸ START                    STEP   LoginPage.goto @ e2e/tests/auth.setup.ts:11
//   2026-11-01T10:15:02.290Z INFO  T001.S002 ✓ END   PASS        147 ms STEP   LoginPage.goto @ e2e/tests/auth.setup.ts:11
//
//   timestamp (ISO 8601, UTC) · level · id · symbol · phase · outcome · duration · kind · text @ location
//
// The id pairs START with END (T = test attempt, S = step within it), and everything from
// the kind on is identical on both lines, so `grep T001.S002` returns exactly the pair.
// Nested steps are indented as a block (kind + text), so every column before stays aligned.
//
// Symbols are plain Unicode text characters (not emoji): one column wide, the same in a
// terminal, CI logs and files. Colors are ANSI codes added only for a terminal or CI
// (see `useColor`); the plain text (attachments, pipes, NO_COLOR) never contains them.

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
  depth?: number
  text: string
  location?: string
}

export interface FormattedLine {
  plain: string
  colored: string
}

type Color = 'gray' | 'red' | 'green' | 'yellow' | 'cyan' | 'bold'
const ANSI: Record<Color, [number, number]> = {
  gray: [90, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  cyan: [36, 39],
  bold: [1, 22],
}
export const paint = (color: Color, text: string) =>
  `\x1b[${ANSI[color][0]}m${text}\x1b[${ANSI[color][1]}m`

// NO_COLOR (https://no-color.org) wins, FORCE_COLOR forces, otherwise a terminal or CI.
export const useColor =
  !process.env.NO_COLOR &&
  (process.env.FORCE_COLOR !== undefined
    ? process.env.FORCE_COLOR !== '0'
    : !!process.stdout.isTTY || !!process.env.CI)

const SYMBOL: Record<Outcome | 'START' | 'ERROR', [string, Color]> = {
  START: ['▸', 'cyan'],
  PASS: ['✓', 'green'],
  SKIPPED: ['⊘', 'yellow'],
  FAIL: ['✗', 'red'],
  TIMEOUT: ['✗', 'red'],
  INTERRUPTED: ['✗', 'red'],
  INCOMPLETE: ['✗', 'red'],
  ERROR: ['↳', 'red'],
}

const LEVEL_COLOR: Record<string, Color> = { INFO: 'gray', WARN: 'yellow', ERROR: 'red' }

function level(record: LogRecord): 'INFO' | 'WARN' | 'ERROR' {
  if (record.phase === 'ERROR') return 'ERROR'
  if (!record.outcome || record.outcome === 'PASS') return 'INFO'
  return record.outcome === 'SKIPPED' ? 'WARN' : 'ERROR'
}

export function formatRecord(record: LogRecord): FormattedLine {
  const lvl = level(record)
  const [symbol, color] = SYMBOL[record.phase === 'END' ? (record.outcome ?? 'PASS') : record.phase]
  const duration = record.durationMs === undefined ? '' : `${Math.round(record.durationMs)} ms`
  const indent = '  '.repeat(record.depth ?? 0)
  const text = mask(record.text)
  const location = record.location ? ` @ ${mask(record.location)}` : ''

  const columns = [
    record.time.toISOString(),
    lvl.padEnd(5),
    record.id.padEnd(9),
    symbol,
    record.phase.padEnd(5),
    (record.outcome ?? '').padEnd(11),
    duration.padStart(9),
  ]
  const tail = `${indent}${record.kind.padEnd(6)} ${text}${location}`
  const plain = `${columns.join(' ')}  ${tail}`

  const isTest = record.kind === 'TEST' || record.kind === 'GLOBAL'
  const body = record.phase === 'ERROR' ? paint('red', text) : isTest ? paint('bold', text) : text
  const colored =
    [
      paint('gray', columns[0]),
      paint(LEVEL_COLOR[lvl], columns[1]),
      columns[2],
      paint(color, symbol),
      columns[4],
      paint(color, columns[5]),
      paint('gray', columns[6]),
    ].join(' ') +
    `  ${indent}${paint(isTest ? 'bold' : 'cyan', record.kind.padEnd(6))} ${body}` +
    paint('gray', location)
  return { plain, colored }
}

export const attemptId = (attempt: number) => `T${String(attempt).padStart(3, '0')}`
export const stepId = (attempt: number, step: number) =>
  `${attemptId(attempt)}.S${String(step).padStart(3, '0')}`
