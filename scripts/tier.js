#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import Anthropic from '@anthropic-ai/sdk'

const __dir = dirname(fileURLToPath(import.meta.url))
const CANDIDATES_PATH = join(__dir, '..', 'public', 'candidates.json')
const forceAll = process.argv.includes('--all')

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is not set.')
  process.exit(1)
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are a senior recruitment analyst. Given a candidate's profile, return ONLY valid JSON with these exact fields:

{
  "tier": 1,
  "reason": "one sentence justifying the tier",
  "role": "normalised job title, or null",
  "stack": "comma-separated technologies extracted from the profile, or null",
  "experience": "e.g. '8 år' inferred from seniority/notes, or null",
  "city": "city if mentioned in the profile, or null",
  "note": "1–2 sentence professional summary of the candidate based on available data"
}

Tier definitions:
- 1: Senior/lead level, recognisable company, clear tech stack — immediately placeable
- 2: Mid-level, decent background, some stack info — worth pursuing
- 3: Junior, sparse data, unclear stack — needs more information

Write the note and experience in Swedish.`

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON in response: ${text}`)
  return JSON.parse(match[0])
}

async function enrichCandidate(candidate) {
  const profile = [
    `Name: ${candidate.name}`,
    candidate.role ? `Role: ${candidate.role}` : null,
    candidate.organization ? `Company: ${candidate.organization}` : null,
    candidate.linkedin ? `LinkedIn: ${candidate.linkedin}` : null,
    candidate.notes?.length ? `Notes: ${candidate.notes.join(' ')}` : null,
  ].filter(Boolean).join('\n')

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Analyse this candidate:\n\n${profile}` }],
  })

  const parsed = extractJSON(msg.content[0].text.trim())

  return {
    tier: Number(parsed.tier),
    tier_reason: String(parsed.reason),
    ai_suggestions: {
      role:       parsed.role       ?? null,
      stack:      parsed.stack      ?? null,
      experience: parsed.experience ?? null,
      city:       parsed.city       ?? null,
      note:       parsed.note       ?? null,
    },
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const candidates = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8'))
  const toProcess = forceAll ? candidates : candidates.filter(c => c.tier == null)

  if (toProcess.length === 0) {
    console.log('All candidates already enriched. Use --all to re-run.')
    return
  }
  console.log(`Enriching ${toProcess.length} candidate(s) (${candidates.length - toProcess.length} already done)…`)

  const BATCH = 5
  for (let i = 0; i < toProcess.length; i += BATCH) {
    const batch = toProcess.slice(i, i + BATCH)
    await Promise.all(batch.map(async c => {
      try {
        const result = await enrichCandidate(c)
        Object.assign(c, result)
        console.log(`  + ${c.name} → T${result.tier}  (${result.tier_reason})`)
      } catch (err) {
        console.error(`  ! ${c.name}: ${err.message}`)
      }
    }))
    if (i + BATCH < toProcess.length) await sleep(500)
  }

  const succeeded = toProcess.filter(c => c.tier != null).length
  const failed = toProcess.length - succeeded
  if (failed > 0) console.error(`  ${failed} candidate(s) failed to enrich.`)
  if (succeeded === 0) {
    console.error('No candidates were enriched — check ANTHROPIC_API_KEY and API errors above.')
    process.exit(1)
  }

  writeFileSync(CANDIDATES_PATH, JSON.stringify(candidates, null, 2))
  console.log(`\nDone. Enriched ${succeeded}/${toProcess.length} candidates.`)
}

main().catch(err => { console.error(err); process.exit(1) })
