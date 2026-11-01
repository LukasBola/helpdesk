import { expect, test } from '@playwright/test'

import { findTicketId, signInAs } from '../fixtures/api'
import { AI_TICKETS } from '../fixtures/tickets'
import { USERS } from '../fixtures/users'
import { AppShell } from '../pages/AppShell'
import { LoginPage } from '../pages/LoginPage'
import { TicketsPage } from '../pages/TicketsPage'

// One account whose languages the tests change: run them one after another, each from a
// known state (Polish interface, English AI language).
test.describe.configure({ mode: 'serial' })
test.use({ storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ page }) => {
  const account = await signInAs('ai')
  const reset = await account.post('/api/auth/update-user', {
    data: { locale: 'pl', aiLocale: 'en' },
  })
  expect(reset.status(), 'Status resetu języków konta (interfejs PL, AI EN)').toBe(200)
  await account.dispose()

  await new LoginPage(page).goto()
  await new LoginPage(page).login(USERS.ai.email, USERS.ai.password)
  await new AppShell(page).expectSignedInAs(USERS.ai.firstName)
})

test.describe('Panel AI w tickecie', () => {
  test('AI1 streszczenie w języku AI agenta, niezależnie od języka interfejsu', async ({
    page,
  }) => {
    const { subject } = AI_TICKETS.ready
    const plSummary = 'Klient zgłasza awarię logowania i prosi o pilną pomoc.'
    const enSummary = 'The customer reports a login failure and asks for urgent help.'

    const tickets = new TicketsPage(page)
    await tickets.goto('status=all')
    await tickets.search(subject)
    await tickets.open(subject)

    // Polish interface, English AI language: the summary is English.
    const plPanel = tickets.panel(subject).getByRole('region', { name: 'Streszczenie AI' })
    await expect(
      plPanel.getByText(enSummary),
      'Przy interfejsie PL i języku AI EN streszczenie jest po angielsku',
    ).toBeVisible()
    await expect(
      plPanel.getByText(plSummary),
      'Polskie streszczenie nie jest pokazane',
    ).toBeHidden()

    // Now switch both: interface to English, AI language to Polish.
    const menu = await new AppShell(page).openUserMenu()
    await menu
      .getByRole('group', { name: 'Język', exact: true })
      .getByRole('menuitemradio', { name: 'EN' })
      .click()
    const aiGroup = menu.getByRole('group', { name: 'AI language' })
    await expect(aiGroup, 'Menu jest po angielsku').toBeVisible()
    await aiGroup.getByRole('menuitemradio', { name: 'PL' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Good morning,'), 'Interfejs jest po angielsku').toBeVisible()

    const enPanel = tickets.panel(subject).getByRole('region', { name: 'AI summary' })
    await expect(
      enPanel.getByText(plSummary),
      'Streszczenie jest po polsku mimo angielskiego interfejsu',
    ).toBeVisible()
    await expect(enPanel.getByText(enSummary), 'Angielskie streszczenie zniknęło').toBeHidden()
  })

  test('AI2 propozycja priorytetu: Zastosuj zmienia priorytet i historię', async ({ page }) => {
    const { subject } = AI_TICKETS.ready
    // Repeatable: the previous run left the priority on URGENT.
    const api = await signInAs('ai')
    const id = await findTicketId(api, subject)
    const reset = await api.patch(`/api/tickets/${id}`, { data: { priority: 'MEDIUM' } })
    expect(reset.status(), 'Status PATCH przywracającego priorytet MEDIUM').toBe(200)
    await api.dispose()

    const tickets = new TicketsPage(page)
    await tickets.goto('status=all')
    await tickets.search(subject)
    await tickets.open(subject)
    await expect(tickets.prioritySelect(subject), 'Priorytet przed zastosowaniem').toHaveText(
      'Średni',
    )

    const entry = tickets.thread.getByText(`${USERS.ai.name} · Priorytet: Średni → Pilny`)
    const before = await entry.count()

    await tickets.applyPrioritySuggestion(subject, 'Pilny')

    await expect(tickets.prioritySelect(subject), 'Priorytet po zastosowaniu').toHaveText('Pilny')
    await expect(entry, 'To kliknięcie dopisało jeden wpis do historii wątku').toHaveCount(
      before + 1,
    )
    await expect(
      tickets.panel(subject).getByText('AI proponuje: Pilny'),
      'Propozycja znika, gdy priorytet jest już taki',
    ).toBeHidden()
  })

  test('AI3 Użyj szkicu wypełnia formularz, tłumaczenie widoczne', async ({ page }) => {
    const { subject } = AI_TICKETS.ready
    const tickets = new TicketsPage(page)
    await tickets.goto('status=all')
    await tickets.search(subject)
    await tickets.open(subject)

    const draft = tickets.panel(subject).getByRole('region', { name: 'Szkic AI' })
    await expect(draft.getByText('Guten Tag, vielen Dank'), 'Szkic jest po niemiecku').toBeVisible()
    await expect(draft.getByText('Tłumaczenie'), 'Etykieta tłumaczenia szkicu').toBeVisible()
    await expect(
      draft.getByText('Hello, thank you for your message.'),
      'Tłumaczenie szkicu jest w języku AI (EN)',
    ).toBeVisible()

    await draft.getByRole('button', { name: 'Użyj szkicu' }).click()

    await expect(tickets.replyBox(subject), 'Formularz odpowiedzi zawiera szkic').toHaveValue(
      /^Guten Tag, vielen Dank/,
    )
  })

  test('AI4 stany: AI analizuje… i AI niedostępne', async ({ page }) => {
    const tickets = new TicketsPage(page)
    await tickets.goto('status=all')

    const pending = AI_TICKETS.pending.subject
    await tickets.search(pending)
    await tickets.open(pending)
    await expect(
      tickets.panel(pending).getByText('AI analizuje…'),
      'Stan PENDING pokazuje „AI analizuje…”',
    ).toBeVisible()

    const failed = AI_TICKETS.failed.subject
    await tickets.search(failed)
    await tickets.open(failed)
    const panel = tickets.panel(failed)
    await expect(
      panel.getByText('AI niedostępne'),
      'Stan FAILED pokazuje „AI niedostępne”',
    ).toBeVisible()
    await expect(
      panel.getByRole('button', { name: 'Spróbuj ponownie' }),
      'Przycisk ponowienia jest dostępny (bez klikania)',
    ).toBeEnabled()
  })
})
