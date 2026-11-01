import { expect, type Locator, type Page } from '@playwright/test'

// The ticket inbox: list, filters and the ticket panel next to it.
export class TicketsPage {
  readonly searchInput: Locator
  readonly thread: Locator
  readonly backToList: Locator

  constructor(private readonly page: Page) {
    this.searchInput = page.getByRole('searchbox')
    this.thread = page.getByRole('list', { name: 'Wątek ticketu' })
    this.backToList = page.getByRole('link', { name: 'Wróć do listy' })
  }

  async goto(query = '') {
    await this.page.goto(`/tickets${query ? `?${query}` : ''}`)
    await expect(this.searchInput).toBeVisible()
  }

  async search(text: string) {
    await this.searchInput.fill(text)
  }

  row(subject: string): Locator {
    return this.page.getByRole('link', { name: subject })
  }

  async open(subject: string) {
    await this.row(subject).click()
    await expect(this.panel(subject)).toBeVisible()
  }

  panel(subject: string): Locator {
    return this.page.getByRole('region', { name: subject })
  }

  // Controls are scoped to the panel: the list filters have comboboxes with the same names.
  private control(subject: string, name: string): Locator {
    return this.panel(subject).getByRole('combobox', { name })
  }

  statusSelect(subject: string): Locator {
    return this.control(subject, 'Status')
  }

  prioritySelect(subject: string): Locator {
    return this.control(subject, 'Priorytet')
  }

  assigneeSelect(subject: string): Locator {
    return this.control(subject, 'Przypisany do')
  }

  replyBox(subject: string): Locator {
    return this.panel(subject).getByRole('textbox', { name: 'Odpowiedź' })
  }

  async reply(subject: string, text: string) {
    await this.replyBox(subject).fill(text)
    await this.panel(subject).getByRole('button', { name: 'Wyślij' }).click()
  }
}
