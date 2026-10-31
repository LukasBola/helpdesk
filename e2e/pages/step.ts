import { fileURLToPath } from 'node:url'

import { type Location, test } from '@playwright/test'

// Turns a Page Object method into one named step in the terminal log, HTML report
// and trace (`LoginPage.login`). `box: true` points errors at the caller in the test.
// Pattern from https://playwright.dev/docs/api/class-test#test-step (Decorator).
// Arguments are not part of the title, so passwords never end up in it.
export function step<This extends object, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Promise<Return>,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
) {
  return function (this: This, ...args: Args): Promise<Return> {
    const title = `${this.constructor.name}.${String(context.name)}`
    const location = callerLocation()
    return test.step(title, () => target.call(this, ...args), { box: true, location })
  }
}

// Playwright leaves a boxed step called straight from a test without a location,
// so the log could not say which line of the test called it. Take it from the stack.
function callerLocation(): Location | undefined {
  const frames = new Error().stack?.split('\n').slice(1) ?? []
  const caller = frames.find(frame => !frame.includes(fileURLToPath(import.meta.url)))
  const match = caller?.match(/\(?((?:file:\/\/)?\/[^()]+):(\d+):(\d+)\)?$/)
  if (!match) return undefined
  const file = match[1].startsWith('file://') ? fileURLToPath(match[1]) : match[1]
  return { file, line: Number(match[2]), column: Number(match[3]) }
}
