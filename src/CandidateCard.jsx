import { useRef, useState, useEffect } from 'react'

const STAGES = [
  { label: 'Ny kandidat',  color: '#64748B' },
  { label: 'Intresserad',  color: '#2563EB' },
  { label: 'Intervju #1', color: '#D97706' },
  { label: 'Intervju #2', color: '#DC2626' },
  { label: 'Erbjudande',  color: '#16A34A' },
]

const TECH = [
  'React','Vue','Angular','Svelte','Next.js','Remix','TypeScript','JavaScript',
  'Node.js','Python','Java','Kotlin','Swift','Go','Rust','C#','.NET','PHP','Ruby',
  'AWS','Azure','GCP','Docker','Kubernetes','Terraform','PostgreSQL','MySQL',
  'MongoDB','Redis','GraphQL','Machine Learning','ML','AI','LLM','TensorFlow',
  'PyTorch','React Native','Flutter','Tailwind','Spring','Django','FastAPI',
]

function extractTech(texts) {
  const s = texts.join(' ').toLowerCase()
  return TECH.filter(t => s.includes(t.toLowerCase())).join(', ')
}

const WORK_PREFS = ['Hybrid', 'Remote', 'On-site']

const ROTATIONS = [-0.6, 0.4, -0.3, 0.5, -0.4, 0.3, -0.5, 0.4]

const TIER_COLORS = { 1: '#F59E0B', 2: '#94A3B8', 3: '#B45309' }

export default function CandidateCard({ candidate, savedData = {}, onUpdate, index = 0 }) {
  const { id, name, role: pontyRole, organization, linkedin, ponty_url, notes, tier, tier_reason, ai_suggestions } = candidate
  const textRef = useRef(null)

  const ai = ai_suggestions ?? {}
  const defaultStack = ai.stack ?? extractTech([...notes, pontyRole ?? ''])
  const d = {
    role: pontyRole ?? '',
    stack: defaultStack,
    city: ai.city ?? '',
    work_pref: 'Hybrid',
    salary: '',
    experience: ai.experience ?? '',
    note: ai.note ?? notes.join(' '),
    stage_idx: 0,
    eu: true,
    ...savedData,
  }

  const set = (key, val) => onUpdate(id, { [key]: val })
  const stage = STAGES[d.stage_idx] ?? STAGES[0]

  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef(null)
  useEffect(() => {
    if (!dropOpen) return
    const close = e => { if (!dropRef.current?.contains(e.target)) setDropOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [dropOpen])

  const cycleWork = () => {
    const i = WORK_PREFS.indexOf(d.work_pref)
    set('work_pref', WORK_PREFS[(i + 1) % WORK_PREFS.length])
  }

  const rot = ROTATIONS[index % ROTATIONS.length]

  return (
    <article className="card" style={{ '--rot': `${rot}deg` }}>
      <div className="pushpin" aria-hidden="true" />

      <div className="card-name-row">
        <p className="card-name">{name}</p>
        {tier && (
          <span
            className="tier-badge"
            style={{ '--tc': TIER_COLORS[tier] }}
            title={tier_reason ?? ''}
          >
            T{tier}
          </span>
        )}
      </div>

      <input
        className="card-role f-input"
        value={d.role}
        onChange={e => set('role', e.target.value)}
        placeholder="Titel / Roll"
      />

      <hr className="card-rule" />

      <div className="card-fields">
        <Row label="Stack">
          <input className="f-input f-val" value={d.stack} onChange={e => set('stack', e.target.value)} placeholder="React, TypeScript…" />
        </Row>

        <Row label="Plats">
          <div className="plats-row">
            <button className="work-tag" onClick={cycleWork}>{d.work_pref}</button>
            <span className="plats-dot">·</span>
            <input className="f-input plats-city" value={d.city} onChange={e => set('city', e.target.value)} placeholder="Stad" />
          </div>
        </Row>

        <Row label="Lön">
          <input className="f-input f-val" value={d.salary} onChange={e => set('salary', e.target.value)} placeholder="70–80 000 kr" />
        </Row>

        <Row label="Erfarenhet">
          <input className="f-input f-val" value={d.experience} onChange={e => set('experience', e.target.value)} placeholder="7 år" />
        </Row>

        {organization && (
          <Row label="Bolag">
            <span className="f-val f-static">{organization}</span>
          </Row>
        )}
      </div>

      <hr className="card-rule" />

      <textarea
        ref={textRef}
        className="card-note f-input"
        value={d.note}
        onChange={e => set('note', e.target.value)}
        placeholder="Anteckningar, bakgrund, EU-medborgare, work permit…"
        rows={2}
      />

      <hr className="card-rule" />

      <footer className="card-footer">
        <div className="stage-wrap" ref={dropRef}>
          <button
            className="stage-stamp"
            style={{ '--sc': stage.color }}
            onClick={() => setDropOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={dropOpen}
          >
            {stage.label} <span className="stamp-caret">▾</span>
          </button>
          {dropOpen && (
            <div className="stage-dropdown" role="listbox">
              {STAGES.map((s, i) => (
                <button
                  key={i}
                  role="option"
                  aria-selected={i === d.stage_idx}
                  className={`stage-option ${i === d.stage_idx ? 'stage-option--active' : ''}`}
                  style={{ '--sc': s.color }}
                  onClick={() => { set('stage_idx', i); setDropOpen(false) }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card-icons">
          {linkedin && (
            <a href={linkedin} target="_blank" rel="noopener noreferrer" className="icon-btn icon-btn--li" title="LinkedIn">
              in
            </a>
          )}
          {ponty_url && (
            <a href={ponty_url} target="_blank" rel="noopener noreferrer" className="icon-btn icon-btn--po" title="Öppna i Ponty">
              P
            </a>
          )}
          <button
            className={`eu-btn ${d.eu ? 'eu-btn--ja' : 'eu-btn--nej'}`}
            onClick={() => set('eu', !d.eu)}
            title="EU / Arbetstillstånd"
          >
            🇸🇪 {d.eu ? 'Ja' : 'Nej'}
          </button>
        </div>
      </footer>
    </article>
  )
}

function Row({ label, children }) {
  return (
    <div className="field-row">
      <span className="field-lbl">{label}</span>
      <div className="field-val">{children}</div>
    </div>
  )
}
