import { expect, type Page, test } from '@playwright/test'

import { USERS } from '../fixtures/users'
import { AppShell } from '../pages/AppShell'
import { LoginPage } from '../pages/LoginPage'

test.use({ storageState: { cookies: [], origins: [] } })

const SIGN_IN = '**/api/auth/sign-in/email'

// Returns a check that waits briefly (a request could be sent asynchronously) and then
// asserts that no sign-in request went out.
function expectNoSignInRequest(page: Page): () => Promise<void> {
  let count = 0
  page.on('request', req => {
    if (req.url().includes('/api/auth/sign-in/email')) count++
  })
  return async () => {
    await page.waitForLoadState('networkidle')
    expect(count).toBe(0)
  }
}

test.describe('Formularz logowania: walidacja', () => {
  test('U1 pusty formularz nie wysyła żądania', async ({ page }) => {
    const noRequest = expectNoSignInRequest(page)
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.submit.click()
    expect(await loginPage.email.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(
      true,
    )
    await noRequest()
  })

  test('U1 niepoprawny format e-maila nie wysyła żądania', async ({ page }) => {
    const noRequest = expectNoSignInRequest(page)
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login('to-nie-jest-email', 'password-123')
    expect(await loginPage.email.evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(
      true,
    )
    await noRequest()
  })

  test('U1 brak hasła nie wysyła żądania', async ({ page }) => {
    const noRequest = expectNoSignInRequest(page)
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, '')
    expect(
      await loginPage.password.evaluate((el: HTMLInputElement) => el.validity.valueMissing),
    ).toBe(true)
    await noRequest()
  })

  test('U2 Enter w polu hasła wysyła formularz', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.fill(USERS.agent.email, USERS.agent.password)
    await loginPage.password.press('Enter')
    await new AppShell(page).expectSignedInAs(USERS.agent.firstName)
  })

  test('U2 pola mają poprawne typy i autouzupełnianie', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await expect(loginPage.email).toHaveAttribute('type', 'email')
    await expect(loginPage.email).toHaveAttribute('autocomplete', 'email')
    await expect(loginPage.password).toHaveAttribute('type', 'password')
    await expect(loginPage.password).toHaveAttribute('autocomplete', 'current-password')
  })
})

test.describe('Formularz logowania: odpowiedzi serwera', () => {
  test('U3 przycisk jest zablokowany, dopóki logowanie trwa', async ({ page }) => {
    let release: () => void = () => undefined
    const held = new Promise<void>(resolve => (release = resolve))
    await page.route(SIGN_IN, async route => {
      await held
      await route.continue()
    })
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    await expect(loginPage.submit).toBeDisabled()
    release()
    await new AppShell(page).expectSignedInAs(USERS.agent.firstName)
  })

  test('U4 odpowiedź 429 pokazuje komunikat o zbyt wielu próbach', async ({ page }) => {
    await page.route(SIGN_IN, route =>
      route.fulfill({ status: 429, json: { message: 'Too many requests' } }),
    )
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    await loginPage.expectError('Za dużo prób. Spróbuj za chwilę.')
    await expect(loginPage.submit).toBeEnabled()
  })

  test('U4 błąd serwera 500 pokazuje ogólny komunikat', async ({ page }) => {
    await page.route(SIGN_IN, route => route.fulfill({ status: 500, json: { message: 'boom' } }))
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    await loginPage.expectError('Coś poszło nie tak. Spróbuj ponownie.')
  })

  test('U4 brak połączenia pokazuje ogólny komunikat', async ({ page }) => {
    await page.route(SIGN_IN, route => route.abort('internetdisconnected'))
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    await loginPage.expectError('Coś poszło nie tak. Spróbuj ponownie.')
  })

  test('U4 komunikat błędu znika po poprawnym logowaniu', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, 'wrong-password-1')
    await loginPage.expectError('Nieprawidłowy e-mail lub hasło')

    // A second failure with a different cause replaces the message; a new attempt clears it.
    await page.route(SIGN_IN, route => route.fulfill({ status: 429, json: {} }), { times: 1 })
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    await loginPage.expectError('Za dużo prób. Spróbuj za chwilę.')

    await loginPage.login(USERS.agent.email, USERS.agent.password)
    await expect(loginPage.error).toBeHidden()
    await new AppShell(page).expectSignedInAs(USERS.agent.firstName)
  })

  test('U3 podczas logowania widać wskaźnik ładowania', async ({ page }) => {
    let release: () => void = () => undefined
    const held = new Promise<void>(resolve => (release = resolve))
    await page.route(SIGN_IN, async route => {
      await held
      await route.continue()
    })
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(USERS.agent.email, USERS.agent.password)
    await expect(loginPage.submit.locator('svg.animate-spin')).toBeVisible()
    release()
    await new AppShell(page).expectSignedInAs(USERS.agent.firstName)
  })
})
