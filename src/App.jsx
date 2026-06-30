import { useState, useEffect } from 'react'
import CandidateCard from './CandidateCard'
import './App.css'

export default function App() {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/candidates.json')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load candidates')
        return r.json()
      })
      .then(data => {
        setCandidates(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const filtered = candidates.filter(c => {
    const q = search.toLowerCase()
    return (
      c.name?.toLowerCase().includes(q) ||
      c.role?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="app">
      <header className="app-header">
        <h1>Candidates</h1>
        <p className="subtitle">{candidates.length} candidates from Ponty CRM</p>
        <input
          className="search"
          type="search"
          placeholder="Search by name, role or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </header>

      <main className="app-main">
        {loading && <p className="state-msg">Loading candidates…</p>}
        {error && <p className="state-msg error">Error: {error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="state-msg">No candidates found.</p>
        )}
        <div className="candidate-grid">
          {filtered.map(c => (
            <CandidateCard key={c.id} candidate={c} />
          ))}
        </div>
      </main>
    </div>
  )
}
