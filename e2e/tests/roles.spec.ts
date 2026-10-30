import { expect, test } from '@playwright/test'

import { STORAGE_STATE, USERS } from '../fixtures/users'
import { AppShell } from '../pages/AppShell'

test.describe('Administrator', () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test('widzi i otwiera zakładkę Użytkownicy', async ({ page }) => {
    await page.goto('/tickets')
    const shell = new AppShell(page)
    await shell.expectSignedInAs(USERS.admin.firstName)
    await shell.navigateTo('Użytkownicy')
    await expect(page).toHaveURL(/\/users$/)
  })
})

test.describe('Agent', () => {
  test.use({ storageState: STORAGE_STATE.agent })

  test('nie widzi zakładki Użytkownicy', async ({ page }) => {
    await page.goto('/tickets')
    const shell = new AppShell(page)
    await shell.expectSignedInAs(USERS.agent.firstName)
    await expect(shell.navLink('Tickety')).toBeVisible()
    await expect(shell.navLink('Użytkownicy')).toHaveCount(0)
  })

  test('wpisanie /users ręcznie przekierowuje na Tickety', async ({ page }) => {
    await page.goto('/users')
    await expect(page).toHaveURL(/\/tickets$/)
    await expect(new AppShell(page).heading('Tickety')).toBeVisible()
  })
})
