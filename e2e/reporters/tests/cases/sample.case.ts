import { expect, test } from '@playwright/test'

test('passes with a named step', async () => {
  await test.step('Prepare data', async () => {
    expect(1 + 1, 'sum is two').toBe(2)
  })
})

test('soft failure keeps running', async () => {
  expect.soft(1, 'soft check').toBe(2)
  expect(true, 'after soft').toBe(true)
})

test('negation and auto-wait keep Playwright semantics', async ({ page }) => {
  await page.setContent('<p id="msg">loading</p>')
  await page.evaluate(() =>
    setTimeout(() => {
      const msg = document.getElementById('msg')
      if (msg) msg.textContent = 'ready'
    }, 300),
  )
  await expect(page.locator('#msg'), 'waits for ready').toHaveText('ready')
  await expect(page.locator('#msg'), 'negation').not.toHaveText('loading')
})

test('secrets are masked', async ({ page }) => {
  console.log('token=abc123 user e2e-admin@helpdesk.local')
  // One header split across two writes, and typed values: a test value stays visible,
  // a known e2e password does not.
  process.stdout.write('Authorization: Bearer split')
  process.stdout.write('Token987\n')
  // A line over the 64 KiB buffer limit, with a known password split right after it.
  process.stdout.write(`${'x'.repeat(70 * 1024)} e2e-pass`)
  process.stdout.write('word-123\n')
  await page.setContent('<input aria-label="E-mail"><input aria-label="Hasło">')
  await page.getByLabel('E-mail').fill('to-nie-jest-email')
  await page.getByLabel('Hasło').fill('e2e-password-123')
  expect('e2e-password-123', 'password check').toBe('wrong')
})

test('flaky passes on retry', async () => {
  expect(test.info().retry, 'second attempt').toBe(1)
})

test('skipped and multi-line steps', async () => {
  await test.step.skip('Not run', async () => {
    expect(true, 'never runs').toBe(false)
  })
  await test.step('First line\nsecond line', async () => {
    expect(1, 'one').toBe(1)
  })
})

test('failing as expected with test.fail()', async () => {
  test.fail()
  expect(1, 'fails on purpose').toBe(2)
})

test('marked test.fail() but passes', async () => {
  test.fail()
  expect(1, 'passes unexpectedly').toBe(1)
})

test('timeout is not a pass', async () => {
  await test.step('Never ends', () => new Promise(resolve => setTimeout(resolve, 60_000)))
})
