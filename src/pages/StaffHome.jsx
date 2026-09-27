import { useNavigate } from 'react-router-dom'
import { staffCanSee, visibilityReason } from '../data'
import { StatusBadge } from '../ui.jsx'
import { useCampus } from '../CampusContext.jsx'

function bucket(caze) {
  if (caze.status === 'NEW') return 'new'
  if (caze.status === 'WAITING FOR STUDENT') return 'waiting'
  if (caze.status === 'INTERNAL COORDINATION') return 'coord'
  if (caze.status === 'RESOLVED') return 'resolved'
  return 'action'
}

export default function StaffHome() {
  const { cases, session } = useCampus()
  const navigate = useNavigate()
  const visible = cases.filter((c) => staffCanSee(c, session.department))
  const counts = {
    new: visible.filter((c) => bucket(c) === 'new').length,
    action: visible.filter((c) => bucket(c) === 'action').length,
    waiting: visible.filter((c) => bucket(c) === 'waiting').length,
    coord: visible.filter((c) => bucket(c) === 'coord').length,
    resolved: visible.filter((c) => bucket(c) === 'resolved').length,
  }

  return (
    <div className="page">
      <p className="kicker">{session.department}</p>
      <h1 className="h1">Case queue</h1>
      <p className="lede">
        You see cases your cell owns, plus cases where another cell granted need-to-know access.
        Internal work stays on the case — do not send the student to another counter.
      </p>
      <div className="grid stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="card"><p className="kicker">New</p><p className="stat-value">{counts.new}</p></div>
        <div className="card"><p className="kicker">Needs action</p><p className="stat-value">{counts.action}</p></div>
        <div className="card"><p className="kicker">Waiting for student</p><p className="stat-value">{counts.waiting}</p></div>
        <div className="card"><p className="kicker">Internal coordination</p><p className="stat-value">{counts.coord}</p></div>
        <div className="card"><p className="kicker">Resolved</p><p className="stat-value">{counts.resolved}</p></div>
      </div>
      <section className="card" style={{ marginTop: 20 }}>
        <p className="kicker">Visible cases</p>
        {visible.length === 0 && (
          <p>No cases for this cell yet. When Attendance Cell invites you, the case will appear here.</p>
        )}
        {visible.map((c) => (
          <div className="queue-row" key={c.id} onClick={() => navigate(`/staff/cases/${c.id}`)}>
            <span className="mono">{c.id}</span>
            <div>
              <strong>{c.studentName}</strong>
              <div className="hint">{c.title}</div>
            </div>
            <span>{c.owner?.name || 'Unassigned'}</span>
            <span className="hint">{visibilityReason(c, session.department)}</span>
            <StatusBadge status={c.status} />
          </div>
        ))}
      </section>
    </div>
  )
}
