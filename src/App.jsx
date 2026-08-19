import { useState, useEffect, useMemo } from 'react'
import CandidateCard from './CandidateCard'
import CandidateModal from './CandidateModal'
import './App.css'

const STAGE_LABELS = ['Ny kandidat', 'Intresserad', 'Intervju #1', 'Intervju #2', 'Erbjudande']
const STAGE_COLORS = ['#64748B', '#2563EB', '#D97706', '#DC2626', '#16A34A']

const EXP_BUCKETS = ['0–3 år', '3–7 år', '7+ år']

function loadSaved(candidates) {
  const out = {}
  candidates.forEach(c => {
    try { out[c.id] = JSON.parse(localStorage.getItem(`card-${c.id}`)) ?? {} }
    catch { out[c.id] = {} }
  })
  return out
}

function effectiveStack(c, cardData) {
  const s = cardData[c.id]?.stack
  return (s && s.trim()) ? s : (c.ai_suggestions?.stack ?? '')
}

function effectiveCity(c, cardData) {
  const s = cardData[c.id]?.city
  return (s && s.trim()) ? s : (c.ai_suggestions?.city ?? '')
}

function effectiveExp(c, cardData) {
  const s = cardData[c.id]?.experience
  return (s && s.trim()) ? s : (c.ai_suggestions?.experience ?? '')
}

function parseTechs(stackStr) {
  if (!stackStr) return []
  return stackStr.split(',').map(t => t.trim()).filter(Boolean)
}

function expBucket(expStr) {
  if (!expStr) return null
  const nums = expStr.match(/\d+/g)
  if (!nums) return null
  const max = Math.max(...nums.map(Number))
  if (max < 3) return '0–3 år'
  if (max < 7) return '3–7 år'
  return '7+ år'
}

export default function App() {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [search, setSearch]         = useState('')
  const [stageFilter, setStageFilter] = useState(null)
  const [cardData, setCardData]     = useState({})
  const [techFilters, setTechFilters] = useState(new Set())
  const [cityFilter, setCityFilter] = useState(null)
  const [expFilter, setExpFilter]   = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/Sueyoungslim/adamathon-crm/main/public/candidates.json')
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

  const allTechs = useMemo(() => {
    const counts = new Map()
    candidates.forEach(c => {
      parseTechs(effectiveStack(c, cardData)).forEach(t => {
        counts.set(t, (counts.get(t) ?? 0) + 1)
      })
    })
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t)
  }, [candidates, cardData])

  const allCities = useMemo(() => {
    const seen = new Set()
    candidates.forEach(c => {
      const city = effectiveCity(c, cardData)
      if (city) seen.add(city)
    })
    return [...seen].sort()
  }, [candidates, cardData])

  const hasFilters = techFilters.size > 0 || cityFilter || expFilter

  const filtered = candidates.filter(c => {
    const extra = cardData[c.id] ?? {}
    const stack = effectiveStack(c, cardData)
    const city  = effectiveCity(c, cardData)
    const exp   = effectiveExp(c, cardData)

    if (stageFilter !== null && (extra.stage_idx ?? 0) !== stageFilter) return false

    if (techFilters.size > 0) {
      const candidateTechs = parseTechs(stack).map(t => t.toLowerCase())
      for (const tech of techFilters) {
        if (!candidateTechs.some(t => t.includes(tech.toLowerCase()))) return false
      }
    }

    if (cityFilter && city.toLowerCase() !== cityFilter.toLowerCase()) return false

    if (expFilter && expBucket(exp) !== expFilter) return false

    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.role ?? '').toLowerCase().includes(q) ||
      (extra.role ?? '').toLowerCase().includes(q) ||
      stack.toLowerCase().includes(q) ||
      (c.organization ?? '').toLowerCase().includes(q) ||
      city.toLowerCase().includes(q) ||
      (c.ai_suggestions?.note ?? '').toLowerCase().includes(q)
    )
  })

  const stageCounts = STAGE_LABELS.map((_, i) =>
    candidates.filter(c => (cardData[c.id]?.stage_idx ?? 0) === i).length
  )

  const toggleTech = tech => setTechFilters(prev => {
    const next = new Set(prev)
    next.has(tech) ? next.delete(tech) : next.add(tech)
    return next
  })

  const clearFilters = () => {
    setTechFilters(new Set())
    setCityFilter(null)
    setExpFilter(null)
  }

  return (
    <div className="layout">
      <header className="app-header">
        <div className="header-row">
          <h1 className="app-title">Anslagstavlan</h1>
          <input
            className="search-input"
            type="search"
            placeholder="Sök namn, roll, tech, stad…"
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

        <div className="filter-bar">
          {allTechs.length > 0 && (
            <div className="filter-group">
              <span className="filter-lbl">Stack</span>
              {allTechs.map(tech => (
                <button
                  key={tech}
                  className={`filter-chip filter-chip--tech ${techFilters.has(tech) ? 'filter-chip--on' : ''}`}
                  onClick={() => toggleTech(tech)}
                >
                  {tech}
                </button>
              ))}
            </div>
          )}

          {allCities.length > 0 && (
            <div className="filter-group">
              <span className="filter-lbl">Stad</span>
              {allCities.map(city => (
                <button
                  key={city}
                  className={`filter-chip filter-chip--city ${cityFilter === city ? 'filter-chip--on' : ''}`}
                  onClick={() => setCityFilter(prev => prev === city ? null : city)}
                >
                  {city}
                </button>
              ))}
            </div>
          )}

          <div className="filter-group">
            <span className="filter-lbl">Erfarenhet</span>
            {EXP_BUCKETS.map(b => (
              <button
                key={b}
                className={`filter-chip filter-chip--exp ${expFilter === b ? 'filter-chip--on' : ''}`}
                onClick={() => setExpFilter(prev => prev === b ? null : b)}
              >
                {b}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button className="filter-clear" onClick={clearFilters}>
              Rensa filter
            </button>
          )}
        </div>
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
            onExpand={() => setSelectedId(c.id)}
            index={i}
          />
        ))}
      </main>

      {selectedId && (() => {
        const c = candidates.find(x => x.id === selectedId)
        return c ? (
          <CandidateModal
            candidate={c}
            savedData={cardData[c.id] ?? {}}
            onUpdate={updateCard}
            onClose={() => setSelectedId(null)}
          />
        ) : null
      })()}
    </div>
  )
}
