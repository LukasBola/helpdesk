import { expect, test } from '@playwright/test'

import { db } from '../fixtures/db'
import { STORAGE_STATE, USERS } from '../fixtures/users'
import { AppShell } from '../pages/AppShell'
import { LoginPage } from '../pages/LoginPage'

test.describe('Sesja: zalogowany użytkownik', () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test('U5 wejście na /login przekierowuje na Tickety', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/tickets$/)
    await expect(new AppShell(page).heading('Tickety')).toBeVisible()
  })

  test('U10 menu avatara pokazuje imię, nazwisko i rolę', async ({ page }) => {
    await page.goto('/tickets')
    const menu = await new AppShell(page).openUserMenu()
    await expect(menu).toContainText(USERS.admin.name)
    await expect(menu).toContainText('administrator')
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  })

  test('U13 strona ma język polski i tytuł', async ({ page }) => {
    await page.goto('/tickets')
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    await expect(page).toHaveTitle('Helpdesk')
  })

  test('U15 SPA pobiera sesję przez proxy /api/auth/get-session', async ({ page }) => {
    const sessionResponse = page.waitForResponse(r => r.url().endsWith('/api/auth/get-session'))
    await page.goto('/tickets')
    const res = await sessionResponse
    expect(new URL(res.url()).origin).toBe(new URL(page.url()).origin)
    expect((await res.json()).user.email).toBe(USERS.admin.email)
  })
})

test.describe('Sesja: agent', () => {
  test.use({ storageState: STORAGE_STATE.agent })

  test('U10 menu avatara agenta pokazuje rolę agent', async ({ page }) => {
    await page.goto('/tickets')
    const menu = await new AppShell(page).openUserMenu()
    await expect(menu).toContainText(USERS.agent.name)
    await expect(menu).toContainText('agent')
    await expect(menu).not.toContainText('administrator')
  })
})

test.describe('Sesja: logowanie i wylogowanie', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('U6 przekierowanie zachowuje parametry adresu', async ({ page }) => {
    await page.goto('/tickets?status=OPEN&page=2')
    const loginPage = new LoginPage(page)
    await loginPage.expectVisible()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    await expect(page).toHaveURL(/\/tickets\?status=OPEN&page=2$/)
  })

  test('U7 po wylogowaniu przycisk Wstecz nie pokazuje aplikacji', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    const shell = new AppShell(page)
    await shell.navigateTo('Baza wiedzy')
    await shell.logout()
    await loginPage.expectVisible()

    await page.goBack()
    await expect(loginPage.submit).toBeVisible()
    await expect(shell.greeting).toBeHidden()
  })

  test('U8 sesja jest wspólna dla kart; wylogowanie w jednej wylogowuje drugą', async ({
    context,
  }) => {
    const first = await context.newPage()
    const loginPage = new LoginPage(first)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    await new AppShell(first).expectSignedInAs(USERS.agent.firstName)

    const second = await context.newPage()
    await second.goto('/knowledge-base')
    await expect(new AppShell(second).heading('Baza wiedzy')).toBeVisible()

    await new AppShell(first).logout()
    await loginPage.expectVisible()

    // The other tab learns about the logout without a reload (Better Auth broadcasts it).
    await second.bringToFront()
    await expect(new LoginPage(second).submit).toBeVisible({ timeout: 10_000 })
  })

  test('U14 usunięte ciasteczka + odświeżenie: logowanie i powrót na tę samą stronę', async ({
    page,
    context,
  }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    const shell = new AppShell(page)
    await shell.navigateTo('Moje')

    await context.clearCookies()
    await page.reload()
    await loginPage.expectVisible()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    await expect(page).toHaveURL(/\/tickets\/mine$/)
  })

  test('U12 404 dla niezalogowanego prowadzi do logowania', async ({ page }) => {
    await page.goto('/nie-ma-takiej-strony')
    await expect(page.getByRole('heading', { name: 'Nie znaleziono strony' })).toBeVisible()
    await page.getByRole('link', { name: 'Wróć do ticketów' }).click()
    await new LoginPage(page).expectVisible()
  })
})

test.describe('Sesja: blokada konta w trakcie pracy', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test.beforeEach(() => db.unblock(USERS.blocked.email))
  test.afterEach(() => db.unblock(USERS.blocked.email))

  test('U9 zablokowany użytkownik widzi logowanie bez pętli i nie może się zalogować', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.blocked.email, USERS.blocked.password)
    const shell = new AppShell(page)
    await shell.expectSignedInAs(USERS.blocked.firstName)

    db.block(USERS.blocked.email)
    // Record every URL from the reload on, so a /login ↔ /tickets loop can't go unseen.
    const urls: string[] = []
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) urls.push(new URL(frame.url()).pathname)
    })
    await page.reload()

    await loginPage.expectVisible()
    await page.waitForLoadState('networkidle')
    // A loop would bounce back to /tickets after reaching /login. (React StrictMode in dev may
    // report the /login redirect twice; that is not a loop.)
    const afterLogin = urls.slice(urls.indexOf('/login'))
    expect(afterLogin.length).toBeGreaterThan(0)
    expect(afterLogin.every(url => url === '/login')).toBe(true)

    await loginPage.login(USERS.blocked.email, USERS.blocked.password)
    await loginPage.expectError('Nieprawidłowy e-mail lub hasło')
  })
})
