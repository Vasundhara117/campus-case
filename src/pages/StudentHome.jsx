import { Link, useNavigate } from 'react-router-dom'
import { formatWhen } from '../data'
import { StatusBadge } from '../ui.jsx'
import { useCampus } from '../CampusContext.jsx'

export default function StudentHome() {
  const { cases, session } = useCampus()
  const navigate = useNavigate()
  const mine = cases.filter((c) => c.studentId.toLocaleUpperCase() === session.studentId.toLocaleUpperCase())
  const active = mine.filter((c) => c.status !== 'RESOLVED')
  const waiting = mine.filter((c) => Boolean(c.waitingOnStudent) && c.status !== 'RESOLVED')
  const resolved = mine.filter((c) => c.status === 'RESOLVED')
  const activity = mine
    .flatMap((c) => c.timeline.filter((e) => e.visibility !== 'internal').map((e) => ({ ...e, caseId: c.id })))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 5)

  return (
    <div className="page">
      <p className="kicker">Student home</p>
      <h1 className="h1">Hello, {session.name.split(' ')[0]}</h1>
      <p className="lede">Submit one case. We route it and keep every team on the same timeline.</p>
      <div className="grid stats">
        <div className="card"><p className="kicker">Active</p><p className="stat-value">{active.length}</p></div>
        <div className="card"><p className="kicker">Waiting on you</p><p className="stat-value">{waiting.length}</p></div>
        <div className="card"><p className="kicker">Resolved</p><p className="stat-value">{resolved.length}</p></div>
      </div>
      <div style={{ margin: '22px 0' }}>
        <button className="btn" type="button" onClick={() => navigate('/student/new')}>Create new case</button>
      </div>
      <div className="grid grid-2">
        <section className="card">
          <p className="kicker">Your cases</p>
          {mine.length === 0 && <p>No cases yet. Create a case to start your journey.</p>}
          {mine.map((c) => (
            <div className="case-row" key={c.id} onClick={() => navigate(`/student/cases/${c.id}`)}>
              <span className="mono">{c.id}</span>
              <div>
                <strong>{c.title}</strong>
                <div className="hint">{c.assignedDepartment}{c.parentCaseReference ? ` · linked to ${c.parentCaseReference}` : ''}</div>
              </div>
              <StatusBadge status={c.status} student />
            </div>
          ))}
        </section>
        <section className="card quiet">
          <p className="kicker">Recent activity</p>
          {activity.length === 0 && <p className="hint">Updates about your cases will appear here.</p>}
          {activity.map((e) => (
            <p key={e.id}>
              <Link to={`/student/cases/${e.caseId}`}>{e.caseId}</Link> · {e.title}
              <span className="hint"> · {formatWhen(e.at)}</span>
            </p>
          ))}
        </section>
      </div>
    </div>
  )
}
