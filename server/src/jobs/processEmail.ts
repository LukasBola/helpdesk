import { Prisma } from '@prisma/client'
import type { PgBoss } from 'pg-boss'

import { prisma } from '../db'
import { env } from '../env'

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
  const senderDomain = payload.FromFull.Email.split('@')[1]

  if (options.ownDomain && senderDomain === options.ownDomain) {
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

export async function registerEmailWorker(boss: PgBoss): Promise<void> {
  await boss.work<PostmarkPayload>(EMAIL_JOB, async ([job]) => {
    const ownDomain = env.OWN_DOMAIN
    const parsed = parsePostmarkPayload(job.data, { ownDomain })

    if (!parsed) {
      console.log(`[processEmail] Skipping loop email: ${job.data.MessageID}`)
      return
    }

    try {
      await prisma.ticket.create({
        data: {
          messageId: parsed.messageId,
          customerEmail: parsed.customerEmail,
          customerName: parsed.customerName,
          subject: parsed.subject,
          body: parsed.body,
        },
      })
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique constraint — duplicate messageId, silently ignore
        console.log(`[processEmail] Duplicate messageId: ${parsed.messageId}`)
        return
      }
      throw err
    }
  })
}
