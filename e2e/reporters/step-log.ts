import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'

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

import {
  attemptId,
  formatRecord,
  type Kind,
  type LogRecord,
  type Outcome,
  paint,
  stepId,
  useColor,
} from './format'
import { mask } from './mask'

// Live START/END log of tests and steps, built on Playwright's Reporter API (an observer
// of test events): tests stay plain Playwright code, every step is reported here.
// https://playwright.dev/docs/api/class-reporter
//
// Each attempt also gets its log as the `step-log.log` attachment, shown in the HTML
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
// A console.log longer than this without a newline is printed in parts.
const MAX_PENDING = 64 * 1024

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
  private total = 0
  // stdout/stderr come in chunks split at arbitrary points: lines are masked only when complete,
  // so a secret split across two chunks is still caught. Keyed by stream and attempt.
  private readonly pending = new Map<string, { decoder: StringDecoder; text: string }>()

  printsToStdio() {
    return true
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.rootDir = config.rootDir
    const tests = suite.allTests()
    this.total = tests.length
    if (process.argv.includes('--list')) {
      for (const test of tests) this.print(mask(this.describe(test)))
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
      ...this.testText(test, result),
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
    const skipped = step.annotations.some(a => a.type === 'skip')
    const outcome = step.error ? 'FAIL' : skipped ? 'SKIPPED' : 'PASS'
    const record = this.stepRecord(attempt, step, 'END', outcome, step.duration)
    this.write(attempt, this.printSteps, record)
    if (!step.error) return
    this.write(attempt, this.printSteps, {
      ...record,
      phase: 'ERROR',
      outcome: undefined,
      durationMs: undefined,
      text: errorSummary(step.error),
      location: undefined,
    })
    // Children end before their parents: the first failed step is the innermost one of its
    // branch. A later failure (e.g. after a soft assertion) does not replace it.
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
    this.flush(attempt)

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
      ...this.testText(test, result),
    })

    // Attached to this attempt in the HTML report, next to its trace.
    result.attachments.push({
      name: 'step-log.log',
      contentType: 'text/plain',
      body: Buffer.from(`${attempt.lines.join('\n')}\n`),
    })
    this.lastAttempt.set(test, { test, result, attempt })
  }

  onError(error: TestError) {
    this.print(paint('red', `ERROR ${mask(plain(error.message ?? error.value ?? ''))}`))
  }

  onEnd(result: FullResult) {
    if (process.argv.includes('--list')) return
    this.flush()
    const count = { passed: 0, failed: 0, flaky: 0, skipped: 0, expectedToFail: 0 }
    const failures: Failure[] = []
    for (const failure of this.lastAttempt.values()) {
      const outcome = failure.test.outcome()
      if (outcome === 'unexpected') failures.push(failure)
      if (outcome === 'unexpected') count.failed++
      else if (outcome === 'flaky') count.flaky++
      else if (outcome === 'skipped') count.skipped++
      // test.fail(): the test failed, as it was expected to.
      else if (failure.test.expectedStatus !== 'passed') count.expectedToFail++
      else count.passed++
    }
    // Tests that never started, e.g. after --max-failures stopped the run.
    const notRun = this.total - this.lastAttempt.size
    if (failures.length)
      this.print(`\n${paint('red', paint('bold', `Failures (${failures.length}):`))}`)
    failures.forEach((failure, index) => this.print(this.failureReport(index + 1, failure)))
    const passed = result.status === 'passed'
    const summary =
      `${passed ? '✓' : '✗'} Run ${result.status.toUpperCase()} in ${Math.round(result.duration)} ms: ` +
      `${count.passed} passed, ${count.failed} failed, ${count.flaky} flaky, ${count.skipped} skipped, ` +
      `${count.expectedToFail} expected to fail, ${notRun} not run`
    this.print(`\n${paint(passed ? 'green' : 'red', paint('bold', summary))}`)
  }

  private failureReport(index: number, { test, result, attempt }: Failure): string {
    const trace = result.attachments.find(attachment => attachment.name === 'trace')?.path
    const step = attempt.failedStep
    const message = mask(
      result.errors.map(error => plain(error.message ?? error.value ?? '')).join('\n\n'),
    )
    const lines = [
      `\n${paint('bold', `${index}) ${attemptId(attempt.number)} ${mask(this.testLabel(test, result))}`)}`,
      `   Status:      ${OUTCOME[result.status]}`,
      step
        ? `   Failed step: ${paint('red', mask(`${step.id} ${step.kind} ${step.text}`))}`
        : undefined,
      step ? `   Step path:   ${mask(step.path)}` : undefined,
      `   Log:         grep ${attemptId(attempt.number)} in the terminal, or step-log.log in the HTML report`,
      trace ? `   Trace:       pnpm exec playwright show-trace ${this.relative(trace)}` : undefined,
      '   Error:',
      ...message.split('\n').map(line => `     ${paint('red', line)}`),
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
    const target = step.subtitle ? ` [${step.subtitle}]` : ''
    return {
      time: phase === 'START' ? step.startTime : new Date(start + (durationMs ?? 0)),
      id: attempt.steps.get(step) ?? '?',
      phase,
      outcome,
      durationMs,
      kind: KIND[step.category],
      depth: this.depth(step) + 1, // one level under its test
      text: `${step.title}${target}`,
      location: step.location
        ? `${this.relative(step.location.file)}:${step.location.line}`
        : undefined,
    }
  }

  private failedStep(record: LogRecord, step: TestStep): FailedStep {
    const where = record.location ? ` @ ${record.location}` : ''
    return {
      id: record.id,
      kind: record.kind,
      text: `${record.text}${where}`,
      path: this.stepPath(step),
    }
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

  // Title with project, worker and retry as the text; the test's file:line as the location.
  private testText(test: TestCase, result: TestResult): Pick<LogRecord, 'text' | 'location'> {
    return {
      text: `${this.title(test)} (worker ${result.workerIndex}, retry ${result.retry})`,
      location: this.where(test),
    }
  }

  private testLabel(test: TestCase, result: TestResult): string {
    const { text, location } = this.testText(test, result)
    return `${text} @ ${location}`
  }

  private describe(test: TestCase): string {
    return `${this.title(test)} @ ${this.where(test)}`
  }

  private title(test: TestCase): string {
    const project = test.parent.project()?.name
    return `${project ? `[${project}] ` : ''}${test.titlePath().slice(3).join(' › ')}`
  }

  private where(test: TestCase): string {
    return `${this.relative(test.location.file)}:${test.location.line}`
  }

  // Paths relative to the repository root, so they are clickable in the editor terminal.
  private relative(file: string): string {
    return path.relative(process.cwd(), path.resolve(this.rootDir, file))
  }

  private write(attempt: Attempt, toTerminal: boolean, record: LogRecord) {
    const line = formatRecord(record)
    attempt.lines.push(line.plain) // the attachment is always plain text
    if (toTerminal) this.print(useColor ? line.colored : line.plain)
  }

  // console.log from tests and the app: kept, every line tagged with the attempt it belongs to.
  private passThrough(stream: NodeJS.WriteStream, chunk: string | Buffer, result?: TestResult) {
    const attempt = result && this.running.get(result)
    const key = `${stream === process.stderr ? 'err' : 'out'} ${attempt?.number ?? ''}`
    const buffer = this.pending.get(key) ?? { decoder: new StringDecoder('utf8'), text: '' }
    this.pending.set(key, buffer)
    // The decoder keeps a UTF-8 character split between two Buffer chunks.
    buffer.text += typeof chunk === 'string' ? chunk : buffer.decoder.write(chunk)
    const end =
      buffer.text.length > MAX_PENDING ? buffer.text.length : buffer.text.lastIndexOf('\n') + 1
    if (!end) return
    this.emit(stream, attempt, buffer.text.slice(0, end))
    buffer.text = buffer.text.slice(end)
  }

  // Prints what is left of an attempt's output (or of all output) without a final newline.
  private flush(attempt?: Attempt) {
    for (const [key, buffer] of this.pending) {
      if (attempt && key.split(' ')[1] !== String(attempt.number)) continue
      const text = buffer.text + buffer.decoder.end()
      const stream = key.startsWith('err') ? process.stderr : process.stdout
      if (text) this.emit(stream, attempt, `${text}\n`)
      this.pending.delete(key)
    }
  }

  private emit(stream: NodeJS.WriteStream, attempt: Attempt | undefined, text: string) {
    const prefix = attempt ? `${attemptId(attempt.number)} ` : ''
    const masked = mask(text.replace(/^(?=.)/gm, prefix))
    stream.write(useColor ? masked : plain(masked))
  }

  // Callers pass text that is already masked: masking after painting could cut an ANSI code.
  private print(text: string) {
    process.stdout.write(`${useColor ? text : plain(text)}\n`)
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
