import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DEPARTMENTS, PRIORITIES, formatWhen, getJourneyCases, staffCanSee, visibilityReason } from '../data'
import { DocumentList, Modal, StatusBadge, Timeline } from '../ui.jsx'
import { useCampus } from '../CampusContext.jsx'

function briefFor(caze, openTasks) {
  const description = caze.description.trim()
  const documentSummary = caze.documents?.length
    ? `${caze.documents.length} document${caze.documents.length === 1 ? '' : 's'} attached: ${caze.documents.map((item) => item.name).join(', ')}.`
    : 'No documents are attached.'
  const descriptionSummary = description ? `${description.replace(/[.!?]+$/, '')}. ` : ''
  const suggestedDepartment = /workshop|event|participat|attendance credit/i.test(`${caze.title} ${description}`)
    ? DEPARTMENTS.find((department) => department.name === 'Event & Workshop Cell' && department.name !== caze.assignedDepartment)?.name
    : null
  const nextAction = caze.status === 'NEW'
    ? 'Start working to triage the request.'
    : caze.status === 'IN PROGRESS'
      ? openTasks.length
        ? `Follow up with ${openTasks[0].to} on the pending task.`
        : 'Review the request and decide whether to coordinate, request information, or move to outcome review.'
      : caze.status === 'COORDINATION REQUIRED'
        ? openTasks.length
          ? `Wait for ${openTasks[0].to} to complete the requested task.`
          : 'Review the completed coordination result and move the case to under review.'
        : caze.status === 'UNDER REVIEW'
          ? caze.outcomeVerified
            ? 'Resolve the case with a clear outcome for the student.'
            : 'Verify the outcome before resolving the case.'
          : 'The case is resolved; no further action is available.'
  return {
    summary: `${caze.issueCategory} case “${caze.title}” is assigned to ${caze.assignedDepartment}. ${descriptionSummary || 'The student did not provide a description. '}${documentSummary}`,
    nextAction,
    suggestedDepartment,
    rationale: suggestedDepartment
      ? `The submitted description references event or workshop participation; that department may be able to verify participation. Confirm this is needed before sharing the case.`
      : 'No additional department is inferred from the available structured details. Coordinate only when the case requires another team.',
  }
}

