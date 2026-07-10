export default function CandidateCard({ candidate }) {
  const { name, role, ponty_url } = candidate

  return (
    <div className="candidate-card">
      <p className="candidate-name">{name}</p>
      {role && <p className="candidate-role">{role}</p>}
      {ponty_url && (
        <a href={ponty_url} target="_blank" rel="noopener noreferrer" className="ponty-link">
          Open in Ponty →
        </a>
      )}
    </div>
  )
}
