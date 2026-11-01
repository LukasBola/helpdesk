import { Prisma } from '@prisma/client'
import type { PgBoss } from 'pg-boss'

import { triageTicket } from '../ai/aiService'
import type { AiProvider } from '../ai/types'
import { prisma } from '../db'
import { logger } from '../lib/logger'
import { getQueue } from './queue'

export const AI_JOB = 'ai-triage'
export const AI_JOB_OPTIONS = { retryLimit: 2, retryDelay: 5, retryBackoff: true } as const

const MAX_ERROR_CHARS = 500

export interface AiJobData {
  ticketId: string
  userId?: string
}

// pg-boss v12 rejects send() to a missing queue; create it once per boss instance.
let queueReady: { boss: PgBoss; promise: Promise<void> } | null = null

function ensureAiQueue(boss: PgBoss): Promise<void> {
  if (!queueReady || queueReady.boss !== boss) {
    const promise = boss.createQueue(AI_JOB).catch(err => {
      queueReady = null
      throw err
    })
    queueReady = { boss, promise }
  }
  return queueReady.promise
}

async function markPending(ticketId: string): Promise<boolean> {
  // Conditional update: only one concurrent caller can flip a non-PENDING row to PENDING.
  const updated = await prisma.ticketAiResult.updateMany({
    where: { ticketId, state: { not: 'PENDING' } },
    data: { state: 'PENDING' },
  })
  if (updated.count > 0) return true

  try {
    await prisma.ticketAiResult.create({ data: { ticketId, state: 'PENDING' } })
    return true
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Row exists: it was already PENDING (or was flipped by a concurrent caller).
      return false
    }
    throw err
  }
}

export async function requestAiTriage(
  ticketId: string,
  userId?: string,
): Promise<'queued' | 'already-pending'> {
  if (!(await markPending(ticketId))) return 'already-pending'

  const boss = await getQueue()
  await ensureAiQueue(boss)
  const data: AiJobData = { ticketId, ...(userId ? { userId } : {}) }
  await boss.send(AI_JOB, data, { ...AI_JOB_OPTIONS, singletonKey: ticketId })
  return 'queued'
}

export async function handleAiJob(
  job: { data: AiJobData; retryCount: number; retryLimit: number },
  provider?: AiProvider,
): Promise<void> {
  const { ticketId, userId } = job.data
  try {
    const outcome = await triageTicket(ticketId, { provider, userId })
    await prisma.ticketAiResult.update({
      where: { ticketId },
      data: { ...outcome, state: 'READY', error: null, completedAt: new Date() },
    })
  } catch (err: unknown) {
    if (job.retryCount < job.retryLimit) throw err
    const message = (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_CHARS)
    logger.error({ err, ticketId }, 'AI triage failed')
    await prisma.ticketAiResult.updateMany({
      where: { ticketId },
      data: { state: 'FAILED', error: message },
    })
  }
}

export async function registerAiWorker(boss: PgBoss): Promise<void> {
  await ensureAiQueue(boss)
  await boss.work<AiJobData>(AI_JOB, { includeMetadata: true }, ([job]) => handleAiJob(job))
}
