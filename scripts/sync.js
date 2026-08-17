#!/usr/bin/env node
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { createHash, randomBytes } from 'node:crypto'

const PONTY_AUTH_BASE  = 'https://ponty-system.se'
const PONTY_API_BASE   = 'https://openapi.ponty-system.se'
const PONTY_INT_BASE   = 'https://larenius.ponty-system.se'
const PONTY_CLIENT_ID  = 'ponty-frontend'
const PONTY_REDIRECT   = 'https://larenius.ponty-system.se/login/callback'
const PONTY_SCOPE      = 'backend offline_access profile email'
const TIMEOUT_MS       = 15_000

const ASSIGNMENT_ID    = 573   // "IT Aktiva kandidater Stockholm"
const PROSPECT_STEP    = 1     // "Prospect" bucket

const email    = process.env.PONTY_EMAIL
const password = process.env.PONTY_PASSWORD

if (!email || !password) {
  console.error('Missing PONTY_EMAIL or PONTY_PASSWORD')
  process.exit(1)
}

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

// ── OAuth2 authorization code + PKCE ─────────────────────────────────────────

async function pontyFetch(url, init) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
}

async function authenticate() {
  const verifier   = randomBytes(32).toString('base64url')
  const challenge  = createHash('sha256').update(verifier).digest('base64url')
  const oauthState = randomBytes(32).toString('base64url')
  const jar        = new CookieJar()

  const oauthParams = new URLSearchParams({
    client_id: PONTY_CLIENT_ID, redirect_uri: PONTY_REDIRECT,
    response_type: 'code', scope: PONTY_SCOPE,
    code_challenge: challenge, code_challenge_method: 'S256', state: oauthState,
  })

  const startUrl = new URL(`${PONTY_AUTH_BASE}/auth/login/start`)
  startUrl.search = oauthParams.toString()
  const startRes = await pontyFetch(startUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }), redirect: 'manual',
  })
  if (!startRes.ok) throw new Error(`Login start: HTTP ${startRes.status}`)
  jar.absorb(startRes)
  const { session_id } = await startRes.json()

  const verifyRes = await pontyFetch(`${PONTY_AUTH_BASE}/auth/login/verify-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar.toHeader() },
    body: JSON.stringify({ session_id, email, password }), redirect: 'manual',
  })
  if (!verifyRes.ok) throw new Error(`Verify password: HTTP ${verifyRes.status}`)
  jar.absorb(verifyRes)
  const { state: loginState } = await verifyRes.json()
  if (loginState !== 'done') throw new Error(`Unexpected login state: ${loginState}`)

  const authUrl = new URL(`${PONTY_AUTH_BASE}/oauth2/authorize`)
  authUrl.search = oauthParams.toString()
  const authRes = await pontyFetch(authUrl, {
    method: 'GET', headers: { Cookie: jar.toHeader() }, redirect: 'manual',
  })
  jar.absorb(authRes)
  await authRes.body?.cancel()

  const location = authRes.headers.get('location')
  if (!location) throw new Error('No redirect from authorize')
  const redirectUrl = new URL(location, PONTY_AUTH_BASE)
  if (redirectUrl.searchParams.get('state') !== oauthState) throw new Error('OAuth state mismatch')
  const code = redirectUrl.searchParams.get('code')
  if (!code) throw new Error('No code in OAuth redirect')

  const tokenRes = await pontyFetch(`${PONTY_AUTH_BASE}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code,
      redirect_uri: PONTY_REDIRECT, client_id: PONTY_CLIENT_ID, code_verifier: verifier,
    }),
  })
  if (!tokenRes.ok) throw new Error(`Token exchange: HTTP ${tokenRes.status}`)
  const { access_token } = await tokenRes.json()
  return access_token
}

// ── Fetch all candidates ──────────────────────────────────────────────────────

const MAX_CANDIDATES = 50

// Try the larenius internal API first — it supports step (bucket) filtering.
// Falls back to the public API (no step filter) if the internal endpoint fails.
async function fetchAssignmentCandidates(token) {
  // Internal API attempt
  try {
    const q = JSON.stringify({
      step: PROSPECT_STEP, sortby: 'added_at',
      notes: true, details: true, tags: true, organization: true,
      page: 0, size: MAX_CANDIDATES,
    })
    const url = new URL(`${PONTY_INT_BASE}/api/assignment/${ASSIGNMENT_ID}/candidates`)
    url.searchParams.set('q', q)
    const res = await pontyFetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json()
      const results = Array.isArray(data) ? data : (data.result ?? data.candidates ?? [])
      if (results.length > 0) {
        console.log(`Internal API: ${results.length} candidates from assignment ${ASSIGNMENT_ID} step ${PROSPECT_STEP}`)
        return results.slice(0, MAX_CANDIDATES)
      }
    } else {
      console.log(`Internal API returned ${res.status}, falling back to public API`)
      await res.body?.cancel()
    }
  } catch (err) {
    console.log(`Internal API error: ${err.message}, falling back to public API`)
  }

  // Public API fallback (no step filter)
  console.log(`Fetching from public API: assignment ${ASSIGNMENT_ID}, first ${MAX_CANDIDATES} candidates`)
  const url = new URL(`${PONTY_API_BASE}/v1/candidates`)
  url.searchParams.set('assignment_id[]', ASSIGNMENT_ID)
  url.searchParams.set('include_notes', 'true')
  url.searchParams.set('size', MAX_CANDIDATES)
  url.searchParams.set('page', 0)
  url.searchParams.set('sort_by', 'created_at_asc')
  const res = await pontyFetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Candidates fetch failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  const results = data.result ?? []
  console.log(`Public API: ${results.length} candidates`)
  return results
}

function mapCandidate(c) {
  const notes = (c.notes ?? [])
    .map(n => (typeof n === 'string' ? n : n.note_text ?? n.text ?? n.body ?? ''))
    .filter(Boolean)
  return {
    id:           String(c.id),
    name:         [c.firstname, c.lastname].filter(Boolean).join(' ') || '(No name)',
    ponty_url:    `${PONTY_INT_BASE}/candidate/${c.id}/show`,
    role:         c.role ?? c.title ?? null,
    organization: c.organization_name ?? c.organization?.name ?? null,
    email:        c.email ?? null,
    phone:        c.phone ?? null,
    linkedin:     c.url ?? c.linkedin_url ?? null,
    notes,
  }
}

async function main() {
  console.log('Authenticating with Ponty…')
  const token = await authenticate()
  console.log('Authenticated. Fetching candidates…')
  const raw = await fetchAssignmentCandidates(token)
  const candidates = raw.map(mapCandidate)
  console.log(`Mapped ${candidates.length} candidates`)

  const __dir = dirname(fileURLToPath(import.meta.url))
  const outPath = join(__dir, '..', 'public', 'candidates.json')
  writeFileSync(outPath, JSON.stringify(candidates, null, 2))
  console.log(`Written to ${outPath}`)
}

main().catch(err => { console.error(err.message); process.exit(1) })
