import { expect, test } from '@playwright/test'

import { newApiContext, signInAs } from '../fixtures/api'
import { USERS } from '../fixtures/users'

const SIGN_IN = '/api/auth/sign-in/email'
const INVALID = { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }

test.describe('API /api/auth: logowanie', () => {
  test('A1 poprawne dane: 200, ciasteczko HttpOnly + SameSite=Lax, bez hasła w odpowiedzi', async () => {
    const ctx = await newApiContext()
    const res = await ctx.post(SIGN_IN, {
      data: { email: USERS.agent.email, password: USERS.agent.password },
    })
    expect(res.status()).toBe(200)

    const setCookie = res.headers()['set-cookie'] ?? ''
    expect(setCookie).toMatch(/better-auth\.session_token=/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)

    const body = await res.json()
    expect(body.user).toMatchObject({ email: USERS.agent.email, role: 'AGENT' })
    const text = JSON.stringify(body)
    expect(text).not.toContain(USERS.agent.password)
    expect(text).not.toMatch(/"password"|"passwordHash"/)
  })

  test('A2 złe hasło, nieznany e-mail i zablokowane konto dają identyczną odpowiedź', async () => {
    const ctx = await newApiContext()
    const attempts = [
      { email: USERS.agent.email, password: 'wrong-password-1' },
      { email: 'nobody@helpdesk.local', password: 'wrong-password-1' },
      { email: USERS.locked.email, password: USERS.locked.password },
    ]
    for (const data of attempts) {
      const res = await ctx.post(SIGN_IN, { data })
      expect(res.status(), data.email).toBe(401)
      expect(await res.json(), data.email).toEqual(INVALID)
      expect(res.headers()['set-cookie'], data.email).toBeUndefined()
    }
  })

  test('A3 brak hasła lub zły format e-maila: 400', async () => {
    const ctx = await newApiContext()
    expect((await ctx.post(SIGN_IN, { data: { email: USERS.agent.email } })).status()).toBe(400)
    expect(
      (
        await ctx.post(SIGN_IN, { data: { email: 'nie-email', password: 'x'.repeat(10) } })
      ).status(),
    ).toBe(400)
  })

  test('A4 e-mail wielkimi literami też loguje', async () => {
    const ctx = await newApiContext()
    const res = await ctx.post(SIGN_IN, {
      data: { email: USERS.agent.email.toUpperCase(), password: USERS.agent.password },
    })
    expect(res.status()).toBe(200)
  })

  test('A5 żądanie z obcego originu: 403 INVALID_ORIGIN', async () => {
    const ctx = await newApiContext()
    const res = await ctx.post(SIGN_IN, {
      headers: { Origin: 'http://evil.example' },
      data: { email: USERS.agent.email, password: USERS.agent.password },
    })
    expect(res.status()).toBe(403)
    expect((await res.json()).code).toBe('INVALID_ORIGIN')
  })

  test('A6 rejestracja jest wyłączona', async () => {
    const ctx = await newApiContext()
    const email = `signup-${Date.now()}@helpdesk.local`
    const res = await ctx.post('/api/auth/sign-up/email', {
      data: { email, password: 'password-123', name: 'Nowy' },
    })
    expect(res.status()).toBe(400)
    const login = await ctx.post(SIGN_IN, { data: { email, password: 'password-123' } })
    expect(login.status()).toBe(401)
  })
})

test.describe('API /api/auth: sesja', () => {
  test('A7 get-session bez ciasteczka zwraca null', async () => {
    const ctx = await newApiContext()
    const res = await ctx.get('/api/auth/get-session')
    expect(res.status()).toBe(200)
    expect(await res.json()).toBeNull()
  })

  test('A7 get-session po zalogowaniu zwraca użytkownika z rolą i isBlocked', async () => {
    const ctx = await signInAs('admin')
    const body = await (await ctx.get('/api/auth/get-session')).json()
    expect(body.user).toMatchObject({ email: USERS.admin.email, role: 'ADMIN', isBlocked: false })
    expect(body.session.token).toBeTruthy()
  })

  test('A8 wylogowanie unieważnia sesję także dla API ticketów', async () => {
    const ctx = await signInAs('api')
    expect((await ctx.get('/api/tickets')).status()).toBe(200)

    const out = await ctx.post('/api/auth/sign-out', { data: {} })
    expect(out.status()).toBe(200)

    expect(await (await ctx.get('/api/auth/get-session')).json()).toBeNull()
    expect((await ctx.get('/api/tickets')).status()).toBe(401)
  })

  test('A8 stare ciasteczko po wylogowaniu nie działa (ponowne użycie tokenu)', async () => {
    const ctx = await signInAs('api')
    const { cookies } = await ctx.storageState()
    await ctx.post('/api/auth/sign-out', { data: {} })

    const replay = await newApiContext()
    const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    const res = await replay.get('/api/tickets', { headers: { Cookie: cookie } })
    expect(res.status()).toBe(401)
  })
})

test.describe('API /api/auth: zmiana konta', () => {
  test('A9 agent nie może nadać sobie roli ADMIN przez update-user', async () => {
    const ctx = await signInAs('api')
    await ctx.post('/api/auth/update-user', { data: { role: 'ADMIN' } })
    const session = await (await ctx.get('/api/auth/get-session')).json()
    expect(session.user.role).toBe('AGENT')
  })

  test('A9 użytkownik nie może zmienić flagi isBlocked przez update-user', async () => {
    const ctx = await signInAs('api')
    await ctx.post('/api/auth/update-user', { data: { isBlocked: true } })
    const session = await (await ctx.get('/api/auth/get-session')).json()
    expect(session.user.isBlocked).toBe(false)
  })

  test('A10 zmiana hasła ze złym obecnym hasłem jest odrzucona', async () => {
    const ctx = await signInAs('api')
    const res = await ctx.post('/api/auth/change-password', {
      data: { currentPassword: 'wrong-password-1', newPassword: 'new-password-123' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
    // Old password still works.
    await signInAs('api')
  })
})
