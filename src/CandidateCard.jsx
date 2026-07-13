import { useState } from 'react'

const TECH = [
  'React','Vue','Angular','Svelte','Next.js','Nuxt','Remix',
  'TypeScript','JavaScript','Node.js','Express','Fastify',
  'Python','Django','FastAPI','Flask','Java','Spring','Kotlin',
  'Swift','Go','Rust','C#','.NET','PHP','Ruby','Rails',
  'AWS','Azure','GCP','Docker','Kubernetes','Terraform','Linux','CI/CD',
  'PostgreSQL','MySQL','MongoDB','Redis','Elasticsearch','Kafka',
  'GraphQL','REST','gRPC','Microservices','Serverless',
  'Machine Learning','ML','AI','LLM','TensorFlow','PyTorch','OpenAI',
  'React Native','Flutter','Tailwind','Figma',
  'Git','GitHub','GitLab','Agile','Scrum',
]

function extractTech(texts) {
  const combined = texts.join(' ').toLowerCase()
  const found = []
  for (const t of TECH) {
    if (combined.includes(t.toLowerCase()) && !found.includes(t)) found.push(t)
  }
  return found
}

export default function CandidateCard({ candidate }) {
  const { id, name, role, organization, ponty_url, linkedin, notes } = candidate
  const [open, setOpen] = useState(false)
  const [userNote, setUserNote] = useState(() => localStorage.getItem(`note-${id}`) || '')

  const notesText = notes.join('\n')
  const tech = extractTech([role ?? '', notesText])
  const hasContent = notesText || true // always show notes area when expanded

  return (
    <div className={`card${open ? ' card--open' : ''}`}>
      {/* always-visible top section */}
      <div className="card-body" onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}>

        <div className="card-header">
          <span className="candidate-name">{name}</span>
          <span className="expand-btn" aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? '−' : '+'}
          </span>
        </div>

        {role && <p className="candidate-role">{role}</p>}
        {organization && <p className="candidate-org">{organization}</p>}

        {tech.length > 0 && (
          <div className="tech-list">
            {tech.map(t => <span key={t} className="tech-pill">{t}</span>)}
          </div>
        )}

        <div className="card-links" onClick={e => e.stopPropagation()}>
          {linkedin && (
            <a href={linkedin} target="_blank" rel="noopener noreferrer" className="pill-link pill-link--linkedin">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              LinkedIn
            </a>
          )}
          {ponty_url && (
            <a href={ponty_url} target="_blank" rel="noopener noreferrer" className="pill-link pill-link--ponty">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
              </svg>
              Ponty
            </a>
          )}
        </div>
      </div>

      {/* expanded section */}
      {open && (
        <div className="card-expanded">
          {notesText && (
            <div className="notes-block">
              <p className="notes-label">Notes from Ponty</p>
              <p className="notes-text">{notesText}</p>
            </div>
          )}
          <div className="notes-block">
            <p className="notes-label">Your notes</p>
            <textarea
              className="notes-input"
              value={userNote}
              onChange={e => {
                setUserNote(e.target.value)
                localStorage.setItem(`note-${id}`, e.target.value)
              }}
              placeholder="Add your notes about this candidate…"
              rows={3}
            />
          </div>
        </div>
      )}
    </div>
  )
}
