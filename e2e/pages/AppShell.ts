import { expect, type Locator, type Page } from '@playwright/test'

import { step } from './step'

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
    return this.page.getByRole('link', { name: label, exact: true })
  }

  @step
  async expectSignedInAs(firstName: string) {
    await expect(this.greeting, 'Powitanie „Dzień dobry,” jest widoczne').toBeVisible()
    await expect(
      this.page.getByText(`${firstName} 👋`),
      `Powitanie zawiera imię „${firstName}”`,
    ).toBeVisible()
  }

  @step
  async navigateTo(label: NavLabel) {
    await this.navLink(label).click()
    await expect(this.heading(label), `Nagłówek strony „${label}” jest widoczny`).toBeVisible()
  }

  @step
  async openDrawer() {
    await this.openMenuButton.click()
    await expect(this.drawer, 'Menu mobilne (drawer) jest otwarte').toBeVisible()
  }

  @step
  async openUserMenu(): Promise<Locator> {
    await this.userMenuButton.click()
    const menu = this.page.getByRole('menu')
    await expect(menu, 'Menu użytkownika jest otwarte').toBeVisible()
    return menu
  }

  @step
  async logout() {
    await this.openUserMenu()
    await this.page.getByRole('menuitem', { name: 'Wyloguj' }).click()
  }
}
