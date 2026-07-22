import { useEffect, useRef, useState } from 'react'

const STAGES = [
  { label: 'Ny kandidat',  color: '#64748B' },
  { label: 'Intresserad',  color: '#2563EB' },
  { label: 'Intervju #1', color: '#D97706' },
  { label: 'Intervju #2', color: '#DC2626' },
  { label: 'Erbjudande',  color: '#16A34A' },
]

const TIER_COLORS = { 1: '#F59E0B', 2: '#94A3B8', 3: '#B45309' }
const TIER_NAMES  = { 1: 'Tier 1 — Senior', 2: 'Tier 2 — Mid', 3: 'Tier 3 — Junior' }
const WORK_PREFS  = ['Hybrid', 'Remote', 'On-site']
const AI_FIELDS   = new Set(['role', 'stack', 'city', 'experience', 'note'])

export default function CandidateModal({ candidate, savedData = {}, onUpdate, onClose }) {
  const { id, name, role: pontyRole, organization, linkedin, ponty_url, notes, tier, tier_reason, ai_suggestions } = candidate

  const ai = ai_suggestions ?? {}
  const d  = {
    role: pontyRole ?? '', stack: ai.stack ?? '', city: ai.city ?? '',
    work_pref: 'Hybrid', salary: '', experience: ai.experience ?? '',
    note: ai.note ?? notes.join(' '), stage_idx: 0, eu: true,
  }
  for (const [key, val] of Object.entries(savedData)) {
    if (AI_FIELDS.has(key)) { if (val !== '' && val != null) d[key] = val }
    else d[key] = val
  }

  const set   = (key, val) => onUpdate(id, { [key]: val })
  const stage = STAGES[d.stage_idx] ?? STAGES[0]

  const [dropOpen, setDropOpen] = useState(false)
  const dropRef  = useRef(null)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">

        <div className="modal-header">
          <div className="modal-title-row">
            {tier && (
              <span className="tier-badge modal-tier" style={{ '--tc': TIER_COLORS[tier] }}>
                {TIER_NAMES[tier] ?? `T${tier}`}
              </span>
            )}
            <h2 className="modal-name">{name}</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Stäng">✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-meta">
            <input
              className="modal-role-input f-input"
              value={d.role}
              onChange={e => set('role', e.target.value)}
              placeholder="Titel / Roll"
            />
            {organization && <span className="modal-org">{organization}</span>}
          </div>

          {tier_reason && (
            <p className="modal-tier-reason">{tier_reason}</p>
          )}

          {(d.note) && (
            <div className="modal-section">
              <span className="modal-section-lbl">Sammanfattning</span>
              <textarea
                className="modal-note f-input"
                value={d.note}
                onChange={e => set('note', e.target.value)}
                placeholder="Anteckningar, bakgrund, EU-medborgare, work permit…"
                rows={3}
              />
            </div>
          )}

          <div className="modal-section">
            <span className="modal-section-lbl">Detaljer</span>
            <div className="modal-fields">
              <div className="modal-field">
                <span className="field-lbl">Stack</span>
                <input className="f-input modal-field-input" value={d.stack} onChange={e => set('stack', e.target.value)} placeholder="React, TypeScript…" />
              </div>
              <div className="modal-field">
                <span className="field-lbl">Erfarenhet</span>
                <input className="f-input modal-field-input" value={d.experience} onChange={e => set('experience', e.target.value)} placeholder="7 år" />
              </div>
              <div className="modal-field">
                <span className="field-lbl">Plats</span>
                <div className="modal-plats">
                  <button className="work-tag" onClick={cycleWork}>{d.work_pref}</button>
                  <input className="f-input modal-field-input" value={d.city} onChange={e => set('city', e.target.value)} placeholder="Stockholm" />
                </div>
              </div>
              <div className="modal-field">
                <span className="field-lbl">Lön</span>
                <input className="f-input modal-field-input" value={d.salary} onChange={e => set('salary', e.target.value)} placeholder="70–80 000 kr" />
              </div>
            </div>
          </div>

          {!d.note && (
            <div className="modal-section">
              <span className="modal-section-lbl">Anteckningar</span>
              <textarea
                className="modal-note f-input"
                value={d.note}
                onChange={e => set('note', e.target.value)}
                placeholder="Anteckningar, bakgrund, EU-medborgare, work permit…"
                rows={3}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
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
              <a href={linkedin} target="_blank" rel="noopener noreferrer" className="icon-btn icon-btn--li" title="LinkedIn">in</a>
            )}
            {ponty_url && (
              <a href={ponty_url} target="_blank" rel="noopener noreferrer" className="icon-btn icon-btn--po" title="Öppna i Ponty">P</a>
            )}
            <button
              className={`eu-btn ${d.eu ? 'eu-btn--ja' : 'eu-btn--nej'}`}
              onClick={() => set('eu', !d.eu)}
              title="EU / Arbetstillstånd"
            >
              EU {d.eu ? 'Ja' : 'Nej'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
