import { expect, type Locator, type Page } from '@playwright/test'

export type NavLabel = 'Tickety' | 'Moje' | 'Baza wiedzy' | 'Użytkownicy'

// The layout around every signed-in page: sidebar (desktop), drawer (mobile), header.
export class AppShell {
  readonly greeting: Locator
  readonly userMenuButton: Locator
  readonly openMenuButton: Locator
  readonly drawer: Locator

  constructor(private readonly page: Page) {
    this.greeting = page.getByText('Dzień dobry,')
    this.userMenuButton = page.getByRole('button', { name: 'Menu użytkownika' })
    this.openMenuButton = page.getByRole('button', { name: 'Otwórz menu' })
    this.drawer = page.getByRole('dialog')
  }

  heading(name: string): Locator {
    return this.page.getByRole('heading', { name, level: 1 })
  }

  navLink(label: NavLabel): Locator {
    return this.page.getByRole('link', { name: label })
  }

  async expectSignedInAs(firstName: string) {
    await expect(this.greeting).toBeVisible()
    await expect(this.page.getByText(`${firstName} 👋`)).toBeVisible()
  }

  async navigateTo(label: NavLabel) {
    await this.navLink(label).click()
    await expect(this.heading(label)).toBeVisible()
  }

  async openDrawer() {
    await this.openMenuButton.click()
    await expect(this.drawer).toBeVisible()
  }

  async logout() {
    await this.userMenuButton.click()
    await this.page.getByRole('menuitem', { name: 'Wyloguj' }).click()
  }
}
