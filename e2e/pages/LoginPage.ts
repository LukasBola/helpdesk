import { expect, type Locator, type Page } from '@playwright/test'

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

  async goto() {
    await this.page.goto('/login')
    await this.expectVisible()
  }

  async expectVisible() {
    await expect(this.page).toHaveURL(/\/login$/)
    await expect(this.submit).toBeVisible()
  }

  async fill(email: string, password: string) {
    await this.email.fill(email)
    await this.password.fill(password)
  }

  async login(email: string, password: string) {
    await this.fill(email, password)
    await this.submit.click()
  }

  async expectError(message: string) {
    await expect(this.error).toHaveText(message)
  }
}
