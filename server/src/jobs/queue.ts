import { PgBoss } from 'pg-boss'

import { env } from '../env'

let boss: PgBoss | null = null
let startPromise: Promise<PgBoss> | null = null

export async function getQueue(): Promise<PgBoss> {
  if (!startPromise) {
    startPromise = (async () => {
      boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' })
      await boss.start()
      return boss
    })()
  }
  return startPromise
}

export async function stopQueue(): Promise<void> {
  await boss?.stop()
  boss = null
  startPromise = null
}
