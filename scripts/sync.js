#!/usr/bin/env node
/**
 * Fetches all candidates from the Ponty CRM API and writes them to
 * public/candidates.json so Netlify can serve them as static data.
 *
 * Required env vars:
 *   PONTY_CLIENT_ID
 *   PONTY_CLIENT_SECRET
 *   PONTY_BASE_URL  (optional, default: https://openapi.ponty-system.se)
 */

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const BASE_URL = process.env.PONTY_BASE_URL || 'https://openapi.ponty-system.se'
const CLIENT_ID = process.env.PONTY_CLIENT_ID
const CLIENT_SECRET = process.env.PONTY_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing PONTY_CLIENT_ID or PONTY_CLIENT_SECRET')
  process.exit(1)
}

async function getToken() {
  const res = await fetch(`${BASE_URL}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Auth failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return data.access_token
}

async function fetchAllCandidates(token) {
  const all = []
  let page = 0
  const size = 250

  while (true) {
    const url = new URL(`${BASE_URL}/v1/candidates`)
    url.searchParams.set('include_notes', 'true')
    url.searchParams.set('size', size)
    url.searchParams.set('page', page)
    url.searchParams.set('sort_by', 'created_at_desc')

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Candidates fetch failed (${res.status}): ${text}`)
    }
    const data = await res.json()
    const results = data.result ?? []
    all.push(...results)

    console.log(`Page ${page}: fetched ${results.length} candidates (total so far: ${all.length}/${data.total})`)

    if (all.length >= data.total || results.length < size) break
    page++
  }

  return all
}

const PONTY_BASE = 'https://larenius.ponty-system.se'

function mapCandidate(c) {
  const notes = (c.notes ?? []).map(n => (typeof n === 'string' ? n : n.text ?? '')).filter(Boolean)
  return {
    id: String(c.id),
    name: [c.firstname, c.lastname].filter(Boolean).join(' ') || '(No name)',
    ponty_url: `${PONTY_BASE}/candidate/${c.id}/show`,
    role: c.role ?? null,
    organization: c.organization_name ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    linkedin: c.url ?? null,
    notes,
  }
}

async function main() {
  console.log('Authenticating with Ponty…')
  const token = await getToken()

  console.log('Fetching candidates…')
  const raw = await fetchAllCandidates(token)

  const candidates = raw.map(mapCandidate)
  console.log(`Mapped ${candidates.length} candidates`)

  const __dir = dirname(fileURLToPath(import.meta.url))
  const outPath = join(__dir, '..', 'public', 'candidates.json')
  writeFileSync(outPath, JSON.stringify(candidates, null, 2))
  console.log(`Written to ${outPath}`)
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
