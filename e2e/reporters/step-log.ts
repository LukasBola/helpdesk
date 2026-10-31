import path from 'node:path'

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from '@playwright/test/reporter'

import { attemptId, formatRecord, type Kind, type LogRecord, type Outcome, stepId } from './format'
import { mask } from './mask'

// Live START/END log of tests and steps, built on Playwright's Reporter API (an observer
// of test events): tests stay plain Playwright code, every step is reported here.
// https://playwright.dev/docs/api/class-reporter
//
// Each attempt also gets its log as the `step-log.txt` attachment, shown in the HTML
// report next to the attempt's trace. Line format: see ./format.ts.
//
// E2E_LOG=tests prints only test START/END to the terminal; the attachment is always full.

const KIND: Record<string, Kind> = {
  hook: 'HOOK',
  'test.step': 'STEP',
  'pw:api': 'ACTION',
  expect: 'ASSERT',
}
const OUTCOME: Record<TestResult['status'], Outcome> = {
  passed: 'PASS',
  failed: 'FAIL',
  timedOut: 'TIMEOUT',
  skipped: 'SKIPPED',
  interrupted: 'INTERRUPTED',
}

interface FailedStep {
  id: string
  kind: Kind
  text: string
  path: string
}

interface Attempt {
  number: number
  steps: Map<TestStep, string>
  open: Set<TestStep>
  lines: string[]
  failedStep?: FailedStep
}

interface Failure {
  test: TestCase
  result: TestResult
  attempt: Attempt
}

export default class StepLogReporter implements Reporter {
  private readonly printSteps = process.env.E2E_LOG !== 'tests'
  private rootDir = ''
  private attempts = 0
  private readonly running = new Map<TestResult, Attempt>()
  // Kept per test: the last attempt wins, so a flaky test is not listed as failed.
  private readonly lastAttempt = new Map<TestCase, Failure>()

  printsToStdio() {
    return true
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.rootDir = config.rootDir
    const tests = suite.allTests()
    if (process.argv.includes('--list')) {
      for (const test of tests) this.print(this.describe(test))
      this.print(`Total: ${tests.length} tests`)
      return
    }
    this.print(`Running ${tests.length} tests using ${config.workers} workers`)
  }

  onTestBegin(test: TestCase, result: TestResult) {
    const attempt: Attempt = {
      number: ++this.attempts,
      steps: new Map(),
      open: new Set(),
      lines: [],
    }
    this.running.set(result, attempt)
    this.write(attempt, true, {
      time: result.startTime,
      id: attemptId(attempt.number),
      phase: 'START',
      kind: 'TEST',
      text: this.testText(test, result),
    })
  }

  onStepBegin(_test: TestCase, result: TestResult, step: TestStep) {
    const attempt = this.running.get(result)
    if (!attempt || !this.visible(step)) return
    attempt.steps.set(step, stepId(attempt.number, attempt.steps.size + 1))
    attempt.open.add(step)
    this.write(attempt, this.printSteps, this.stepRecord(attempt, step, 'START'))
  }

  onStepEnd(_test: TestCase, result: TestResult, step: TestStep) {
    const attempt = this.running.get(result)
    if (!attempt || !attempt.open.delete(step)) return
    const outcome = step.error ? 'FAIL' : 'PASS'
    const record = this.stepRecord(attempt, step, 'END', outcome, step.duration)
    this.write(attempt, this.printSteps, record)
    if (!step.error) return
    this.write(attempt, this.printSteps, {
      ...record,
      phase: 'ERROR',
      outcome: undefined,
      durationMs: undefined,
      text: `${record.text.match(/^ */)?.[0]}↳ ${errorSummary(step.error)}`,
    })
    // Children end before their parents: the first failed step is the innermost one.
    attempt.failedStep ??= this.failedStep(record, step)
  }

  onStdOut(chunk: string | Buffer, _test?: TestCase, result?: TestResult) {
    this.passThrough(process.stdout, chunk, result)
  }

  onStdErr(chunk: string | Buffer, _test?: TestCase, result?: TestResult) {
    this.passThrough(process.stderr, chunk, result)
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const attempt = this.running.get(result)
    if (!attempt) return
    this.running.delete(result)

    // A step without END (timeout, crash, killed worker) must not look like a PASS.
    // Innermost first, like a normal END order; the innermost one is where the test stopped.
    const now = Date.now()
    for (const step of [...attempt.open].reverse()) {
      const elapsed = now - step.startTime.getTime()
      const record = this.stepRecord(attempt, step, 'END', 'INCOMPLETE', elapsed)
      this.write(attempt, this.printSteps, record)
      attempt.failedStep ??= this.failedStep(record, step)
    }
    // Wall-clock time of the attempt, including hooks and fixture teardown, so the test END is
    // the last line of the attempt (Playwright's result.duration leaves some of that out).
    this.write(attempt, true, {
      time: new Date(now),
      id: attemptId(attempt.number),
      phase: 'END',
      outcome: OUTCOME[result.status],
      durationMs: now - result.startTime.getTime(),
      kind: 'TEST',
      text: this.testText(test, result),
    })

    // Attached to this attempt in the HTML report, next to its trace.
    result.attachments.push({
      name: 'step-log.txt',
      contentType: 'text/plain',
      body: Buffer.from(`${attempt.lines.join('\n')}\n`),
    })
    this.lastAttempt.set(test, { test, result, attempt })
  }

