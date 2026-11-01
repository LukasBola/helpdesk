import { expect, request, test } from '@playwright/test'

import { BASE_URL, BROWSER_HEADERS, findTicketId, signInAs } from '../fixtures/api'
import { db } from '../fixtures/db'
import { USERS } from '../fixtures/users'
import { AppShell } from '../pages/AppShell'
import { LoginPage } from '../pages/LoginPage'
import { TicketsPage } from '../pages/TicketsPage'

// Opt-in: calls the real local model (Ollama), so it is skipped unless E2E_OLLAMA=1
// (`pnpm e2e:ollama`). Customers use @ai.example to stay out of the klient.example set.
test.skip(process.env.E2E_OLLAMA !== '1', 'Test na prawdziwym modelu: uruchom `pnpm e2e:ollama`')
test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()
const messageId = `e2e-ollama-${stamp}@test`
const subject = `E2E Ollama ${stamp} Drucker`

test.afterAll(() => {
  db.deleteTicket(messageId)
})

test.describe('Webhook do panelu AI na prawdziwym modelu', () => {
  test('mail z webhooka Postmark staje się ticketem z wynikami AI', async ({ page }) => {
    test.setTimeout(4 * 60_000)

    const token = process.env.POSTMARK_WEBHOOK_TOKEN
    if (!token) {
      throw new Error(
        'Brak POSTMARK_WEBHOOK_TOKEN w .env: test webhooka nie może się uwierzytelnić',
      )
    }

    const account = await signInAs('ai')
    const reset = await account.post('/api/auth/update-user', {
      data: { locale: 'pl', aiLocale: 'en' },
    })
    expect(reset.status(), 'Status resetu języków konta (interfejs PL, AI EN)').toBe(200)

    const hook = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: BROWSER_HEADERS })
    const sent = await hook.post('/api/webhooks/postmark', {
      headers: { 'X-Postmark-Token': token },
      data: {
        MessageID: messageId,
        From: 'Klaus Becker <klaus.becker@ai.example>',
        FromFull: { Email: 'klaus.becker@ai.example', Name: 'Klaus Becker' },
        To: 'support@helpdesk.example',
        Subject: subject,
        TextBody:
          'Guten Tag, unser Bürodrucker druckt seit heute Morgen nicht mehr und zeigt nur ' +
          'eine Fehlermeldung an. Wir brauchen den Drucker dringend für die Rechnungen. ' +
          'Können Sie uns bitte helfen? Vielen Dank, Klaus Becker',
      },
    })
    expect(sent.status(), 'Webhook Postmark przyjmuje maila (200)').toBe(200)
    await hook.dispose()

    await new LoginPage(page).goto()
    await new LoginPage(page).login(USERS.ai.email, USERS.ai.password)
    await new AppShell(page).expectSignedInAs(USERS.ai.firstName)

    // The ticket appears once the e-mail job has run.
    const tickets = new TicketsPage(page)
    await expect(async () => {
      await tickets.goto('status=all')
      await tickets.search(subject)
      await expect(tickets.row(subject), 'Ticket z maila pojawia się na liście').toBeVisible({
        timeout: 3_000,
      })
    }, 'Ticket z maila pojawia się po przetworzeniu joba').toPass({ timeout: 60_000 })
    await tickets.open(subject)

    const panel = tickets.panel(subject)
    const summary = panel.getByRole('region', { name: 'Streszczenie AI' })
    const draft = panel.getByRole('region', { name: 'Szkic AI' })
    const pending = panel.getByText('AI analizuje…')

    // Either still analysing, or the model was already done.
    await expect(
      pending.or(draft),
      'Panel pokazuje „AI analizuje…” albo gotowe wyniki',
    ).toBeVisible()

    await expect(summary.locator('p').first(), 'Streszczenie AI ma niepusty tekst').toHaveText(
      /\S/,
      { timeout: 3 * 60_000 },
    )
    await expect(draft, 'Szkic AI jest widoczny').toBeVisible({ timeout: 3 * 60_000 })
    await expect(draft.locator('p').first(), 'Szkic AI ma niepusty tekst').toHaveText(/\S/)
    await expect(
      draft.getByText('Tłumaczenie'),
      'Szkic ma blok tłumaczenia (klient niemiecki)',
    ).toBeVisible()
    await expect(
      draft.locator('div.text-muted-foreground p').nth(1),
      'Tłumaczenie szkicu ma niepusty tekst',
    ).toHaveText(/\S/)

    const apply = panel.getByRole('button', { name: 'Zastosuj' })
    if (await panel.getByText(/^AI proponuje:/).isVisible()) {
      await expect(apply, 'Propozycja priorytetu ma przycisk „Zastosuj”').toBeVisible()
    }

    const id = await findTicketId(account, subject)
    const res = await account.get(`/api/tickets/${id}`)
    expect(res.status(), 'GET /api/tickets/:id zwraca 200').toBe(200)
    const body = (await res.json()) as {
      aiResult: {
        state: string
        customerLanguage: string
        summaryPl: string
        summaryEn: string
        draft: string
      }
    }
    const ai = body.aiResult
    expect(ai.state, 'Stan wyniku AI to READY').toBe('READY')
    expect(ai.customerLanguage, 'Wykryty język klienta to niemiecki').toBe('de')
    expect(ai.summaryPl.trim(), 'Streszczenie PL nie jest puste').not.toBe('')
    expect(ai.summaryEn.trim(), 'Streszczenie EN nie jest puste').not.toBe('')
    expect(ai.draft.trim(), 'Szkic nie jest pusty').not.toBe('')
    await account.dispose()
  })
})