export default function StaffCase() {
  const { id } = useParams()
  const ctx = useCampus()
  const { cases, session } = ctx
  const caze = cases.find((item) => item.id === id)
  const [modal, setModal] = useState(null)
  const [text, setText] = useState('')
  const [toDepartment, setToDepartment] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskToComplete, setTaskToComplete] = useState(null)

  if (!caze || !staffCanSee(caze, session.department)) {
    return <div className="page"><p>This case is outside your need-to-know access.</p><Link to="/staff">Back to queue</Link></div>
  }

  const journey = getJourneyCases(cases, caze)
  const root = journey.find((item) => item.id === (caze.parentCaseReference || caze.id))
  const tasks = journey.flatMap((item) => (item.internalTasks || []).map((task) => ({ ...task, caseId: item.id })))
  const openTasks = tasks.filter((task) => task.status === 'open')
  const pendingCurrentTasks = (caze.internalTasks || []).filter((task) => task.status === 'open')
  const isOwner = caze.assignedDepartment === session.department
  const isResolved = caze.status === 'RESOLVED'
  const departments = [...new Set([
    ...journey.map((item) => item.assignedDepartment),
    ...journey.flatMap((item) => item.involvedDepartments || []),
    ...tasks.flatMap((task) => [task.from, task.to]),
  ])]
  const journeyTimeline = journey.flatMap((item) => item.timeline.map((event) => ({ ...event, caseId: item.id })))
    .sort((a, b) => new Date(a.at) - new Date(b.at))
  const brief = briefFor(caze, openTasks)
  const suggestedAction = isResolved
    ? 'No further action — this case is resolved.'
    : caze.status === 'NEW'
      ? 'Start working to begin triage.'
      : caze.status === 'IN PROGRESS'
        ? openTasks.length ? `Waiting for ${openTasks[0].to} to complete its task.` : 'Continue review or coordinate a supporting step.'
        : caze.status === 'COORDINATION REQUIRED'
          ? openTasks.length ? `Waiting for ${openTasks[0].to} to complete verification.` : 'Review the coordination result.'
          : caze.outcomeVerified ? 'Resolve the case with the verified outcome.' : 'Verify the outcome before resolution.'
  const bottleneck = isResolved
    ? 'None — case resolved.'
    : caze.waitingOnStudent
      ? 'Waiting for the student to provide requested information.'
      : openTasks.length
        ? `Waiting for ${openTasks[0].to} to complete “${openTasks[0].title}”.`
        : caze.status === 'UNDER REVIEW' && !caze.outcomeVerified
          ? 'Owning department verification is required.'
          : 'No active dependency is recorded.'
  const documentCount = journey.reduce((count, item) => count + (item.documents || []).length, 0)
  const activeCaseCount = journey.filter((item) => item.status !== 'RESOLVED').length
  const others = DEPARTMENTS.filter((department) => department.name !== session.department)
  const recommendedDepartment = others.some((item) => item.name === brief.suggestedDepartment)
    ? brief.suggestedDepartment
    : others[0]?.name || ''

  const close = () => {
    setModal(null)
    setText('')
    setTaskTitle('')
    setTaskToComplete(null)
  }

  const startCoordination = () => {
    setToDepartment(recommendedDepartment)
    setTaskTitle(brief.suggestedDepartment
      ? 'Verify student participation in the event or workshop'
      : '')
    setText('')
    setModal('coordinate')
  }

  return (
    <div className="page staff-case-page">
      <p className="kicker"><Link to="/staff">Department queue</Link> · {caze.id} · {visibilityReason(caze, session.department)}</p>
      <div className="case-heading">
        <div>
          <h1 className="h1">{caze.title}</h1>
          <p className="lede" style={{ margin: '8px 0 0' }}>{caze.studentName} · {caze.studentProgramme} · Student ID {caze.studentId}</p>
        </div>
        <div className="case-signals"><StatusBadge status={caze.status} /><span className="chip">Priority · {caze.priority}</span></div>
      </div>

      <section className="card staff-case-summary">
        <div className="case-summary-item"><span>Case</span><strong>{caze.id}</strong></div>
        <div className="case-summary-item"><span>Student</span><strong>{caze.studentName}</strong></div>
        <div className="case-summary-item"><span>Category</span><strong>{caze.issueCategory}</strong></div>
        <div className="case-summary-item"><span>Owning department</span><strong>{caze.assignedDepartment}</strong></div>
        <div className="case-summary-item"><span>Submitted</span><strong>{formatWhen(caze.createdAt)}</strong></div>
        <div className="case-summary-item"><span>Last updated</span><strong>{formatWhen(caze.updatedAt)}</strong></div>
        <div className="case-summary-item"><span>Handled by</span><strong>{caze.owner?.name || 'Not yet taken'}</strong></div>
      </section>

      <section className="card case-brief">
        <div className="section-heading">
          <div><p className="kicker">AI case brief</p><h2 className="section-title">Staff decision support</h2></div>
          <span className="hint">Deterministic brief · no LLM service is configured</span>
        </div>
        <p>{brief.summary}</p>
        <div className="brief-next-action"><strong>Suggested next action</strong><span>{brief.nextAction}</span></div>
        <div className="brief-coordination">
          <strong>Suggested coordination</strong>
          <span>{brief.suggestedDepartment || 'No additional department indicated'}</span>
          <p className="hint">{brief.rationale}</p>
        </div>
        <p className="hint">This brief summarizes submitted fields and document metadata only. It does not inspect document contents, infer risk, or change the case.</p>
      </section>

      <section className="card workflow-panel">
        <div className="section-heading">
          <div><p className="kicker">Action panel</p><h2 className="section-title">Case workflow</h2></div>
          <StatusBadge status={caze.status} />
        </div>
        {!isOwner && <p className="callout">Supporting access only. {caze.assignedDepartment} owns this case; your department can complete only tasks assigned to it.</p>}
        {isResolved ? (
          <div className="callout"><strong>Resolved — workflow closed.</strong><p>{caze.outcomeVerification || caze.timeline.find((event) => event.type === 'CASE_RESOLVED')?.body || 'The case has been resolved.'}</p></div>
        ) : isOwner && caze.status === 'NEW' ? (
          <button className="btn" type="button" onClick={() => ctx.startCase(caze.id)}>Start Working</button>
        ) : isOwner && caze.status === 'IN PROGRESS' ? (
          <div className="actions">
            <button className="btn secondary" type="button" onClick={() => setModal('note')}>Add Internal Note</button>
            <button className="btn secondary" type="button" onClick={() => setModal('request')}>Request Information</button>
            <button className="btn teal" type="button" onClick={startCoordination}>Coordinate Internally</button>
            <button className="btn" type="button" onClick={() => ctx.moveToUnderReview(caze.id)}>Move to Under Review</button>
          </div>
        ) : isOwner && caze.status === 'COORDINATION REQUIRED' ? (
          <div>
            <p><strong>Internal coordination is active.</strong> The student does not need to visit another office.</p>
            {pendingCurrentTasks.length === 0 && <p className="hint">All tasks are completed. Review the result, then move this case to under review.</p>}
            {pendingCurrentTasks.length > 0 && <p className="hint">Waiting on {pendingCurrentTasks.map((task) => task.to).join(', ')} to complete the assigned task.</p>}
            <button className="btn" type="button" disabled={pendingCurrentTasks.length > 0} onClick={() => ctx.moveToUnderReview(caze.id)}>Move to Under Review</button>
          </div>
        ) : isOwner && caze.status === 'UNDER REVIEW' ? (
          <div className="actions">
            <button className="btn secondary" type="button" onClick={() => { setText(caze.outcomeVerification || ''); setModal('verify') }}>Verify Outcome</button>
            <button className="btn" type="button" disabled={!caze.outcomeVerified} onClick={() => { setText(caze.outcomeVerification || ''); setModal('resolve') }}>Resolve Case</button>
            {!caze.outcomeVerified && <span className="hint">Verify the outcome before resolution.</span>}
          </div>
        ) : null}
      </section>

      <div className="grid staff-case-grid">
        <div className="staff-main-column">
          <section className="card">
            <div className="section-heading">
              <div><p className="kicker">Case record</p><h2 className="section-title">{caze.issueCategory} · {caze.id}</h2></div>
              <label className="compact-control">Priority
                <select value={caze.priority} disabled={!isOwner || isResolved} onChange={(event) => ctx.changePriority(caze.id, event.target.value)}>
                  {PRIORITIES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
            <p>{caze.description}</p>
            {caze.helpNeeded && <p><strong>Help needed:</strong> {caze.helpNeeded}</p>}
            {caze.waitingOnStudent && <div className="callout"><strong>Information requested</strong><p>{caze.waitingOnStudent.message}</p></div>}
            <div className="meta" style={{ marginTop: 12 }}>
              <div className="meta-item"><span>Assigned department</span><strong>{caze.assignedDepartment}</strong></div>
              <div className="meta-item"><span>Next action</span><strong>{caze.nextAction}</strong></div>
            </div>
            <p className="kicker" style={{ marginTop: 18 }}>Documents</p>
            <DocumentList documents={caze.documents} />
          </section>

          <section className="card">
            <p className="kicker">Journey lens</p>
            <h2 className="section-title">Connected student journey</h2>
            <div className="journey-metrics">
              <div><strong>{activeCaseCount}</strong><span>active cases</span></div>
              <div><strong>{departments.length}</strong><span>departments involved</span></div>
              <div><strong>{tasks.length}</strong><span>coordination tasks</span></div>
              <div><strong>{documentCount}</strong><span>documents submitted</span></div>
            </div>
            <div className="callout journey-bottleneck"><strong>Current bottleneck</strong><div>{bottleneck}</div></div>
            <div className="callout"><strong>Suggested next action</strong><div>{suggestedAction}</div></div>
            {journey.length > 1 && <div className="journey-list">
              {journey.map((item) => <div className="journey-item" key={item.id}>
                <Link to={`/staff/cases/${item.id}`} className="mono">{item.id}</Link>
                <span>{item.assignedDepartment}</span><StatusBadge status={item.status} />
                <span className="hint">{item.parentCaseReference ? `Child of ${item.parentCaseReference}` : 'Parent case'}</span>
              </div>)}
            </div>}
          </section>

          {caze.parentCaseReference && root && (
            <section className="card quiet">
              <p className="kicker">Shared context carried forward</p>
              <h2 className="section-title">{root.assignedDepartment} · {root.id}</h2>
              <p><strong>Previous issue:</strong> {root.issueCategory} — {root.title}</p>
              <p>{root.description}</p>
            </section>
          )}
        </div>
        <div className="staff-main-column">
          <section className="card">
            <p className="kicker">Coordination work</p>
            <h2 className="section-title">Internal tasks</h2>
            {tasks.length === 0 && <p className="hint">No coordination tasks have been created for this journey.</p>}
            {tasks.map((task) => (
              <article className="task-card" key={task.id}>
                <div className="section-heading"><strong>{task.title}</strong><span className={`task-state ${task.status}`}>{task.status === 'open' ? 'Pending' : 'Completed'}</span></div>
                <p className="hint">{task.from} → {task.to} · Case {task.caseId}</p>
                {task.detail && <p>{task.detail}</p>}
                {task.completionNote && <p><strong>Result:</strong> {task.completionNote}</p>}
                {task.completedAt && <p className="hint">Completed {formatWhen(task.completedAt)}</p>}
                {task.status === 'open' && task.to === session.department && !isResolved && (
                  <button className="btn teal" type="button" onClick={() => { setTaskToComplete(task); setText(''); setModal('complete') }}>Complete assigned task</button>
                )}
              </article>
            ))}
          </section>
          <section className="card quiet"><p className="kicker">Case timeline</p><Timeline events={journeyTimeline} staff /></section>
        </div>
      </div>

      {modal === 'request' && <Modal title="Request information from the student" onClose={close} footer={<button className="btn" type="button" onClick={() => { if (ctx.requestFromStudent(caze.id, text)) close() }} disabled={!text.trim()}>Send request</button>}>
        <label>What information is needed?<textarea required value={text} onChange={(event) => setText(event.target.value)} /></label>
      </Modal>}
      {modal === 'note' && <Modal title="Add an internal note" onClose={close} footer={<button className="btn" type="button" onClick={() => { if (ctx.addInternalNote(caze.id, text)) close() }} disabled={!text.trim()}>Save note</button>}>
        <label>Internal note<textarea required value={text} onChange={(event) => setText(event.target.value)} /></label><p className="hint">Only staff with case access can see this note.</p>
      </Modal>}
      {modal === 'coordinate' && <Modal title="Coordinate internally" onClose={close} footer={<button className="btn" type="button" onClick={() => { if (ctx.createInternalTask(caze.id, { toDepartment, title: taskTitle, detail: text })) close() }} disabled={!taskTitle.trim() || !toDepartment}>Create coordination task</button>}>
        <p className="hint">The supporting department receives need-to-know access to this case. The student will be told that teams are coordinating internally.</p>
        <label>Supporting department<select value={toDepartment} onChange={(event) => setToDepartment(event.target.value)}>{others.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}</select></label>
        <label>Task title<input required value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="What should the supporting team verify?" /></label>
        <label>Task details<textarea value={text} onChange={(event) => setText(event.target.value)} /></label>
      </Modal>}
      {modal === 'verify' && <Modal title="Verify the outcome" onClose={close} footer={<button className="btn" type="button" onClick={() => { if (ctx.verifyOutcome(caze.id, text)) close() }}>Confirm verification</button>}>
        <label>Verification note<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Record what was checked and the outcome." /></label>
        <p className="hint">This note is internal. Once verified, the owning department can resolve the case.</p>
      </Modal>}
      {modal === 'resolve' && <Modal title="Resolve this case" onClose={close} footer={<button className="btn" type="button" onClick={() => { if (ctx.resolveCase(caze.id, text)) close() }} disabled={!text.trim()}>Resolve case</button>}>
        <label>Resolution for the student<textarea required value={text} onChange={(event) => setText(event.target.value)} /></label>
      </Modal>}
      {modal === 'complete' && taskToComplete && <Modal title="Complete assigned task" onClose={close} footer={<button className="btn" type="button" onClick={() => { if (ctx.completeTask(taskToComplete.caseId, taskToComplete.id, text)) close() }}>Mark task complete</button>}>
        <p><strong>{taskToComplete.title}</strong></p><label>Verification result<textarea value={text} onChange={(event) => setText(event.target.value)} /></label>
      </Modal>}
    </div>
  )
}
