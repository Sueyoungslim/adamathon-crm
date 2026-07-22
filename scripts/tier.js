#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { createHash, randomBytes } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'

const __dir = dirname(fileURLToPath(import.meta.url))
const CANDIDATES_PATH = join(__dir, '..', 'public', 'candidates.json')
const forceAll = process.argv.includes('--all')

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.')
  process.exit(1)
}

const PONTY_AUTH_BASE = 'https://ponty-system.se'
const PONTY_API_BASE  = 'https://larenius.ponty-system.se'
const PONTY_CLIENT_ID = 'ponty-frontend'
const PONTY_REDIRECT  = `${PONTY_API_BASE}/login/callback`
const PONTY_SCOPE     = 'backend offline_access profile email'
const TIMEOUT_MS      = 15_000

// ── Cookie jar ────────────────────────────────────────────────────────────────

class CookieJar {
  #values = new Map()

  absorb(response) {
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair = '', ...attrs] = setCookie.split(';')
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name  = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const gone  = value === '' || attrs.some(a => /^\s*max-age\s*=\s*0\s*$/i.test(a))
      gone ? this.#values.delete(name) : this.#values.set(name, value)
    }
  }

  toHeader() {
    return [...this.#values.entries()].map(([n, v]) => `${n}=${v}`).join('; ')
  }
}

// ── Ponty OAuth2 (authorization code + PKCE) ──────────────────────────────────

async function pontyFetch(url, init) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
}

async function authenticate(email, password) {
  const verifier   = randomBytes(32).toString('base64url')
  const challenge  = createHash('sha256').update(verifier).digest('base64url')
  const oauthState = randomBytes(32).toString('base64url')
  const jar        = new CookieJar()

  const oauthParams = new URLSearchParams({
    client_id:             PONTY_CLIENT_ID,
    redirect_uri:          PONTY_REDIRECT,
    response_type:         'code',
    scope:                 PONTY_SCOPE,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state:                 oauthState,
  })

  // 1. Start login
  const startUrl = new URL(`${PONTY_AUTH_BASE}/auth/login/start`)
  startUrl.search = oauthParams.toString()
  const startRes = await pontyFetch(startUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    redirect: 'manual',
  })
  if (!startRes.ok) throw new Error(`Login start: HTTP ${startRes.status}`)
  jar.absorb(startRes)
  const { session_id } = await startRes.json()

  // 2. Verify password
  const verifyRes = await pontyFetch(`${PONTY_AUTH_BASE}/auth/login/verify-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar.toHeader() },
    body: JSON.stringify({ session_id, email, password }),
    redirect: 'manual',
  })
  if (!verifyRes.ok) throw new Error(`Verify password: HTTP ${verifyRes.status}`)
  jar.absorb(verifyRes)
  const { state: loginState } = await verifyRes.json()
  if (loginState !== 'done') throw new Error(`Unexpected login state: ${loginState}`)

  // 3. Authorize (manual redirect — do NOT follow)
  const authUrl = new URL(`${PONTY_AUTH_BASE}/oauth2/authorize`)
  authUrl.search = oauthParams.toString()
  const authRes = await pontyFetch(authUrl, {
    method: 'GET',
    headers: { Cookie: jar.toHeader() },
    redirect: 'manual',
  })
  jar.absorb(authRes)
  await authRes.body?.cancel()

  const location = authRes.headers.get('location')
  if (!location) throw new Error('No redirect from authorize')
  const redirectUrl = new URL(location, PONTY_AUTH_BASE)
  if (redirectUrl.searchParams.get('state') !== oauthState) throw new Error('OAuth state mismatch')
  const code = redirectUrl.searchParams.get('code')
  if (!code) throw new Error('No code in OAuth redirect')

  // 4. Exchange code for tokens
  const tokenRes = await pontyFetch(`${PONTY_AUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  PONTY_REDIRECT,
      client_id:     PONTY_CLIENT_ID,
      code_verifier: verifier,
    }),
  })
  if (!tokenRes.ok) throw new Error(`Token exchange: HTTP ${tokenRes.status}`)
  const tokens = await tokenRes.json()
  return makeTokenSet(tokens)
}

