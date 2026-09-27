import { useNavigate } from 'react-router-dom'
import { isAttentionRequired, staffCanSee } from '../data'
import { StatusBadge } from '../ui.jsx'
import { useCampus } from '../CampusContext.jsx'

const QUEUE_SECTIONS = [
  { status: 'NEW', title: 'New', description: 'Cases requiring triage.' },
  { status: 'IN PROGRESS', title: 'In progress', description: 'Cases actively handled by your department.' },
  { status: 'COORDINATION REQUIRED', title: 'Coordination', description: 'Cases with an open task or a result awaiting owning-department review.' },
  { status: 'UNDER REVIEW', title: 'Under review', description: 'Verify the outcome before resolving.' },
  { status: 'RESOLVED', title: 'Resolved', description: 'Completed cases.' },
]

function CaseRow({ caze, session, navigate }) {
  return (
    <div className="queue-row" key={caze.id} onClick={() => navigate(`/staff/cases/${caze.id}`)}>
      <span className="mono">{caze.id}</span>
      <div>
        <strong>{caze.studentName}</strong>
        <div className="hint">{caze.issueCategory} · {caze.title}</div>
      </div>
      <span>{caze.owner?.name ? `Handled by ${caze.owner.name}` : 'Unclaimed'}</span>
      <span className="hint">{caze.assignedDepartment === session.department ? 'Owning case' : 'Supporting access'}</span>
      <span className="queue-signals">
        {isAttentionRequired(caze) && <span className="attention-badge">Attention required</span>}
        <StatusBadge status={caze.status} />
      </span>
    </div>
  )
}

export default function StaffHome() {
  const { cases, session } = useCampus()
  const navigate = useNavigate()
  const visible = cases.filter((caze) => staffCanSee(caze, session.department))
  const owning = visible.filter((caze) => caze.assignedDepartment === session.department)
  const assignedTasks = visible.flatMap((caze) =>
    (caze.internalTasks || [])
      .filter((task) => task.to === session.department && task.status === 'open')
      .map((task) => ({ ...task, caseId: caze.id, studentName: caze.studentName })),
  )
  const supporting = visible.filter((caze) =>
    caze.assignedDepartment !== session.department &&
    (caze.accessGrants || []).some((grant) => grant.department === session.department),
  )

  return (
    <div className="page">
      <p className="kicker">{session.department}</p>
      <h1 className="h1">Department work queue</h1>
      <p className="lede">
        Your department owns its assigned cases. Supporting work stays attached to the owning case, with access only when it has been shared.
      </p>

      {assignedTasks.length > 0 && (
        <section className="card queue-section">
          <div className="queue-section-heading">
            <div><p className="kicker">Assigned to your department</p><h2 className="section-title">Internal tasks</h2></div>
            <span className="queue-count">{assignedTasks.length}</span>
          </div>
          {assignedTasks.map((task) => (
            <div className="queue-row task-queue-row" key={task.id} onClick={() => navigate(`/staff/cases/${task.caseId}`)}>
              <span className="mono">{task.caseId}</span>
              <div><strong>{task.title}</strong><div className="hint">{task.studentName} · from {task.from}</div></div>
              <span className="hint">Supporting task · Open</span>
              <span>Open task</span>
            </div>
          ))}
        </section>
      )}

      <div className="staff-queue-sections">
        {QUEUE_SECTIONS.map((section) => {
          const rows = owning
            .filter((caze) => caze.status === section.status)
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          return (
            <section className="card queue-section" key={section.status}>
              <div className="queue-section-heading">
                <div><p className="kicker">{section.title}</p><p className="hint">{section.description}</p></div>
                <span className="queue-count">{rows.length}</span>
              </div>
              {rows.length === 0
                ? <p className="hint">No {section.title.toLowerCase()} cases.</p>
                : rows.map((caze) => <CaseRow key={caze.id} caze={caze} session={session} navigate={navigate} />)}
            </section>
          )
        })}
      </div>

      {supporting.length > 0 && (
        <section className="card queue-section">
          <div className="queue-section-heading">
            <div><p className="kicker">Need-to-know access</p><h2 className="section-title">Supporting cases</h2></div>
            <span className="queue-count">{supporting.length}</span>
          </div>
          {supporting.map((caze) => <CaseRow key={caze.id} caze={caze} session={session} navigate={navigate} />)}
        </section>
      )}
    </div>
  )
}
