import { devices, expect, test } from '@playwright/test'

import { AppShell } from '../pages/AppShell'

test.describe('Nawigacja (desktop)', () => {
  test('sidebar prowadzi do wszystkich sekcji i podświetla aktywną', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/tickets$/)
    const shell = new AppShell(page)

    for (const label of ['Moje', 'Baza wiedzy', 'Użytkownicy', 'Tickety'] as const) {
      await shell.navigateTo(label)
      await expect(shell.navLink(label)).toHaveAttribute('aria-current', 'page')
    }
  })

  test('odświeżenie strony zachowuje sesję', async ({ page }) => {
    await page.goto('/knowledge-base')
    const shell = new AppShell(page)
    await expect(shell.heading('Baza wiedzy')).toBeVisible()
    await page.reload()
    await expect(shell.heading('Baza wiedzy')).toBeVisible()
  })

  test('nieznany adres pokazuje stronę 404 z powrotem do ticketów', async ({ page }) => {
    await page.goto('/to-nie-istnieje')
    await expect(page.getByRole('heading', { name: 'Nie znaleziono strony' })).toBeVisible()
    await page.getByRole('link', { name: 'Wróć do ticketów' }).click()
    await expect(new AppShell(page).heading('Tickety')).toBeVisible()
  })
})

test.describe('Nawigacja (mobile)', () => {
  // Still Chromium — only the viewport and touch emulation change.
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['Pixel 7']
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent })

  test('menu otwiera się z hamburgera i zamyka po wyborze sekcji', async ({ page }) => {
    await page.goto('/tickets')
    const shell = new AppShell(page)
    await expect(shell.openMenuButton).toBeVisible()

    await shell.openDrawer()
    await shell.drawer.getByRole('link', { name: 'Baza wiedzy' }).click()
    await expect(shell.drawer).toBeHidden()
    await expect(shell.heading('Baza wiedzy')).toBeVisible()
  })

  test('układ mieści się na ekranie bez poziomego przewijania', async ({ page }) => {
    await page.goto('/tickets')
    await expect(new AppShell(page).heading('Tickety')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)
  })
})
