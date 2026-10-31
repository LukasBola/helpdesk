import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { mask } from '../mask'

const CASES = path.join(import.meta.dirname, 'cases')
const ISO = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z`
// timestamp level id phase outcome duration kind text
const RECORD = new RegExp(
  String.raw`^(${ISO}) (\w+) +(T\d{3}(?:\.S\d{3})?) +(\w+) +(\S+) +(-|\d+ ms) (\w+) +(.*)$`,
)

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
  expect(mask('GET /api/tickets?status=OPEN')).toBe('GET /api/tickets?status=OPEN')
})

test.describe('step-log reporter on intentionally failing cases', () => {
  let output = ''

  test.beforeAll(() => {
    try {
      execFileSync(
        'pnpm',
        ['exec', 'playwright', 'test', '-c', path.join(CASES, 'playwright.config.ts')],
        { encoding: 'utf8' },
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
      .map(([line, time, level, id, phase, outcome, duration, kind, text]) => {
        return { line, time, level, id, phase, outcome, duration, kind, text }
      })

  // All lines of the first attempt of a test, found by the id on its START line.
  const attemptOf = (title: string) => {
    const start = records().find(r => r.kind === 'TEST' && r.text.includes(`› ${title} (`))
    const id = start?.id ?? 'missing'
    return records().filter(r => r.id === id || r.id.startsWith(`${id}.`))
  }
  const log = (title: string) =>
    attemptOf(title)
      .map(r => r.line)
      .join('\n')

  test('every record has an ISO 8601 UTC timestamp and fixed columns', () => {
    const lines = output.split('\n').filter(line => / (START|END|ERROR) /.test(line))
    expect(lines.length).toBeGreaterThan(20)
    for (const line of lines) expect(line).toMatch(RECORD)
  })

  test('START and END of a step share the id and the exact text', () => {
    const all = records()
    const starts = all.filter(r => r.phase === 'START')
    for (const start of starts) {
      const end = all.find(r => r.phase === 'END' && r.id === start.id)
      expect(end, `END for ${start.line}`).toBeDefined()
      expect(end?.kind).toBe(start.kind)
      expect(end?.text).toBe(start.text)
      expect(start.outcome).toBe('-')
      expect(end?.outcome).not.toBe('-')
    }
  })

  test('prints START and END with outcome and time for tests and steps', () => {
    const lines = log('passes with a named step')
    expect(lines).toMatch(/START -\s+- STEP +Prepare data \(.*sample\.case\.ts:4\)/)
    expect(lines).toMatch(/END {3}PASS +\d+ ms STEP +Prepare data/)
    expect(lines).toMatch(/END {3}PASS +\d+ ms ASSERT +sum is two/)
    expect(attemptOf('passes with a named step').at(-1)?.line).toMatch(/END {3}PASS .* TEST /)
  })

  test('soft failure is a FAIL step with expected/received, and the test continues and fails', () => {
    const lines = log('soft failure keeps running')
    expect(lines).toMatch(/ERROR .* END {3}FAIL +\d+ ms ASSERT soft check/)
    expect(lines).toMatch(/ERROR .* ERROR - .*↳ Error: soft check \| Expected: 2 \| Received: 1/)
    expect(lines).toMatch(/END {3}PASS +\d+ ms ASSERT after soft/)
    expect(lines).toMatch(/END {3}FAIL +\d+ ms TEST /)
  })

  test('web-first assertions still auto-wait and negate', () => {
    const lines = log('negation and auto-wait keep Playwright semantics')
    expect(lines).toMatch(/END {3}PASS +\d+ ms ASSERT waits for ready/)
    expect(lines).toMatch(/END {3}PASS +\d+ ms ASSERT negation/)
  })

  test('secrets do not reach the terminal, also in failure details', () => {
    expect(output).toContain('[REDACTED]')
    expect(output).not.toMatch(/e2e-password-123|e2e-admin@helpdesk\.local|abc123/)
  })

  test('each retry is a separate attempt with its own outcome', () => {
    expect(output).toMatch(/START .*flaky passes on retry \(worker \d+, retry 0\)/)
    expect(output).toMatch(/START .*flaky passes on retry \(worker \d+, retry 1\)/)
    expect(output).toMatch(/2 passed, 3 failed, 1 flaky, 0 skipped/)
    expect(output).not.toMatch(/^\d+\) .*flaky passes on retry/m)
  })

  test('a timed out step is never reported as PASS and is named as the failed step', () => {
    const lines = log('timeout is not a pass')
    expect(lines).not.toMatch(/PASS .*Never ends/)
    expect(lines).toMatch(/END {3}INCOMPLETE +\d+ ms STEP +Never ends/)
    expect(lines).toMatch(/END {3}TIMEOUT +\d+ ms TEST /)
    expect(output).toMatch(/Failed step: T\d{3}\.S\d{3} STEP Never ends/)
  })

  test('the failure summary points at the failing step and its location', () => {
    expect(output).toMatch(
      /Failed step: T\d{3}\.S\d{3} ASSERT soft check \(e2e\/reporters\/tests\/cases\/sample\.case\.ts:10\)/,
    )
    expect(output).toMatch(/Expected: 2\n\s+Received: 1/)
  })

  test('each attempt gets its own log as the step-log.txt attachment', () => {
    const report = JSON.parse(
      readFileSync(path.join(CASES, 'test-results', 'report.json'), 'utf8'),
    ) as JsonSuite
    const specs = (suite: JsonSuite): NonNullable<JsonSuite['specs']> => [
      ...(suite.specs ?? []),
      ...(suite.suites ?? []).flatMap(specs),
    ]
    const flaky = specs(report).find(spec => spec.title === 'flaky passes on retry')
    const logs = (flaky?.tests[0].results ?? []).map(result => {
      const attachment = result.attachments.find(a => a.name === 'step-log.txt')
      return Buffer.from(attachment?.body ?? '', 'base64').toString()
    })
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatch(/retry 0\)/)
    expect(logs[0]).not.toMatch(/retry 1\)/)
    expect(logs[1]).toMatch(/END {3}PASS .* TEST .*retry 1\)/)
  })
})
