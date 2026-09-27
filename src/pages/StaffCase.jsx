import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { counselorWorkload, DEPARTMENTS, PRIORITIES, formatWhen, getJourneyCases, staffCanSee, visibilityReason } from '../data'
import { DocumentList, Modal, StatusBadge, Timeline } from '../ui.jsx'
import { useCampus } from '../CampusContext.jsx'

function briefFor(caze, openTasks) {
  if (caze.assignedDepartment === 'Wellbeing Cell') {
    return {
      summary: caze.triage?.summary || caze.aiSummary || 'The student submitted a wellbeing support request.',
      supportAreas: caze.triage?.supportAreas || ['Wellbeing / Counseling'],
      primaryDepartment: caze.triage?.primaryDepartment || 'Wellbeing / Counseling Cell',
      nextAction: caze.status === 'NEW'
        ? caze.assignedCounselor
          ? 'Start working on the assigned case.'
          : caze.triage?.suggestedNextAction || 'Assign the case to an available counselor for initial review.'
        : caze.status === 'COORDINATION REQUIRED'
          ? openTasks.length
            ? 'Wait for Academic Support to report the appropriate next step.'
            : 'Review the Academic Support result and move the request to under review.'
          : caze.status === 'UNDER REVIEW'
            ? 'Verify the next steps and share them with the student.'
            : caze.status === 'RESOLVED'
              ? 'The support request is resolved.'
              : 'Coordinate with Academic Support to review available academic support options.',
      suggestedDepartment: caze.triage?.suggestedDepartment || 'Academic Support',
      rationale: 'This is administrative case triage only. It does not diagnose, predict a condition, or assign a risk score.',
    }
  }
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

function SupportingWellbeingTask({ caze, task, ctx }) {
  const [completionNote, setCompletionNote] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const completed = task.status === 'done'
  return (
    <div className="page">
      <p className="kicker"><Link to="/staff">Department queue</Link> · {caze.id} · Supporting access</p>
      <h1 className="h1">Wellbeing support request</h1>
      <p className="lede">Your department has been asked to provide a focused administrative support recommendation.</p>
      <section className="card">
        <p className="kicker">Support request</p>
        <p>The student is experiencing academic difficulties and has requested coordinated support.</p>
        <p className="kicker">Requested action</p>
        <p>Review available academic support options and report the next step to the Wellbeing Cell.</p>
        <p className="hint">Case {caze.id} · Requesting department: Wellbeing Cell</p>
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <p className="kicker">Task status</p>
        <h2 className="section-title">{completed ? 'Completed' : 'Pending'}</h2>
        {completed && task.completionNote && <p><strong>Result:</strong> {task.completionNote}</p>}
        {completed && task.completedAt && <p className="hint">Completed {formatWhen(task.completedAt)}</p>}
        {!completed && caze.status === 'COORDINATION REQUIRED' && (
          <button className="btn teal" type="button" onClick={() => setModalOpen(true)}>Complete assigned task</button>
        )}
      </section>
      {modalOpen && (
        <Modal
          title="Report the academic support next step"
          onClose={() => setModalOpen(false)}
          footer={<button className="btn" type="button" onClick={() => {
            if (ctx.completeTask(caze.id, task.id, completionNote)) {
              setModalOpen(false)
            }
          }}>Send result to Wellbeing Cell</button>}
        >
          <label>Administrative support options reviewed<textarea value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} /></label>
          <p className="hint">Keep the update focused on administrative options. Do not include diagnosis or unnecessary personal details.</p>
        </Modal>
      )}
      <p className="hint" style={{ marginTop: 16 }}>Supporting access cannot change the owning case status or resolve the student’s case.</p>
    </div>
  )
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

  if (!caze || !staffCanSee(caze, session.department) ||
      (session.department === 'Wellbeing Cell' &&
        caze.assignedDepartment === 'Wellbeing Cell' &&
        caze.assignedCounselor &&
        caze.assignedCounselor.id !== session.staffId)) {
    return <div className="page"><p>This case is outside your need-to-know access.</p><Link to="/staff">Back to queue</Link></div>
  }

  const journey = getJourneyCases(cases, caze)
  const root = journey.find((item) => item.id === (caze.parentCaseReference || caze.id))
  const tasks = journey.flatMap((item) => (item.internalTasks || []).map((task) => ({ ...task, caseId: item.id })))
  const openTasks = tasks.filter((task) => task.status === 'open')
  const pendingCurrentTasks = (caze.internalTasks || []).filter((task) => task.status === 'open')
  const isOwner = caze.assignedDepartment === session.department
  const isCounselingCase = caze.assignedDepartment === 'Wellbeing Cell'
  const isAssignedCounselor = !isCounselingCase || caze.assignedCounselor?.id === session.staffId
  const canWorkCase = isOwner && isAssignedCounselor
  const isResolved = caze.status === 'RESOLVED'
  const counselorLoad = caze.assignedCounselor
    ? counselorWorkload(cases, ctx.counselors).find((item) => item.id === caze.assignedCounselor.id)
    : null
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
  const assignedSupportTask = (caze.internalTasks || []).find((task) =>
    task.to === session.department,
  )

  const close = () => {
    setModal(null)
    setText('')
    setTaskTitle('')
    setTaskToComplete(null)
  }

  const startCoordination = () => {
    const wellbeingTask = caze.assignedDepartment === 'Wellbeing Cell' &&
      recommendedDepartment === 'Academic Support'
    setToDepartment(recommendedDepartment)
    setTaskTitle(wellbeingTask
      ? 'Review available academic support options for this student and report the appropriate next step to the Wellbeing Cell.'
      : brief.suggestedDepartment
        ? 'Verify student participation in the event or workshop'
        : '')
    setText(wellbeingTask
      ? 'Review available academic support options and report the next step to the Wellbeing Cell.'
      : '')
    setModal('coordinate')
  }

  if (caze.assignedDepartment === 'Wellbeing Cell' &&
      session.department === 'Academic Support' &&
      !isOwner &&
      assignedSupportTask) {
    return (
      <SupportingWellbeingTask
        caze={caze}
        task={assignedSupportTask}
        ctx={ctx}
      />
    )
  }

  return (
    <div className="page staff-case-page">
      <p className="kicker"><Link to="/staff">Department queue</Link> · {caze.id} · {visibilityReason(caze, session.department)}</p>
      <div className="case-heading">
        <div>
          <p className="kicker">CASE {caze.id} · {caze.issueCategory}</p>
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
        {isCounselingCase && <>
          <div className="case-summary-item"><span>Assigned counselor</span><strong>{caze.assignedCounselor?.name || 'Awaiting counselor assignment'}</strong></div>
          {caze.assignedCounselor && <div className="case-summary-item"><span>Counselor role</span><strong>{caze.assignedCounselor.role}</strong></div>}
          {counselorLoad && <div className="case-summary-item"><span>Counselor status</span><strong>{counselorLoad.availability} · {counselorLoad.activeCaseCount} active {counselorLoad.activeCaseCount === 1 ? 'case' : 'cases'}</strong></div>}
          {caze.assignedCounselor && <div className="case-summary-item"><span>Assignment reason</span><strong>{caze.assignmentReason}</strong></div>}
        </>}
        {!isCounselingCase && <div className="case-summary-item"><span>Handled by</span><strong>{caze.owner?.name || 'Not yet taken'}</strong></div>}
      </section>

      <section className="card case-brief">
        <div className="section-heading">
          <div><p className="kicker">AI case brief</p><h2 className="section-title">Staff decision support</h2></div>
          <span className="hint">Deterministic fallback · no LLM service is configured</span>
        </div>
        <p>{brief.summary}</p>
        <div className="brief-next-action"><strong>Suggested next operational action</strong><span>{brief.nextAction}</span></div>
        {brief.supportAreas && <div className="brief-coordination">
          <strong>Potential support areas</strong>
          <span>{brief.supportAreas.join(' · ')}</span>
        </div>}
        <div className="brief-coordination">
          <strong>Suggested primary team</strong>
          <span>{brief.primaryDepartment || caze.assignedDepartment}</span>
        </div>
        <div className="brief-coordination">
          <strong>Suggested internal coordination</strong>
          <span>{brief.suggestedDepartment || 'No additional department indicated'}</span>
          <p className="hint">{brief.rationale}</p>
        </div>
        <p className="hint">This brief is deterministic administrative triage. No external LLM is configured; it does not inspect document contents, diagnose, infer risk, or change the case.</p>
      </section>

      <section className="card workflow-panel">
        <div className="section-heading">
          <div><p className="kicker">Action panel</p><h2 className="section-title">Case workflow</h2></div>
          <StatusBadge status={caze.status} />
        </div>
        {!isOwner && <p className="callout">Supporting access only. {caze.assignedDepartment} owns this case; your department can complete only tasks assigned to it.</p>}
        {isOwner && isCounselingCase && !isAssignedCounselor && caze.assignedCounselor && (
          <p className="callout">Assigned to {caze.assignedCounselor.name}. Only the assigned counselor can take workflow actions.</p>
        )}
        {isOwner && isCounselingCase && !caze.assignedCounselor && caze.status === 'NEW' && (
          <div className="callout">
            <strong>Awaiting counselor assignment</strong>
            <p>No counselor was available when the case arrived. Assignment can be retried after a counselor becomes available.</p>
            <button className="btn" type="button" onClick={() => ctx.assignAvailableCounselor(caze.id)}>Assign available counselor</button>
          </div>
        )}
        {isResolved ? (
          <div className="callout"><strong>Resolved — workflow closed.</strong><p>{caze.outcomeVerification || caze.timeline.find((event) => event.type === 'CASE_RESOLVED')?.body || 'The case has been resolved.'}</p></div>
        ) : canWorkCase && caze.status === 'NEW' ? (
          <button className="btn" type="button" onClick={() => ctx.startCase(caze.id)}>Start Working</button>
        ) : canWorkCase && caze.status === 'IN PROGRESS' ? (
          <div className="actions">
            <button className="btn secondary" type="button" onClick={() => setModal('note')}>Add Internal Note</button>
            <button className="btn secondary" type="button" onClick={() => setModal('request')}>Request Information</button>
            <button className="btn teal" type="button" onClick={startCoordination}>Coordinate Internally</button>
            <button className="btn" type="button" onClick={() => ctx.moveToUnderReview(caze.id)}>Move to Under Review</button>
          </div>
        ) : canWorkCase && caze.status === 'COORDINATION REQUIRED' ? (
          <div>
            <p><strong>Internal coordination is active.</strong> The student does not need to visit another office.</p>
            {pendingCurrentTasks.length === 0 && <p className="hint">All tasks are completed. Review the result, then move this case to under review.</p>}
            {pendingCurrentTasks.length > 0 && <p className="hint">Waiting on {pendingCurrentTasks.map((task) => task.to).join(', ')} to complete the assigned task.</p>}
            <button className="btn" type="button" disabled={pendingCurrentTasks.length > 0} onClick={() => ctx.moveToUnderReview(caze.id)}>Move to Under Review</button>
          </div>
        ) : canWorkCase && caze.status === 'UNDER REVIEW' ? (
          <div className="actions">
            <button className="btn secondary" type="button" onClick={() => { setText(caze.outcomeVerification || ''); setModal('verify') }}>Verify Outcome</button>
            <button className="btn" type="button" disabled={!caze.outcomeVerified} onClick={() => { setText(caze.outcomeVerification || ''); setModal('resolve') }}>Resolve Case</button>
            {!caze.outcomeVerified && <span className="hint">Verify the outcome before resolution.</span>}
          </div>
        ) : null}
        {!isResolved && canWorkCase && caze.status !== 'NEW' && (
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn secondary" type="button" onClick={() => { setText(''); setModal('student-update') }}>Send Update to Student</button>
          </div>
        )}
      </section>

      <div className="grid staff-case-grid">
        <div className="staff-main-column">
          <section className="card">
            <div className="section-heading">
              <div><p className="kicker">Case record</p><h2 className="section-title">{caze.issueCategory} · {caze.id}</h2></div>
              <label className="compact-control">Priority
                <select value={caze.priority} disabled={!canWorkCase || isResolved} onChange={(event) => ctx.changePriority(caze.id, event.target.value)}>
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
          <section className="card quiet">
            <p className="kicker">Case timeline</p>
            <Timeline events={journeyTimeline} staff />
          </section>
        </div>
      </div>

      {modal === 'request' && <Modal title="Request information from the student" onClose={close} footer={<button className="btn" type="button" onClick={() => { if (ctx.requestFromStudent(caze.id, text)) close() }} disabled={!text.trim()}>Send request</button>}>
        <label>What information is needed?<textarea required value={text} onChange={(event) => setText(event.target.value)} /></label>
      </Modal>}
      {modal === 'note' && <Modal title="Add an internal note" onClose={close} footer={<button className="btn" type="button" onClick={() => { if (ctx.addInternalNote(caze.id, text)) close() }} disabled={!text.trim()}>Save note</button>}>
        <label>Internal note<textarea required value={text} onChange={(event) => setText(event.target.value)} /></label><p className="hint">Only staff with case access can see this note.</p>
      </Modal>}
      {modal === 'student-update' && <Modal title="Send an update to the student" onClose={close} footer={<button className="btn" type="button" onClick={() => { if (ctx.addStudentUpdate(caze.id, text)) close() }} disabled={!text.trim()}>Send Update to Student</button>}>
        <label>Student update<textarea required value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a clear, supportive update for the student." /></label>
        <p className="hint">This message is visible to the student and appears in their case timeline. Use Internal Note for staff-only information.</p>
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
