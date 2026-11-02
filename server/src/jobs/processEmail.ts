import { Prisma } from '@prisma/client'
import type { PgBoss } from 'pg-boss'

import { prisma } from '../db'
import { env } from '../env'
import { logger } from '../lib/logger'
import { enqueueAiTriage } from './aiTriage'

export const EMAIL_JOB = 'process-email'

export interface PostmarkPayload {
  MessageID: string
  From: string
  FromFull: { Email: string; Name: string }
  Subject: string
  TextBody: string
  HtmlBody: string
  To: string
}

interface ParsedEmail {
  messageId: string
  customerEmail: string
  customerName: string
  subject: string
  body: string
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parsePostmarkPayload(
  payload: PostmarkPayload,
  options: { ownDomain?: string } = {},
): ParsedEmail | null {
  const senderDomain = payload.FromFull.Email.split('@')[1]?.toLowerCase()

  if (options.ownDomain && senderDomain === options.ownDomain.toLowerCase()) {
    return null
  }

  const body = payload.TextBody?.trim() || stripHtml(payload.HtmlBody || '')

  return {
    messageId: payload.MessageID,
    customerEmail: payload.FromFull.Email,
    customerName: payload.FromFull.Name || payload.FromFull.Email,
    subject: payload.Subject,
    body,
  }
}

export async function createTicketFromEmail(
  payload: PostmarkPayload,
  enqueueTriage: typeof enqueueAiTriage = enqueueAiTriage,
): Promise<void> {
  const parsed = parsePostmarkPayload(payload, { ownDomain: env.OWN_DOMAIN })

  if (!parsed) {
    logger.info({ messageId: payload.MessageID }, 'Skipping loop email')
    return
  }

  let ticketId: string
  try {
    const ticket = await prisma.ticket.create({
      data: {
        messageId: parsed.messageId,
        customerEmail: parsed.customerEmail,
        customerName: parsed.customerName,
        subject: parsed.subject,
        body: parsed.body,
        // Created with the ticket so a detail fetched right away already shows PENDING.
        aiResult: { create: { state: 'PENDING' } },
      },
    })
    ticketId = ticket.id
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Unique constraint — duplicate messageId, silently ignore
      logger.info({ messageId: parsed.messageId }, 'Duplicate messageId, skipping')
      return
    }
    throw err
  }

  // AI must never block or retry email intake.
  await Promise.resolve()
    .then(() => enqueueTriage(ticketId))
    .catch(err => logger.error({ err, ticketId }, 'AI enqueue failed'))
}

export async function registerEmailWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(EMAIL_JOB)
  await boss.work<PostmarkPayload>(EMAIL_JOB, async ([job]) => {
    await createTicketFromEmail(job.data)
  })
}
