#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import Anthropic from '@anthropic-ai/sdk'

const __dir = dirname(fileURLToPath(import.meta.url))
const CANDIDATES_PATH = join(__dir, '..', 'public', 'candidates.json')
const forceAll = process.argv.includes('--all')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are a senior recruitment analyst. Given a candidate's profile, classify them into exactly one tier:
- Tier 1: Senior/lead level, recognisable company, clear tech stack, strong background — immediately placeable
- Tier 2: Mid-level, decent background, some stack info — worth pursuing
- Tier 3: Junior, sparse data, unclear stack, or profile needs more information

Respond with ONLY valid JSON in this exact format: {"tier": 1, "reason": "one sentence"}`

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON in response: ${text}`)
  return JSON.parse(match[0])
}

async function tierCandidate(candidate) {
  const profile = [
    `Name: ${candidate.name}`,
    candidate.role ? `Role: ${candidate.role}` : null,
    candidate.organization ? `Company: ${candidate.organization}` : null,
    candidate.notes?.length ? `Notes: ${candidate.notes.join(' ')}` : null,
  ].filter(Boolean).join('\n')

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Tier this candidate:\n\n${profile}` }],
  })

  const parsed = extractJSON(msg.content[0].text.trim())
  return { tier: Number(parsed.tier), tier_reason: String(parsed.reason) }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8'))
  const toTier = forceAll ? candidates : candidates.filter(c => c.tier == null)

  if (toTier.length === 0) {
    console.log('All candidates already tiered. Use --all to re-tier.')
    return
  }
  console.log(`Tiering ${toTier.length} candidate(s) (${candidates.length - toTier.length} already tiered)…`)

  const BATCH = 5
  for (let i = 0; i < toTier.length; i += BATCH) {
    const batch = toTier.slice(i, i + BATCH)
    await Promise.all(batch.map(async c => {
      try {
        const result = await tierCandidate(c)
        Object.assign(c, result)
        console.log(`  + ${c.name} → T${result.tier}  (${result.tier_reason})`)
      } catch (err) {
        console.error(`  ! ${c.name}: ${err.message}`)
      }
    }))
    if (i + BATCH < toTier.length) await sleep(500)
  }

  writeFileSync(CANDIDATES_PATH, JSON.stringify(candidates, null, 2))
  console.log(`\nDone. Written ${candidates.length} candidates to ${CANDIDATES_PATH}`)
}

main().catch(err => { console.error(err); process.exit(1) })
