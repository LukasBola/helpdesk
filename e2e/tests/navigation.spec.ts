import { devices, expect, test } from '@playwright/test'

import { STORAGE_STATE } from '../fixtures/users'
import { AppShell } from '../pages/AppShell'

test.describe('Nawigacja (desktop)', () => {
  test('sidebar prowadzi do wszystkich sekcji i podświetla aktywną', async ({ page }) => {
    await page.goto('/')
    await expect(page, 'Startowy adres to /tickets').toHaveURL(/\/tickets$/)
    const shell = new AppShell(page)

    for (const label of ['Moje', 'Baza wiedzy', 'Użytkownicy', 'Tickety'] as const) {
      await shell.navigateTo(label)
      await expect(
        shell.navLink(label),
        `Link „${label}” w sidebarze jest oznaczony jako aktywny (aria-current=page)`,
      ).toHaveAttribute('aria-current', 'page')
    }
  })

  test('odświeżenie strony zachowuje sesję', async ({ page }) => {
    await page.goto('/knowledge-base')
    const shell = new AppShell(page)
    await expect(
      shell.heading('Baza wiedzy'),
      'Przed odświeżeniem widoczny jest nagłówek „Baza wiedzy”',
    ).toBeVisible()
    await page.reload()
    await expect(
      shell.heading('Baza wiedzy'),
      'Po odświeżeniu nadal widoczny jest nagłówek „Baza wiedzy” (sesja zachowana)',
    ).toBeVisible()
  })

  test('nieznany adres pokazuje stronę 404 z powrotem do ticketów', async ({ page }) => {
    await page.goto('/to-nie-istnieje')
    await expect(
      page.getByRole('heading', { name: 'Nie znaleziono strony' }),
      'Widoczny jest nagłówek 404 „Nie znaleziono strony”',
    ).toBeVisible()
    await page.getByRole('link', { name: 'Wróć do ticketów' }).click()
    await expect(
      new AppShell(page).heading('Tickety'),
      'Po kliknięciu „Wróć do ticketów” widoczny jest nagłówek „Tickety”',
    ).toBeVisible()
  })
})

test.describe('Nawigacja (agent)', () => {
  test.use({ storageState: STORAGE_STATE.agent })

  test('U11 menu mobilne agenta nie zawiera Użytkownicy', async ({ page }) => {
    await page.setViewportSize(devices['Pixel 7'].viewport)
    await page.goto('/tickets')
    const shell = new AppShell(page)
    await shell.openDrawer()
    await expect(
      shell.drawer.getByRole('link', { name: 'Tickety' }),
      'Menu mobilne agenta zawiera link „Tickety”',
    ).toBeVisible()
    await expect(
      shell.drawer.getByRole('link', { name: 'Użytkownicy' }),
      'Menu mobilne agenta nie zawiera linku „Użytkownicy”',
    ).toHaveCount(0)
  })

  test('link Tickety nie jest aktywny na stronie Moje', async ({ page }) => {
    await page.goto('/tickets/mine')
    const shell = new AppShell(page)
    await expect(shell.navLink('Moje'), 'Link „Moje” jest aktywny na stronie Moje').toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(
      shell.navLink('Tickety'),
      'Link „Tickety” nie jest aktywny na stronie Moje',
    ).not.toHaveAttribute('aria-current', 'page')
  })
})

test.describe('Nawigacja (mobile)', () => {
  // Still Chromium — only the viewport and touch emulation change.
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['Pixel 7']
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent })

  test('menu otwiera się z hamburgera i zamyka po wyborze sekcji', async ({ page }) => {
    await page.goto('/tickets')
    const shell = new AppShell(page)
    await expect(shell.openMenuButton, 'Przycisk hamburgera jest widoczny').toBeVisible()

    await shell.openDrawer()
    await shell.drawer.getByRole('link', { name: 'Baza wiedzy' }).click()
    await expect(shell.drawer, 'Menu mobilne zamknęło się po wyborze linku').toBeHidden()
    await expect(
      shell.heading('Baza wiedzy'),
      'Widoczny jest nagłówek wybranej strony „Baza wiedzy”',
    ).toBeVisible()
  })

  test('U11 menu zamyka się klawiszem Escape i przyciskiem Zamknij', async ({ page }) => {
    await page.goto('/tickets')
    const shell = new AppShell(page)

    await shell.openDrawer()
    await page.keyboard.press('Escape')
    await expect(shell.drawer, 'Menu mobilne zamknęło się po naciśnięciu Escape').toBeHidden()

    await shell.openDrawer()
    await shell.drawer.getByRole('button', { name: 'Zamknij' }).click()
    await expect(shell.drawer, 'Menu mobilne zamknęło się po kliknięciu „Zamknij”').toBeHidden()
  })

  test('U11 sidebar desktopowy jest ukryty, a hamburger widoczny', async ({ page }) => {
    await page.goto('/tickets')
    const shell = new AppShell(page)
    await expect(
      shell.openMenuButton,
      'Na telefonie widoczny jest przycisk hamburgera',
    ).toBeVisible()
    await expect(
      shell.navLink('Tickety'),
      'Na telefonie sidebar desktopowy (link „Tickety”) jest ukryty',
    ).toBeHidden()
  })

  test('U11 cele dotykowe w menu mają co najmniej 44 px wysokości', async ({ page }) => {
    await page.goto('/tickets')
    const shell = new AppShell(page)
    for (const target of [shell.openMenuButton, shell.userMenuButton]) {
      expect(
        (await target.boundingBox())?.height,
        'Wysokość przycisku w nagłówku (px) jest co najmniej 44',
      ).toBeGreaterThanOrEqual(44)
    }
    await shell.openDrawer()
    for (const link of await shell.drawer.getByRole('link').all()) {
      expect(
        (await link.boundingBox())?.height,
        'Wysokość linku w menu mobilnym (px) jest co najmniej 44',
      ).toBeGreaterThanOrEqual(44)
    }
    const close = shell.drawer.getByRole('button', { name: 'Zamknij' })
    expect(
      (await close.boundingBox())?.height,
      'Wysokość przycisku „Zamknij” w menu mobilnym (px) jest co najmniej 44',
    ).toBeGreaterThanOrEqual(44)
  })

  test('formularz logowania mieści się na telefonie', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: devices['Pixel 7'].viewport,
      storageState: { cookies: [], origins: [] },
    })
    const page = await ctx.newPage()
    await page.goto('/login')
    const card = await page.getByRole('button', { name: 'Zaloguj się' }).boundingBox()
    expect(
      card?.width,
      'Szerokość przycisku „Zaloguj się” (px) mieści się w ekranie Pixel 7',
    ).toBeLessThanOrEqual(devices['Pixel 7'].viewport.width)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'Poziome przewijanie strony logowania (px) na telefonie').toBe(0)
    await ctx.close()
  })

  test('układ mieści się na ekranie bez poziomego przewijania', async ({ page }) => {
    await page.goto('/tickets')
    await expect(
      new AppShell(page).heading('Tickety'),
      'Widoczny jest nagłówek „Tickety”',
    ).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'Poziome przewijanie strony Tickety (px)').toBe(0)
  })
})
