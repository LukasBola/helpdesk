import { expect, test } from '@playwright/test'

import { USERS } from '../fixtures/users'
import { AppShell } from '../pages/AppShell'
import { LoginPage } from '../pages/LoginPage'

// These tests sign in and out themselves; a logout here must not revoke the shared session.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Logowanie', () => {
  test('niezalogowany użytkownik trafia na stronę logowania', async ({ page }) => {
    await page.goto('/tickets')
    await new LoginPage(page).expectVisible()
  })

  test('złe hasło pokazuje ogólny komunikat błędu', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, 'wrong-password')
    await loginPage.expectError('Nieprawidłowy e-mail lub hasło')
  })

  test('nieistniejące konto pokazuje ten sam komunikat', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login('nobody@helpdesk.local', 'wrong-password')
    await loginPage.expectError('Nieprawidłowy e-mail lub hasło')
  })

  test('po zalogowaniu wraca na stronę, na którą chciał wejść', async ({ page }) => {
    await page.goto('/knowledge-base')
    const loginPage = new LoginPage(page)
    await loginPage.expectVisible()
    await loginPage.login(USERS.agent.email, USERS.agent.password)

    const shell = new AppShell(page)
    await expect(page).toHaveURL(/\/knowledge-base$/)
    await expect(shell.heading('Baza wiedzy')).toBeVisible()
    await shell.expectSignedInAs(USERS.agent.firstName)
  })

  test('wylogowanie kończy sesję', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    const shell = new AppShell(page)
    await shell.expectSignedInAs(USERS.agent.firstName)

    await shell.logout()
    await loginPage.expectVisible()

    // The session is gone server-side, so protected pages redirect again.
    await page.goto('/tickets')
    await loginPage.expectVisible()
  })
})
