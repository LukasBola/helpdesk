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

test('secrets are masked', async () => {
  console.log('token=abc123 user e2e-admin@helpdesk.local')
  expect('e2e-password-123', 'password check').toBe('wrong')
})

test('flaky passes on retry', async () => {
  expect(test.info().retry, 'second attempt').toBe(1)
})

test('timeout is not a pass', async () => {
  await test.step('Never ends', () => new Promise(resolve => setTimeout(resolve, 60_000)))
})
