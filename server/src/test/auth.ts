import request from 'supertest'

import { app } from '../app'

export async function signIn(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/sign-in/email').send({ email, password })
  if (res.status !== 200) {
    throw new Error(`signIn(${email}) failed with status ${res.status}`)
  }
  const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
  return setCookie.map(cookie => cookie.split(';')[0]).join('; ')
}
