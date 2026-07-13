import { useRef } from 'react'

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

export default function CandidateCard({ candidate, savedData = {}, onUpdate, index = 0 }) {
  const { id, name, role: pontyRole, organization, linkedin, ponty_url, notes } = candidate
  const textRef = useRef(null)

  const defaultStack = extractTech([...notes, pontyRole ?? ''])
  const d = {
    role: pontyRole ?? '',
    stack: defaultStack,
    city: '',
    work_pref: 'Hybrid',
    salary: '',
    experience: '',
    note: notes.join(' '),
    stage_idx: 0,
    eu: true,
    ...savedData,
  }

  const set = (key, val) => onUpdate(id, { [key]: val })
  const stage = STAGES[d.stage_idx] ?? STAGES[0]
  const cycleStage = () => set('stage_idx', (d.stage_idx + 1) % STAGES.length)
  const cycleWork = () => {
    const i = WORK_PREFS.indexOf(d.work_pref)
    set('work_pref', WORK_PREFS[(i + 1) % WORK_PREFS.length])
  }

  const rot = ROTATIONS[index % ROTATIONS.length]

  return (
    <article className="card" style={{ '--rot': `${rot}deg` }}>
      <div className="pushpin" aria-hidden="true" />

      <p className="card-name">{name}</p>

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
        <button
          className="stage-stamp"
          style={{ '--sc': stage.color }}
          onClick={cycleStage}
          title="Klicka för att ändra status"
        >
          {stage.label}
        </button>

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
