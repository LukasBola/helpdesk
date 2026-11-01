import { expect, type Locator, type Page } from '@playwright/test'

import { step } from './step'

export class LoginPage {
  readonly email: Locator
  readonly password: Locator
  readonly submit: Locator
  readonly error: Locator

  constructor(private readonly page: Page) {
    this.email = page.getByLabel('E-mail')
    this.password = page.getByLabel('Hasło')
    this.submit = page.getByRole('button', { name: 'Zaloguj się' })
    this.error = page.getByRole('alert')
  }

  @step
  async goto() {
    await this.page.goto('/login')
    await this.expectVisible()
  }

  @step
  async expectVisible() {
    await expect(this.page, 'Adres strony to /login').toHaveURL(/\/login$/)
    await expect(this.submit, 'Przycisk „Zaloguj się” jest widoczny').toBeVisible()
  }

  @step
  async fill(email: string, password: string) {
    await this.email.fill(email)
    await this.password.fill(password)
  }

  @step
  async login(email: string, password: string) {
    await this.fill(email, password)
    await this.submit.click()
  }

  @step
  async expectError(message: string) {
    await expect(this.error, 'Komunikat błędu logowania ma oczekiwaną treść').toHaveText(message)
  }
}
