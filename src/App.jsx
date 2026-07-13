import { useState, useEffect } from 'react'
import CandidateCard from './CandidateCard'
import './App.css'

const STAGE_LABELS = ['Ny kandidat', 'Intresserad', 'Intervju #1', 'Intervju #2', 'Erbjudande']
const STAGE_COLORS = ['#64748B', '#2563EB', '#D97706', '#DC2626', '#16A34A']

function loadSaved(candidates) {
  const out = {}
  candidates.forEach(c => {
    try { out[c.id] = JSON.parse(localStorage.getItem(`card-${c.id}`)) ?? {} }
    catch { out[c.id] = {} }
  })
  return out
}

export default function App() {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState(null)
  const [cardData, setCardData] = useState({})

  useEffect(() => {
    fetch('/candidates.json')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => {
        setCandidates(data)
        setCardData(loadSaved(data))
        setLoading(false)
      })
      .catch(() => { setError('Kunde inte ladda kandidater'); setLoading(false) })
  }, [])

  const updateCard = (id, updates) => {
    setCardData(prev => {
      const next = { ...prev, [id]: { ...(prev[id] ?? {}), ...updates } }
      localStorage.setItem(`card-${id}`, JSON.stringify(next[id]))
      return next
    })
  }

  const filtered = candidates.filter(c => {
    const extra = cardData[c.id] ?? {}
    if (stageFilter !== null && (extra.stage_idx ?? 0) !== stageFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.role ?? '').toLowerCase().includes(q) ||
      (extra.role ?? '').toLowerCase().includes(q) ||
      (extra.stack ?? '').toLowerCase().includes(q) ||
      (c.organization ?? '').toLowerCase().includes(q) ||
      (extra.city ?? '').toLowerCase().includes(q)
    )
  })

  const stageCounts = STAGE_LABELS.map((_, i) =>
    candidates.filter(c => (cardData[c.id]?.stage_idx ?? 0) === i).length
  )

  return (
    <div className="layout">
      <header className="app-header">
        <div className="header-row">
          <h1 className="app-title">Anslagstavlan</h1>
          <input
            className="search-input"
            type="search"
            placeholder="Sök namn, roll, stack, stad…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="total-count">{filtered.length} kandidater</span>
        </div>

        <nav className="stage-nav" aria-label="Filtrera efter status">
          <button
            className={`stage-tab ${stageFilter === null ? 'stage-tab--active' : ''}`}
            onClick={() => setStageFilter(null)}
          >
            Alla <span className="tab-count">{candidates.length}</span>
          </button>
          {STAGE_LABELS.map((label, i) => (
            <button
              key={i}
              className={`stage-tab ${stageFilter === i ? 'stage-tab--active' : ''}`}
              style={{ '--tc': STAGE_COLORS[i] }}
              onClick={() => setStageFilter(stageFilter === i ? null : i)}
            >
              {label} <span className="tab-count">{stageCounts[i]}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="corkboard">
        {loading && <p className="board-msg">Laddar kandidater…</p>}
        {error && <p className="board-msg board-msg--err">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="board-msg">Inga kandidater matchar sökningen.</p>
        )}
        {filtered.map((c, i) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            savedData={cardData[c.id] ?? {}}
            onUpdate={updateCard}
            index={i}
          />
        ))}
      </main>
    </div>
  )
}