async function refreshTokens(refreshToken) {
  const res = await pontyFetch(`${PONTY_AUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     PONTY_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`Token refresh: HTTP ${res.status}`)
  return makeTokenSet(await res.json())
}

function makeTokenSet(data) {
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + data.expires_in * 1000 - 30_000,
  }
}

// ── Token manager (auto-refresh) ──────────────────────────────────────────────

let currentTokens = null

async function getAccessToken() {
  if (currentTokens && Date.now() < currentTokens.expiresAt) return currentTokens.accessToken
  if (currentTokens?.refreshToken) {
    try {
      currentTokens = await refreshTokens(currentTokens.refreshToken)
      return currentTokens.accessToken
    } catch { /* fall through to re-authenticate */ }
  }
  currentTokens = await authenticate(process.env.PONTY_EMAIL, process.env.PONTY_PASSWORD)
  return currentTokens.accessToken
}

// ── Fetch candidate notes from Ponty ─────────────────────────────────────────

function candidateIdFromUrl(pontyUrl) {
  if (!pontyUrl) return null
  try {
    const parts = new URL(pontyUrl).pathname.split('/')
    const idx = parts.indexOf('candidate')
    return idx !== -1 ? parts[idx + 1] : null
  } catch { return null }
}

async function fetchPontyNotes(pontyUrl) {
  const id = candidateIdFromUrl(pontyUrl)
  if (!id) return []

  const query = JSON.stringify({
    tags: true, notes: true, details: true, files: true,
    organization: true, actions: true, assignments: true,
  })
  const url = new URL(`${PONTY_API_BASE}/api/candidate/${id}`)
  url.searchParams.set('q', query)

  const accessToken = await getAccessToken()
  const res = await pontyFetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Candidate fetch HTTP ${res.status}`)
  const data = await res.json()
  return data.notes ?? []
}

function formatNotes(pontyNotes) {
  return pontyNotes
    .filter(n => n.note_text?.trim())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(n => `[${n.created_at.slice(0, 10)}] ${n.note_text.trim()}`)
    .join('\n\n')
}

// ── Claude enrichment ─────────────────────────────────────────────────────────

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

async function enrichCandidate(candidate, pontyNotes) {
  const noteText = formatNotes(pontyNotes)

  const profile = [
    `Name: ${candidate.name}`,
    candidate.role        ? `Role: ${candidate.role}`             : null,
    candidate.organization ? `Company: ${candidate.organization}` : null,
    candidate.linkedin    ? `LinkedIn: ${candidate.linkedin}`     : null,
    candidate.notes?.length ? `Notes (CSV): ${candidate.notes.join(' ')}` : null,
    noteText              ? `Recruiter notes:\n${noteText}`       : null,
  ].filter(Boolean).join('\n')

  const msg = await claude.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system:     SYSTEM,
    messages:   [{ role: 'user', content: `Analyse this candidate:\n\n${profile}` }],
  })

  const parsed = extractJSON(msg.content[0].text.trim())
  return {
    tier:       Number(parsed.tier),
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

// ── Main ──────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

const usePonty = !!(process.env.PONTY_EMAIL && process.env.PONTY_PASSWORD)

async function main() {
  const candidates  = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8'))
  const toProcess   = forceAll ? candidates : candidates.filter(c => c.tier == null)

  if (toProcess.length === 0) {
    console.log('All candidates already enriched. Use --all to re-run.')
    return
  }

  if (usePonty) {
    console.log('Authenticating with Ponty…')
    await getAccessToken()
    console.log('Authenticated.')
  } else {
    console.log('PONTY_EMAIL/PONTY_PASSWORD not set — skipping Ponty notes fetch.')
  }

  console.log(`Enriching ${toProcess.length} candidate(s)…`)

  const BATCH = 5
  for (let i = 0; i < toProcess.length; i += BATCH) {
    const batch = toProcess.slice(i, i + BATCH)
    await Promise.all(batch.map(async c => {
      let pontyNotes = []
      if (usePonty) {
        try {
          pontyNotes = await fetchPontyNotes(c.ponty_url)
        } catch (err) {
          console.error(`  ! Ponty fetch failed for ${c.name}: ${err.message}`)
        }
      }
      try {
        const result = await enrichCandidate(c, pontyNotes)
        Object.assign(c, result)
        const noteCount = pontyNotes.filter(n => n.note_text?.trim()).length
        console.log(`  + ${c.name} → T${result.tier} (${noteCount} Ponty note(s))`)
      } catch (err) {
        console.error(`  ! Claude failed for ${c.name}: ${err.message}`)
      }
    }))
    if (i + BATCH < toProcess.length) await sleep(500)
  }

  const succeeded = toProcess.filter(c => c.tier != null).length
  const failed    = toProcess.length - succeeded
  if (failed > 0) console.error(`  ${failed} candidate(s) failed to enrich.`)
  if (succeeded === 0) {
    console.error('No candidates were enriched — check errors above.')
    process.exit(1)
  }

  writeFileSync(CANDIDATES_PATH, JSON.stringify(candidates, null, 2))
  console.log(`\nDone. Enriched ${succeeded}/${toProcess.length} candidates.`)
}

main().catch(err => { console.error(err); process.exit(1) })
