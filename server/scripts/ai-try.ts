/**
 * Manual check against the REAL model (the only place tests-adjacent code may call it).
 * Runs the triage pipeline on the sample tickets, prints results and metrics to the console.
 * Does not touch the database. With --record it saves the raw /api/chat response of the
 * `analysis` call for pl-printer as src/__fixtures__/ollama/chat-ok.json.
 *
 *   pnpm --filter server ai:try [--record]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type InteractionEntry, runTriage } from '../src/ai/aiService'
import { createOllamaProvider } from '../src/ai/ollamaProvider'
import type { TicketInput } from '../src/ai/prompts'

const SAMPLES = ['pl-printer', 'en-invoice', 'de-return']
const record = process.argv.includes('--record')

const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
const model = process.env.OLLAMA_MODEL ?? 'qwen3.8:27b-q4_K_M'
const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 120000)

let recordNext = false
let recorded: string | null = null

// Capture the raw response of the first (analysis) call of pl-printer when recording.
const recordingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  if (recordNext) {
    recordNext = false
    recorded = JSON.stringify(await res.clone().json(), null, 2)
  }
  return res
}

async function main() {
  const provider = createOllamaProvider({ host, model, timeoutMs, fetch: recordingFetch })
  console.log(`Ollama: ${host}, model: ${model}, timeout: ${timeoutMs} ms\n`)

  for (const name of SAMPLES) {
    const input = JSON.parse(
      readFileSync(join(__dirname, '../src/__fixtures__/ai-samples', `${name}.json`), 'utf8'),
    ) as TicketInput
    const entries: InteractionEntry[] = []
    recordNext = record && name === 'pl-printer'
    const startedAt = Date.now()
    console.log(`=== ${name}: ${input.subject}`)
    try {
      const out = await runTriage(input, provider, async e => {
        entries.push(e)
      })
      console.log(`priority:           ${out.suggestedPriority}`)
      console.log(`customerLanguage:   ${out.customerLanguage}`)
      console.log(`summaryPl:          ${out.summaryPl}`)
      console.log(`summaryEn:          ${out.summaryEn}`)
      console.log(`draft:\n${out.draft}`)
      console.log(`draftTranslationPl: ${out.draftTranslationPl ?? '(none, draft is Polish)'}`)
      console.log(`draftTranslationEn: ${out.draftTranslationEn ?? '(none, draft is English)'}`)
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`)
      process.exitCode = 1
    }
    for (const e of entries) {
      console.log(
        `  [${e.type}] ${e.success ? 'ok' : 'FAILED'} ${e.latencyMs} ms, tokens in/out ${e.inputTokens}/${e.outputTokens}`,
      )
    }
    console.log(`  total: ${Date.now() - startedAt} ms\n`)
  }

  if (record) {
    if (!recorded) throw new Error('Nothing recorded (analysis call for pl-printer failed)')
    writeFileSync(join(__dirname, '../src/__fixtures__/ollama/chat-ok.json'), `${recorded}\n`)
    console.log('Recorded src/__fixtures__/ollama/chat-ok.json')
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
