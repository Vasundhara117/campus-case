import { useNavigate } from 'react-router-dom'
import { counselorWorkload, isAttentionRequired, staffCanSee } from '../data'
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
  const restrictedWellbeing = caze.assignedDepartment === 'Wellbeing Cell' &&
    caze.assignedDepartment !== session.department
  return (
    <div className="queue-row" key={caze.id} onClick={() => navigate(`/staff/cases/${caze.id}`)}>
      <span className="mono">{caze.id}</span>
      <div>
        <strong>{restrictedWellbeing ? 'Wellbeing support request' : caze.studentName}</strong>
        <div className="hint">{restrictedWellbeing ? 'Academic support task' : `${caze.issueCategory} · ${caze.title}`}</div>
      </div>
      <span>{restrictedWellbeing
        ? 'Wellbeing Cell'
        : caze.assignedCounselor
          ? `Assigned to ${caze.assignedCounselor.name}`
          : caze.owner?.name
            ? `Handled by ${caze.owner.name}`
            : 'Not yet taken'}</span>
      <span className="hint">{caze.assignedDepartment === session.department ? 'Owning case' : 'Supporting access'}</span>
      <span className="queue-signals">
        {isAttentionRequired(caze) && <span className="attention-badge">Attention required</span>}
        <StatusBadge status={caze.status} />
      </span>
    </div>
  )
}

export default function StaffHome() {
  const { cases, session, counselors, updateCounselorAvailability } = useCampus()
  const navigate = useNavigate()
  const visible = cases.filter((caze) => staffCanSee(caze, session.department))
  const owning = visible.filter((caze) => caze.assignedDepartment === session.department)
  const counselingCell = session.department === 'Wellbeing Cell'
  const myCases = counselingCell
    ? owning.filter((caze) => caze.assignedCounselor?.id === session.staffId)
    : owning
  const queueCases = counselingCell ? myCases : owning
  const awaitingAssignment = counselingCell
    ? owning.filter((caze) => caze.status === 'NEW' && !caze.assignedCounselor)
    : []
  const workload = counselorWorkload(cases, counselors)
  const assignedTasks = visible.flatMap((caze) =>
    (caze.internalTasks || [])
      .filter((task) => task.to === session.department && task.status !== 'done')
      .map((task) => ({
        ...task,
        caseId: caze.id,
        restrictedWellbeing: caze.assignedDepartment === 'Wellbeing Cell',
        studentName: caze.studentName,
      })),
  )
  const supporting = visible.filter((caze) =>
    caze.assignedDepartment !== session.department &&
    (caze.accessGrants || []).some((grant) => grant.department === session.department) &&
    !(caze.internalTasks || []).some((task) => task.to === session.department),
  )

  return (
    <div className="page">
      <p className="kicker">{counselingCell ? 'Counseling Cell' : session.department}</p>
      <h1 className="h1">{counselingCell ? 'Counselor case queue' : 'Department work queue'}</h1>
      <p className="lede">
        {counselingCell
          ? 'Cases stay with the assigned counselor and the Counseling Cell coordinates supporting work inside the same student journey.'
          : 'Your department owns its assigned cases. Supporting work stays attached to the owning case, with access only when it has been shared.'}
      </p>

      {counselingCell && (
        <section className="card counselor-dashboard">
            <p className="kicker">My Work · {session.name}</p>
            <div className="counselor-metrics">
              {[
                ['Assigned to Me', myCases.filter((caze) => caze.status !== 'RESOLVED').length],
                ['New', myCases.filter((caze) => caze.status === 'NEW').length],
                ['In Progress', myCases.filter((caze) => caze.status === 'IN PROGRESS').length],
                ['Needs My Review', myCases.filter((caze) => caze.status === 'UNDER REVIEW').length],
                ['Needs Coordination', myCases.filter((caze) => caze.status === 'COORDINATION REQUIRED').length],
                ['My Resolved Cases', myCases.filter((caze) => caze.status === 'RESOLVED').length],
              ].map(([label, count]) => (
                <div className="counselor-metric" key={label}><strong>{count}</strong><span>{label}</span></div>
              ))}
            </div>
        </section>
      )}

      {assignedTasks.length > 0 && (
        <section className="card queue-section">
          <div className="queue-section-heading">
            <div><p className="kicker">Assigned to your department</p><h2 className="section-title">Internal tasks</h2></div>
            <span className="queue-count">{assignedTasks.length}</span>
          </div>
          {assignedTasks.map((task) => (
            <div className="queue-row task-queue-row" key={task.id} onClick={() => navigate(`/staff/cases/${task.caseId}`)}>
              <span className="mono">{task.caseId}</span>
              <div>
                <strong>{task.restrictedWellbeing ? 'Review academic support options' : task.title}</strong>
                <div className="hint">{task.restrictedWellbeing ? 'Wellbeing support request · from Wellbeing Cell' : `${task.studentName} · from ${task.from}`}</div>
              </div>
              <span className="hint">Supporting task · {task.status === 'in-progress' ? 'In progress' : 'New'}</span>
              <span>Open task</span>
            </div>
          ))}
        </section>
      )}

      <div className="staff-queue-sections">
        {QUEUE_SECTIONS.map((section) => {
          const title = counselingCell && section.status === 'UNDER REVIEW'
            ? 'Needs My Review'
            : counselingCell && section.status === 'RESOLVED'
              ? 'My Resolved Cases'
              : section.title
          const rows = queueCases
            .filter((caze) => caze.status === section.status)
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          return (
            <section className="card queue-section" key={section.status}>
              <div className="queue-section-heading">
                <div><p className="kicker">{title}</p><p className="hint">{counselingCell ? `Cases assigned to ${session.name}.` : section.description}</p></div>
                <span className="queue-count">{rows.length}</span>
              </div>
              {rows.length === 0
                ? <p className="hint">{counselingCell && section.status === 'RESOLVED' ? 'No resolved cases assigned to you.' : `No ${title.toLowerCase()} cases.`}</p>
                : rows.map((caze) => <CaseRow key={caze.id} caze={caze} session={session} navigate={navigate} />)}
            </section>
          )
        })}
      </div>

      {counselingCell && (
        <section className="card queue-section counselor-availability">
          <div className="queue-section-heading">
            <div><p className="kicker">Team status</p><p className="hint">Automatic assignment selects an available counselor with the lowest active workload.</p></div>
          </div>
          <div className="counselor-list">
            {workload.filter((counselor) => counselor.department === session.department).map((counselor) => (
              <div className="counselor-row" key={counselor.id}>
                <div>
                  <strong>{counselor.name}</strong>
                  <div className="hint">{counselor.role} · {counselor.availability} · {counselor.activeCaseCount} active</div>
                </div>
                {counselor.id === session.staffId && counselor.activeCaseCount === 0 && (
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => updateCounselorAvailability(
                      counselor.id,
                      counselor.availability === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE',
                    )}
                  >
                    {counselor.availability === 'AVAILABLE' ? 'Set Offline' : 'Set Available'}
                  </button>
                )}
              </div>
            ))}
          </div>
          {awaitingAssignment.length > 0 && (
            <div className="queue-section">
              <div className="queue-section-heading">
                <div><p className="kicker">Awaiting counselor assignment</p><p className="hint">No available counselor was found at intake.</p></div>
                <span className="queue-count">{awaitingAssignment.length}</span>
              </div>
              {awaitingAssignment.map((caze) => (
                <CaseRow key={caze.id} caze={caze} session={session} navigate={navigate} />
              ))}
            </div>
          )}
        </section>
      )}

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
