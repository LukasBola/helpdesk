import { test as setup } from '@playwright/test'

import { type Role, STORAGE_STATE, USERS } from '../fixtures/users'
import { AppShell } from '../pages/AppShell'
import { LoginPage } from '../pages/LoginPage'

for (const role of ['admin', 'agent'] as Role[]) {
  setup(`log in as ${role}`, async ({ page }) => {
    const { email, password, firstName } = USERS[role]
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(email, password)
    await new AppShell(page).expectSignedInAs(firstName)
    await page.context().storageState({ path: STORAGE_STATE[role] })
  })
}
