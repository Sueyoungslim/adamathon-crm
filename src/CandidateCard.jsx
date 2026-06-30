export default function CandidateCard({ candidate }) {
  const { name, role, notes, phone, email, linkedin } = candidate

  return (
    <div className="candidate-card">
      <div className="candidate-header">
        <h2 className="candidate-name">{name}</h2>
        {role && <span className="candidate-role">{role}</span>}
      </div>

      <div className="candidate-links">
        {email && (
          <a href={`mailto:${email}`} className="link link-email">
            {email}
          </a>
        )}
        {phone && (
          <a href={`tel:${phone}`} className="link link-phone">
            {phone}
          </a>
        )}
        {linkedin && (
          <a href={linkedin} target="_blank" rel="noopener noreferrer" className="link link-linkedin">
            LinkedIn
          </a>
        )}
      </div>

      {notes && notes.length > 0 && (
        <div className="candidate-notes">
          {notes.map((note, i) => (
            <p key={i} className="note">{note.text || note}</p>
          ))}
        </div>
      )}
    </div>
  )
}
