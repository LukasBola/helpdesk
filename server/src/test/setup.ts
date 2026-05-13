import { execSync } from 'child_process'
import path from 'path'
import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer } from 'testcontainers'

let container: StartedTestContainer

export async function setup() {
  container = await new GenericContainer('pgvector/pgvector:pg16')
    .withEnvironment({
      POSTGRES_DB: 'helpdesk_test',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
    })
    .withExposedPorts(5432)
    .start()

  const host = container.getHost()
  const port = container.getMappedPort(5432)
  const url = `postgresql://test:test@${host}:${port}/helpdesk_test`

  process.env.DATABASE_URL = url
  process.env.SESSION_SECRET = 'test-secret-that-is-at-least-32-chars'
  process.env.NODE_ENV = 'test'
  process.env.POSTMARK_WEBHOOK_TOKEN = 'test-token'

  const prismaPath = path.join(__dirname, '../../node_modules/prisma/build/index.js')
  const serverDir = path.join(__dirname, '../..')

  execSync(`node ${prismaPath} migrate deploy`, {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
}

export async function teardown() {
  await container?.stop()
}
