import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { mask } from '../mask'

const CASES = path.join(import.meta.dirname, 'cases')
const ISO = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z`
// Fixed-width columns: timestamp, level, id, symbol, phase, outcome, duration, then the tree
// part (indent, kind, text @ location) that START and END share.
const RECORD = new RegExp(
  String.raw`^(${ISO}) (INFO |WARN |ERROR) (T\d{3}(?:\.S\d{3})? *) ([▸✓✗⊘↳]) (START|END  |ERROR) (.{11}) (.{9})  (( *)(\w+) +(.*))$`,
)
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[/

interface Attachment {
  name: string
  body?: string
}
interface JsonSuite {
  suites?: JsonSuite[]
  specs?: { title: string; tests: { results: { attachments: Attachment[] }[] }[] }[]
}

test('mask hides known passwords, e-mails and token values', () => {
  expect(mask('Fill "e2e-password-123" for e2e-agent@helpdesk.local')).toBe(
    'Fill "[REDACTED]" for [REDACTED]',
  )
  expect(mask('Cookie: session_token=abc.def; Authorization: Bearer xyz')).not.toMatch(
    /abc\.def|xyz/,
  )
  expect(mask('Authorization: Basic dXNlcjpwYXNz'), 'Nagłówek Basic').not.toContain('dXNlcjpwYXNz')
  expect(mask('GET /api/tickets?status=OPEN')).toBe('GET /api/tickets?status=OPEN')
})

test.describe('step-log reporter on intentionally failing cases', () => {
  let output = ''

  test.beforeAll(() => {
    try {
      execFileSync(
        'pnpm',
        ['exec', 'playwright', 'test', '-c', path.join(CASES, 'playwright.config.ts')],
        // NO_COLOR: CI sets CI=true, which would otherwise turn colors on.
        { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
      )
    } catch (error) {
      output = (error as { stdout: string }).stdout // the run fails on purpose
    }
  })

  const records = () =>
    output
      .split('\n')
      .map(line => RECORD.exec(line))
      .filter(match => match !== null)
      .map(([line, time, level, id, symbol, phase, outcome, duration, tail, , kind, text]) => ({
        line,
        time,
        level: level.trim(),
        id: id.trim(),
        symbol,
        phase: phase.trim(),
        outcome: outcome.trim(),
        duration: duration.trim(),
        tail,
        kind,
        text,
      }))

  // All lines of the first attempt of a test, found by the id on its START line.
  const attemptOf = (title: string) => {
    const start = records().find(r => r.kind === 'TEST' && r.text.startsWith(`${title} (worker`))
    const id = start?.id ?? 'missing'
    return records().filter(r => r.id === id || r.id.startsWith(`${id}.`))
  }
  const log = (title: string) =>
    attemptOf(title)
      .map(r => r.line)
      .join('\n')

  test('every record has an ISO 8601 UTC timestamp and fixed-width columns', () => {
    const lines = output.split('\n').filter(line => / (START|END|ERROR) /.test(line))
    expect(lines.length, 'Liczba linii logu').toBeGreaterThan(20)
    for (const line of lines) expect(line, 'Linia logu ma stałe kolumny').toMatch(RECORD)
  })

  test('without a terminal or with NO_COLOR the log has no ANSI color codes', () => {
    expect(output, 'Wyjście procesu z NO_COLOR').not.toMatch(ANSI)
  })

  test('START and END of a step share the id and the exact text', () => {
    const all = records()
    const starts = all.filter(r => r.phase === 'START')
    for (const start of starts) {
      const end = all.find(r => r.phase === 'END' && r.id === start.id)
      expect(end, `END dla ${start.line}`).toBeDefined()
      expect(end?.tail, `Treść END = treść START dla ${start.id}`).toBe(start.tail)
      expect(start.symbol, 'Symbol START').toBe('▸')
      expect(start.outcome, 'START nie ma wyniku').toBe('')
      expect(start.duration, 'START nie ma czasu').toBe('')
      expect(end?.outcome, 'END ma wynik').not.toBe('')
    }
  })

  test('prints START and END with outcome and time for tests and steps', () => {
    const lines = log('passes with a named step')
    expect(lines).toMatch(/▸ START +STEP {3}Prepare data @ .*sample\.case\.ts:4$/m)
    expect(lines).toMatch(/✓ END {3}PASS +\d+ ms {4}STEP {3}Prepare data/)
    expect(lines).toMatch(/✓ END {3}PASS +\d+ ms {6}ASSERT sum is two/)
    expect(attemptOf('passes with a named step').at(-1)?.line).toMatch(/✓ END {3}PASS .* TEST /)
  })

  test('soft failure is a FAIL step with expected/received, and the test continues and fails', () => {
    const lines = log('soft failure keeps running')
    expect(lines).toMatch(/ERROR .* ✗ END {3}FAIL +\d+ ms +ASSERT soft check/)
    expect(lines).toMatch(
      /ERROR .* ↳ ERROR +ASSERT Error: soft check \| Expected: 2 \| Received: 1/,
    )
    expect(lines).toMatch(/✓ END {3}PASS +\d+ ms +ASSERT after soft/)
    expect(lines).toMatch(/✗ END {3}FAIL +\d+ ms +TEST /)
  })

  test('web-first assertions still auto-wait and negate', () => {
    const lines = log('negation and auto-wait keep Playwright semantics')
    expect(lines).toMatch(/✓ END {3}PASS +\d+ ms +ASSERT waits for ready/)
    expect(lines).toMatch(/✓ END {3}PASS +\d+ ms +ASSERT negation/)
  })

  test('secrets do not reach the terminal, also in failure details', () => {
    expect(output).toContain('[REDACTED]')
    expect(output).not.toMatch(/e2e-password-123|e2e-admin@helpdesk\.local|abc123/)
  })

  test('typed test values stay visible, known secrets are masked', () => {
    const lines = log('secrets are masked')
    expect(lines, 'Wartość wpisana w teście jest widoczna').toMatch(
      /ACTION Fill "to-nie-jest-email" \[getByLabel\('E-mail'\)\]/,
    )
    expect(lines, 'Znane hasło e2e jest zamaskowane').toMatch(
      /ACTION Fill "\[REDACTED\]" \[getByLabel\('Hasło'\)\]/,
    )
  })

  test('a secret split across two stdout writes is masked as one line', () => {
    expect(output, 'Token rozbity na dwa zapisy').not.toMatch(/split|Token987/)
    expect(output, 'Cała linia z prefiksem próby').toMatch(/^T\d{3} Authorization: \[REDACTED\]/m)
  })

  test('each retry is a separate attempt with its own outcome', () => {
    expect(output).toMatch(/START .*flaky passes on retry \(worker \d+, retry 0\)/)
    expect(output).toMatch(/START .*flaky passes on retry \(worker \d+, retry 1\)/)
    expect(output).toMatch(/3 passed, 3 failed, 1 flaky, 0 skipped, 1 expected to fail, 0 not run/)
    expect(output).not.toMatch(/^\d+\) .*flaky passes on retry/m)
  })

  test('a skipped step is SKIPPED, not PASS', () => {
    expect(log('skipped and multi-line steps'), 'Krok test.step.skip').toMatch(
      /WARN .* ⊘ END {3}SKIPPED +\d+ ms +STEP {3}Not run @/,
    )
  })

  test('a multi-line step title stays on one log line', () => {
    const lines = log('skipped and multi-line steps')
    expect(lines, 'Tytuł z nową linią').toMatch(/▸ START +STEP {3}First line⏎ second line @ /)
    expect(output, 'Druga linia tytułu nie trafia do logu osobno').not.toMatch(/^second line/m)
  })

  test('tests that never ran are counted after --max-failures', () => {
    const run = (() => {
      try {
        return execFileSync(
          'pnpm',
          [
            'exec',
            'playwright',
            'test',
            '-c',
            path.join(CASES, 'playwright.config.ts'),
            '--max-failures=1',
            '--workers=1',
            '--retries=0',
            `--reporter=${path.join(import.meta.dirname, '..', 'step-log.ts')}`,
          ],
          { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
        )
      } catch (error) {
        return (error as { stdout: string }).stdout
      }
    })()
    expect(run, 'Podsumowanie z liczbą nieuruchomionych').toMatch(/, [1-9]\d* not run$/m)
  })

  test('a timed out step is never reported as PASS and is named as the failed step', () => {
    const lines = log('timeout is not a pass')
    expect(lines).not.toMatch(/PASS .*Never ends/)
    expect(lines).toMatch(/✗ END {3}INCOMPLETE +\d+ ms +STEP {3}Never ends/)
    expect(lines).toMatch(/✗ END {3}TIMEOUT +\d+ ms +TEST /)
    expect(output).toMatch(/Failed step: T\d{3}\.S\d{3} STEP Never ends/)
  })

  test('the failure summary points at the failing step and its location', () => {
    expect(output).toMatch(
      /Failed step: T\d{3}\.S\d{3} ASSERT soft check @ e2e\/reporters\/tests\/cases\/sample\.case\.ts:10/,
    )
    expect(output).toMatch(/Expected: 2\n\s+Received: 1/)
  })

  test('each attempt gets its own log as the step-log.log attachment', () => {
    const report = JSON.parse(
      readFileSync(path.join(CASES, 'test-results', 'report.json'), 'utf8'),
    ) as JsonSuite
    const specs = (suite: JsonSuite): NonNullable<JsonSuite['specs']> => [
      ...(suite.specs ?? []),
      ...(suite.suites ?? []).flatMap(specs),
    ]
    const flaky = specs(report).find(spec => spec.title === 'flaky passes on retry')
    const logs = (flaky?.tests[0].results ?? []).map(result => {
      const attachment = result.attachments.find(a => a.name === 'step-log.log')
      return Buffer.from(attachment?.body ?? '', 'base64').toString()
    })
    expect(logs, 'Liczba załączników (dwie próby)').toHaveLength(2)
    expect(logs[0], 'Log pierwszej próby').toMatch(/retry 0\)/)
    expect(logs[0], 'Log pierwszej próby nie zawiera drugiej').not.toMatch(/retry 1\)/)
    expect(logs[1], 'Log drugiej próby').toMatch(/✓ END {3}PASS .* TEST .*retry 1\)/)
    expect(logs.join(''), 'Załącznik bez kodów ANSI').not.toMatch(ANSI)
  })
})
