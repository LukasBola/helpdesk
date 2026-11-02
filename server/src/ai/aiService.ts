import type { AIInteractionType, TicketPriority } from '@prisma/client'

import { prisma } from '../db'
import { logger } from '../lib/logger'
import { buildAnalysisRequest, buildDraftRequest, type TicketInput } from './prompts'
import { getAiProvider } from './provider'
import { AiInvalidOutputError, type AiProvider, type StructuredRequest } from './types'

export interface TriageOutcome {
  suggestedPriority: TicketPriority
  customerLanguage: string
  summaryPl: string
  summaryEn: string
  draft: string
  draftTranslationPl: string | null
  draftTranslationEn: string | null
}

export interface InteractionEntry {
  type: AIInteractionType
  provider: string
  model: string
  prompt: string
  response: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  success: boolean
  error?: string
}

type Log = (e: InteractionEntry) => Promise<void>

async function call<T>(
  provider: AiProvider,
  req: StructuredRequest<T>,
  type: AIInteractionType,
  log: Log,
): Promise<T> {
  const base = {
    type,
    provider: provider.name,
    model: provider.model,
    prompt: `${req.system}\n\n${req.user}`,
  }
  let res
  try {
    res = await provider.generate(req)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const failure: InteractionEntry =
      err instanceof AiInvalidOutputError
        ? { ...base, response: err.raw, ...err.usage, success: false, error: message }
        : {
            // AiUnavailableError and anything unexpected: nothing came back from the model.
            ...base,
            response: '',
            inputTokens: 0,
            outputTokens: 0,
            latencyMs: 0,
            success: false,
            error: message,
          }
    try {
      await log(failure)
    } catch (logErr) {
      logger.error({ err: logErr }, 'Failed to log AI interaction')
    }
    throw err
  }
  await log({
    ...base,
    response: res.raw,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    latencyMs: res.latencyMs,
    success: true,
  })
  return res.data
}

export async function runTriage(
  input: TicketInput,
  provider: AiProvider,
  log: Log,
): Promise<TriageOutcome> {
  const analysis = await call(provider, buildAnalysisRequest(input), 'CLASSIFICATION', log)
  const draft = await call(
    provider,
    buildDraftRequest(input, analysis.customerLanguage),
    'SUGGESTED_REPLY',
    log,
  )
  return {
    suggestedPriority: analysis.priority,
    customerLanguage: analysis.customerLanguage,
    summaryPl: analysis.summaryPl,
    summaryEn: analysis.summaryEn,
    draft: draft.draft,
    draftTranslationPl: analysis.customerLanguage === 'pl' ? null : draft.translationPl,
    draftTranslationEn: analysis.customerLanguage === 'en' ? null : draft.translationEn,
  }
}

export async function triageTicket(
  ticketId: string,
  opts: { provider?: AiProvider; userId?: string } = {},
): Promise<TriageOutcome> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new Error('Ticket not found')
  return runTriage(
    { subject: ticket.subject, body: ticket.body, customerName: ticket.customerName },
    opts.provider ?? getAiProvider(),
    async e => {
      await prisma.aIInteraction.create({
        data: { ...e, ticketId, userId: opts.userId ?? null, costUsd: 0 },
      })
    },
  )
}
