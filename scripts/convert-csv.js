#!/usr/bin/env node
/**
 * Converts a Ponty CSV export to public/candidates.json
 *
 * Usage:
 *   node scripts/convert-csv.js path/to/candidates.csv
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const PONTY_BASE = 'https://larenius.ponty-system.se'

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: node scripts/convert-csv.js path/to/candidates.csv')
  process.exit(1)
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const headers = splitLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = splitLine(lines[i])
    const row = {}
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] ?? '').trim() })
    rows.push(row)
  }
  return { headers, rows }
}

function splitLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// Try to find a column by several possible names (case-insensitive)
function find(row, ...candidates) {
  for (const key of Object.keys(row)) {
    if (candidates.some(c => key.toLowerCase().includes(c.toLowerCase()))) {
      return row[key] || null
    }
  }
  return null
}

const text = readFileSync(csvPath, 'utf8')
const { headers, rows } = parseCSV(text)

console.log(`\nDetected ${rows.length} rows with columns:`)
console.log(' ', headers.join(', '))
console.log()

let skipped = 0
const candidates = rows
  .map((row, i) => {
    const firstname = find(row, 'förnamn', 'firstname', 'first name', 'fname')
    const lastname  = find(row, 'efternamn', 'lastname', 'last name', 'lname', 'surname')
    const fullname  = find(row, 'namn', 'name', 'fullname', 'full name')
    const name = fullname || [firstname, lastname].filter(Boolean).join(' ') || '(No name)'

    const pontyId = find(row, '﻿id', 'id') // handle BOM on first column
    const ponty_url = pontyId ? `${PONTY_BASE}/candidate/${pontyId}/show` : null

    return {
      id: pontyId || String(i + 1),
      name,
      ponty_url,
      role:     find(row, 'roll', 'role', 'titel', 'title', 'befattning', 'position'),
      email:    find(row, 'e-post', 'email', 'epost', 'mail'),
      phone:    find(row, 'telefon', 'phone', 'tel', 'mobile', 'mobil'),
      linkedin: find(row, 'linkedin', 'url', 'länk', 'link'),
      notes:    [find(row, 'scribble', 'anteckning', 'note', 'kommentar', 'comment')].filter(Boolean),
    }
  })
  .filter(c => {
    if (c.name === '(No name)' && !c.email) { skipped++; return false }
    return true
  })

if (skipped) console.log(`Skipped ${skipped} rows with no name or email.`)

const __dir = dirname(fileURLToPath(import.meta.url))
const outPath = join(__dir, '..', 'public', 'candidates.json')
writeFileSync(outPath, JSON.stringify(candidates, null, 2))
console.log(`Written ${candidates.length} candidates to ${outPath}`)
console.log('\nNext step: git add public/candidates.json && git push')
