import { expect, test } from '@playwright/test'

import { E2E_SEARCH, TICKETS } from '../fixtures/tickets'
import { STORAGE_STATE, USERS } from '../fixtures/users'
import { TicketsPage } from '../pages/TicketsPage'

test.use({ storageState: STORAGE_STATE.agent })

test.describe('Skrzynka ticketów', () => {
  test('odpowiedź zmienia status na W toku i pojawia się w wątku', async ({ page }) => {
    const { subject } = TICKETS.uiReply
    const tickets = new TicketsPage(page)
    await tickets.goto('status=all')
    await tickets.search(subject)
    await tickets.open(subject)
    await expect(tickets.row(subject)).toHaveAttribute('aria-current', 'true')

    await tickets.reply(subject, 'Dzień dobry, sprawdzamy.')

    await expect(tickets.statusSelect(subject)).toHaveText('W toku')
    await expect(tickets.thread.getByText('Dzień dobry, sprawdzamy.').first()).toBeVisible()
    await expect(
      tickets.thread.getByText(`${USERS.agent.name} · Status: Otwarty → W toku`).first(),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/tickets\/[^/?]+\?/)
  })

  test('przypisanie ticketu zostawia wpis w historii', async ({ page }) => {
    const { subject } = TICKETS.uiAssign
    const tickets = new TicketsPage(page)
    await tickets.goto('status=all')
    await tickets.search(subject)
    await tickets.open(subject)

    await tickets.assigneeSelect(subject).click()
    await page.getByRole('option', { name: USERS.admin.name }).click()

    await expect(tickets.assigneeSelect(subject)).toHaveText(USERS.admin.name)
    await expect(
      tickets.thread.getByText(
        `${USERS.agent.name} · Przypisanie: Nieprzypisany → ${USERS.admin.name}`,
      ),
    ).toBeVisible()
  })

  test('filtry i zaznaczenie wracają po odświeżeniu', async ({ page }) => {
    const { subject } = TICKETS.openUrgent
    const tickets = new TicketsPage(page)
    await tickets.goto('priority=URGENT&status=all')
    await tickets.open(subject)
    const url = page.url()

    await page.reload()

    await expect(page).toHaveURL(url)
    await expect(tickets.panel(subject)).toBeVisible()
    await expect(tickets.row(subject)).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('combobox', { name: 'Priorytet' }).first()).toHaveText('Pilny')
    await expect(tickets.row(TICKETS.openLow.subject)).toHaveCount(0)
  })

  // Regression: the panel kept its state between tickets, so a draft could be sent to the wrong one.
  test('szkic odpowiedzi nie przechodzi na inny ticket', async ({ page }) => {
    const first = TICKETS.openUrgent.subject
    const second = TICKETS.openLow.subject
    const tickets = new TicketsPage(page)
    await tickets.goto('status=all')
    await tickets.search(E2E_SEARCH)
    // Open the first ticket once so its detail is cached when we come back.
    await tickets.open(first)
    await tickets.open(second)
    await tickets.replyBox(second).fill('Szkic dla innego klienta')

    await tickets.open(first)

    await expect(tickets.replyBox(first)).toHaveValue('')
  })

  test.describe('widok mobilny', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('powrót z ticketu do listy zachowuje query string', async ({ page }) => {
      const { subject } = TICKETS.openUrgent
      const tickets = new TicketsPage(page)
      await tickets.goto('priority=URGENT&status=all')
      await tickets.open(subject)
      await expect(page).toHaveURL(/\/tickets\/[^/?]+\?/)

      await tickets.backToList.click()

      await expect(page).toHaveURL(/\/tickets\?(?=.*priority=URGENT)(?=.*status=all)/)
      await expect(tickets.row(subject)).toBeVisible()
    })
  })
})
