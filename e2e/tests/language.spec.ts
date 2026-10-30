import { expect, test } from '@playwright/test'

import { USERS } from '../fixtures/users'
import { AppShell } from '../pages/AppShell'
import { LoginPage } from '../pages/LoginPage'

test.use({ storageState: { cookies: [], origins: [] } })

test('język wybrany na koncie wraca po wylogowaniu i na nowym urządzeniu', async ({
  page,
  browser,
}) => {
  const { email, password } = USERS.locale
  const login = new LoginPage(page)
  await login.goto()
  await login.login(email, password)
  const shell = new AppShell(page)
  await expect(shell.greeting).toBeVisible()

  const menu = await shell.openUserMenu()
  await menu.getByRole('group', { name: 'Język' }).getByRole('button', { name: 'EN' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Good morning,')).toBeVisible()

  await page.getByRole('button', { name: 'User menu' }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page.getByText('Sign in to the agent panel')).toBeVisible()

  // A new device: empty storage, so only the account can supply the language.
  const fresh = await browser.newContext({ locale: 'pl-PL' })
  try {
    const freshPage = await fresh.newPage()
    await new LoginPage(freshPage).goto()
    await expect(freshPage.getByText('Zaloguj się do panelu agenta')).toBeVisible()
    await new LoginPage(freshPage).login(email, password)
    await expect(freshPage.getByText('Good morning,')).toBeVisible()
  } finally {
    await fresh.close()
  }
})
