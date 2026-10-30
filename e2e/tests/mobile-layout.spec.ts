import { expect, type Page, test } from '@playwright/test'

import { findTicketId, signInAs } from '../fixtures/api'
import { TICKETS } from '../fixtures/tickets'
import { STORAGE_STATE } from '../fixtures/users'

test.use({ storageState: STORAGE_STATE.agent, viewport: { width: 360, height: 800 } })

// The UI follows the account language; override it in the session response only, so the
// shared agent account is never changed.
async function showLanguage(page: Page, locale: 'pl' | 'en') {
  await page.route('**/api/auth/get-session', async route => {
    const response = await route.fetch()
    const body = await response.json()
    if (body?.user) body.user.locale = locale
    await route.fulfill({ response, json: body })
  })
}

const RAW_KEY = /^(tickets|thread|reply|status|priority|errors|common)\.[a-zA-Z]/

async function expectFitsAndTranslated(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  const texts = await page.locator('body *').evaluateAll(nodes =>
    nodes
      .filter(n => n.children.length === 0)
      .map(n => (n.textContent ?? '').trim())
      .filter(Boolean),
  )
  expect(texts.filter(text => RAW_KEY.test(text))).toEqual([])
}

for (const locale of ['pl', 'en'] as const) {
  test(`360 px: lista i ticket mieszczą się i nie pokazują kluczy tłumaczeń (${locale})`, async ({
    page,
  }) => {
    await showLanguage(page, locale)
    const { subject } = TICKETS.openUrgent
    const ctx = await signInAs('agent')
    const id = await findTicketId(ctx, subject)
    await ctx.dispose()

    await page.goto('/tickets?status=all')
    const row = page.getByRole('link', { name: subject })
    await expect(row).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expectFitsAndTranslated(page)

    await page.goto(`/tickets/${id}?status=all`)
    await expect(page.getByRole('region', { name: subject })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expectFitsAndTranslated(page)
  })
}
