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
    await expect(tickets.row(subject), 'Otwarty ticket jest zaznaczony na liście').toHaveAttribute(
      'aria-current',
      'true',
    )

    await tickets.reply(subject, 'Dzień dobry, sprawdzamy.')

    await expect(tickets.statusSelect(subject), 'Status po odpowiedzi to „W toku”').toHaveText(
      'W toku',
    )
    await expect(
      tickets.thread.getByText('Dzień dobry, sprawdzamy.').first(),
      'Odpowiedź jest w wątku',
    ).toBeVisible()
    await expect(
      tickets.thread.getByText(`${USERS.agent.name} · Status: Otwarty → W toku`).first(),
      'Zmiana statusu jest w historii wątku',
    ).toBeVisible()
    await expect(page, 'URL ticketu zachowuje query string').toHaveURL(/\/tickets\/[^/?]+\?/)
  })

  test('przypisanie ticketu zostawia wpis w historii', async ({ page }) => {
    const { subject } = TICKETS.uiAssign
    const tickets = new TicketsPage(page)
    await tickets.goto('status=all')
    await tickets.search(subject)
    await tickets.open(subject)

    await tickets.assigneeSelect(subject).click()
    await page.getByRole('option', { name: USERS.admin.name }).click()

    await expect(tickets.assigneeSelect(subject), 'Ticket przypisany do administratora').toHaveText(
      USERS.admin.name,
    )
    await expect(
      tickets.thread.getByText(
        `${USERS.agent.name} · Przypisanie: Nieprzypisany → ${USERS.admin.name}`,
      ),
      'Zmiana przypisania jest w historii wątku',
    ).toBeVisible()
  })

  test('filtry i zaznaczenie wracają po odświeżeniu', async ({ page }) => {
    const { subject } = TICKETS.openUrgent
    const tickets = new TicketsPage(page)
    await tickets.goto('priority=URGENT&status=all')
    await tickets.open(subject)
    const url = page.url()

    await page.reload()

    await expect(page, 'URL po odświeżeniu bez zmian').toHaveURL(url)
    await expect(tickets.panel(subject), 'Panel ticketu wraca po odświeżeniu').toBeVisible()
    await expect(tickets.row(subject), 'Zaznaczenie ticketu wraca po odświeżeniu').toHaveAttribute(
      'aria-current',
      'true',
    )
    await expect(
      page.getByRole('combobox', { name: 'Priorytet' }).first(),
      'Filtr priorytetu wraca jako „Pilny”',
    ).toHaveText('Pilny')
    await expect(
      tickets.row(TICKETS.openLow.subject),
      'Ticket o niskim priorytecie jest odfiltrowany',
    ).toHaveCount(0)
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

    await expect(
      tickets.replyBox(first),
      'Pole odpowiedzi pierwszego ticketu jest puste',
    ).toHaveValue('')
  })

  test.describe('widok mobilny', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('powrót z ticketu do listy zachowuje query string', async ({ page }) => {
      const { subject } = TICKETS.openUrgent
      const tickets = new TicketsPage(page)
      await tickets.goto('priority=URGENT&status=all')
      await tickets.open(subject)
      await expect(page, 'URL ticketu zachowuje query string').toHaveURL(/\/tickets\/[^/?]+\?/)

      await tickets.backToList.click()

      await expect(page, 'Lista ma te same filtry co przed otwarciem ticketu').toHaveURL(
        /\/tickets\?(?=.*priority=URGENT)(?=.*status=all)/,
      )
      await expect(tickets.row(subject), 'Ticket jest widoczny na liście').toBeVisible()
    })
  })
})