  onError(error: TestError) {
    this.print(`ERROR ${mask(error.message ?? error.value ?? '')}`)
  }

  onEnd(result: FullResult) {
    if (process.argv.includes('--list')) return
    const count = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }
    const failures: Failure[] = []
    for (const failure of this.lastAttempt.values()) {
      const outcome = failure.test.outcome()
      count[outcome]++
      if (outcome === 'unexpected') failures.push(failure)
    }
    if (failures.length) this.print(`\nFailures (${failures.length}):`)
    failures.forEach((failure, index) => this.print(this.failureReport(index + 1, failure)))
    this.print(
      `\nRun ${result.status.toUpperCase()} in ${Math.round(result.duration)} ms: ` +
        `${count.expected} passed, ${count.unexpected} failed, ${count.flaky} flaky, ${count.skipped} skipped`,
    )
  }

  private failureReport(index: number, { test, result, attempt }: Failure): string {
    const trace = result.attachments.find(attachment => attachment.name === 'trace')?.path
    const step = attempt.failedStep
    const message = result.errors
      .map(error => plain(error.message ?? error.value ?? ''))
      .join('\n\n')
    const lines = [
      `\n${index}) ${attemptId(attempt.number)} ${this.testText(test, result)}`,
      `   Status:      ${OUTCOME[result.status]}`,
      step ? `   Failed step: ${step.id} ${step.kind} ${step.text}` : undefined,
      step ? `   Step path:   ${step.path}` : undefined,
      `   Log:         grep ${attemptId(attempt.number)} in the terminal, or step-log.txt in the HTML report`,
      trace ? `   Trace:       pnpm exec playwright show-trace ${this.relative(trace)}` : undefined,
      '   Error:',
      ...message.split('\n').map(line => `     ${line}`),
    ]
    return lines.filter(line => line !== undefined).join('\n')
  }

  private stepRecord(
    attempt: Attempt,
    step: TestStep,
    phase: 'START' | 'END',
    outcome?: Outcome,
    durationMs?: number,
  ): LogRecord {
    const start = step.startTime.getTime()
    const where = step.location
      ? ` (${this.relative(step.location.file)}:${step.location.line})`
      : ''
    const target = step.subtitle ? ` ${step.subtitle}` : ''
    return {
      time: phase === 'START' ? step.startTime : new Date(start + (durationMs ?? 0)),
      id: attempt.steps.get(step) ?? '?',
      phase,
      outcome,
      durationMs,
      kind: KIND[step.category],
      text: `${'  '.repeat(this.depth(step))}${step.title}${target}${where}`,
    }
  }

  private failedStep(record: LogRecord, step: TestStep): FailedStep {
    return { id: record.id, kind: record.kind, text: record.text.trim(), path: this.stepPath(step) }
  }

  private visible(step: TestStep): boolean {
    if (!(step.category in KIND)) return false
    // Fixture setup/teardown (browser, context, page) is framework plumbing.
    for (let parent = step.parent; parent; parent = parent.parent)
      if (parent.category === 'fixture') return false
    return true
  }

  private depth(step: TestStep): number {
    let depth = 0
    for (let parent = step.parent; parent; parent = parent.parent) depth++
    return depth
  }

  private stepPath(step: TestStep): string {
    return step
      .titlePath()
      .filter(title => title !== '')
      .join(' › ')
  }

  private testText(test: TestCase, result: TestResult): string {
    return `${this.describe(test)} (worker ${result.workerIndex}, retry ${result.retry})`
  }

  private describe(test: TestCase): string {
    const project = test.parent.project()?.name
    const titles = test.titlePath().slice(3).join(' › ')
    return `${project ? `[${project}] ` : ''}${this.relative(test.location.file)}:${test.location.line} › ${titles}`
  }

  // Paths relative to the repository root, so they are clickable in the editor terminal.
  private relative(file: string): string {
    return path.relative(process.cwd(), path.resolve(this.rootDir, file))
  }

  private write(attempt: Attempt, toTerminal: boolean, record: LogRecord) {
    const line = formatRecord(record)
    attempt.lines.push(line)
    if (toTerminal) this.print(line)
  }

  // console.log from tests and the app: kept, tagged with the attempt it belongs to.
  private passThrough(stream: NodeJS.WriteStream, chunk: string | Buffer, result?: TestResult) {
    const attempt = result && this.running.get(result)
    const prefix = attempt ? `${attemptId(attempt.number)} ` : ''
    stream.write(mask(prefix + chunk.toString()))
  }

  private print(text: string) {
    process.stdout.write(`${mask(text)}\n`)
  }
}

// First line of the error plus Playwright's Expected/Received/cause lines, on one line.
function errorSummary(error: TestError): string {
  const [first, ...rest] = plain(error.message ?? error.value ?? '').split('\n')
  const details = rest
    .map(line => line.trim())
    .filter(line => /^(Expected|Received|Error):/.test(line))
  return [first, ...details].join(' | ')
}

// Playwright colors error messages; logs and attachments must be plain text.
function plain(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}
