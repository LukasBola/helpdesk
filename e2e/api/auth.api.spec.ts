import { expect, test } from '@playwright/test'

import { newApiContext, signInAs } from '../fixtures/api'
import { db } from '../fixtures/db'
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
    const ctx = await signInAs('escalate')
    const res = await ctx.post('/api/auth/update-user', { data: { role: 'ADMIN' } })
    expect(res.status()).toBe(400)
    const session = await (await ctx.get('/api/auth/get-session')).json()
    expect(session.user.role).toBe('AGENT')
  })

  test('A9 użytkownik nie może ustawić sobie isBlocked przez update-user', async () => {
    const ctx = await signInAs('escalate')
    const res = await ctx.post('/api/auth/update-user', { data: { isBlocked: true } })
    expect(res.status()).toBe(400)
    const session = await (await ctx.get('/api/auth/get-session')).json()
    expect(session.user.isBlocked).toBe(false)
  })

  test('A10 zmiana hasła ze złym obecnym hasłem jest odrzucona', async () => {
    const ctx = await signInAs('api')
    const res = await ctx.post('/api/auth/change-password', {
      data: { currentPassword: 'wrong-password-1', newPassword: 'new-password-123' },
    })
    expect(res.status()).toBe(400)
    // Old password still works.
    await signInAs('api')
  })

  test('A10 nowe hasło krótsze niż 8 znaków jest odrzucone', async () => {
    const ctx = await signInAs('api')
    const res = await ctx.post('/api/auth/change-password', {
      data: { currentPassword: USERS.api.password, newPassword: 'short' },
    })
    expect(res.status()).toBe(400)
    await signInAs('api')
  })

  test('A12 pusta lub bardzo długa nazwa użytkownika jest odrzucona', async () => {
    const ctx = await signInAs('account')
    for (const name of ['', '   ', 'x'.repeat(500)]) {
      const res = await ctx.post('/api/auth/update-user', { data: { name } })
      expect(res.status(), JSON.stringify(name.slice(0, 10))).toBe(400)
    }
    const session = await (await ctx.get('/api/auth/get-session')).json()
    expect(session.user.name).toBe(USERS.account.name)
  })
})

test.describe('API /api/auth: wyłączone i chronione endpointy', () => {
  test('A11 usunięcie konta jest niedostępne', async () => {
    const ctx = await signInAs('account')
    const res = await ctx.post('/api/auth/delete-user', { data: {} })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
    await signInAs('account')
  })

  test('A11 zmiana e-maila jest niedostępna', async () => {
    const ctx = await signInAs('account')
    const viaChange = await ctx.post('/api/auth/change-email', {
      data: { newEmail: 'changed@helpdesk.local' },
    })
    expect(viaChange.status()).toBe(400)
    const viaUpdate = await ctx.post('/api/auth/update-user', {
      data: { email: 'changed@helpdesk.local' },
    })
    expect(viaUpdate.status()).toBe(400)
    const session = await (await ctx.get('/api/auth/get-session')).json()
    expect(session.user.email).toBe(USERS.account.email)
  })

  test('A11 reset hasła: identyczna odpowiedź dla znanego i nieznanego e-maila', async () => {
    const ctx = await newApiContext()
    const known = await ctx.post('/api/auth/request-password-reset', {
      data: { email: USERS.account.email, redirectTo: '/' },
    })
    const unknown = await ctx.post('/api/auth/request-password-reset', {
      data: { email: 'nobody@helpdesk.local', redirectTo: '/' },
    })
    expect(known.status()).toBe(unknown.status())
    expect(await known.json()).toEqual(await unknown.json())
  })

  // Tokens are returned by design (revoke-session takes one); they can't be turned into a
  // cookie without the server's HMAC secret. What matters is that only own sessions are listed.
  test('A11 lista sesji zawiera tylko sesje zalogowanego użytkownika', async () => {
    const ctx = await signInAs('account')
    await signInAs('agent')
    const me = (await (await ctx.get('/api/auth/get-session')).json()).user.id as string
    const res = await ctx.get('/api/auth/list-sessions')
    expect(res.status()).toBe(200)
    const sessions = (await res.json()) as { userId: string }[]
    expect(sessions.length).toBeGreaterThan(0)
    expect(sessions.every(session => session.userId === me)).toBe(true)
  })

  test('A13 wylogowanie z obcego originu jest odrzucone (CSRF)', async () => {
    const ctx = await signInAs('account')
    const res = await ctx.post('/api/auth/sign-out', {
      headers: { Origin: 'http://evil.example' },
      data: {},
    })
    expect(res.status()).toBe(403)
    expect((await ctx.get('/api/tickets')).status()).toBe(200)
  })

  test('A13 update-user z obcego originu jest odrzucony (CSRF)', async () => {
    const ctx = await signInAs('account')
    const res = await ctx.post('/api/auth/update-user', {
      headers: { Origin: 'http://evil.example' },
      data: { name: 'Hacked' },
    })
    expect(res.status()).toBe(403)
  })
})

test.describe('API /api/auth: zablokowany użytkownik z aktywną sesją', () => {
  test.beforeEach(() => db.unblock(USERS.selfUnblock.email))
  test.afterEach(() => db.unblock(USERS.selfUnblock.email))

  test('A14 nie może się odblokować przez update-user', async () => {
    const ctx = await signInAs('selfUnblock')
    db.block(USERS.selfUnblock.email)
    await ctx.post('/api/auth/update-user', { data: { isBlocked: false } })
    const session = await (await ctx.get('/api/auth/get-session')).json()
    expect(session?.user?.isBlocked ?? true).toBe(true)
    expect((await ctx.get('/api/tickets')).status()).toBe(401)
  })

  // Known gap, owned by Plan 09: blocking must revoke sessions. Until then Better Auth's own
  // endpoints still accept a blocked user's session.
  test.fixme('A14 sesja zablokowanego nie działa na endpointach Better Auth', async () => {
    const ctx = await signInAs('selfUnblock')
    db.block(USERS.selfUnblock.email)
    expect(await (await ctx.get('/api/auth/get-session')).json()).toBeNull()
    expect((await ctx.get('/api/auth/list-sessions')).status()).toBe(401)
  })
})
