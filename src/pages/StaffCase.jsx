import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DEPARTMENTS, STATUSES, formatWhen, staffCanSee, visibilityReason } from '../data'
import { Modal, StatusBadge, Timeline } from '../ui.jsx'
import { useCampus } from '../CampusContext.jsx'

export default function StaffCase() {
  const { id } = useParams()
  const ctx = useCampus()
  const { cases, session } = ctx
  const caze = cases.find((c) => c.id === id)
  const [modal, setModal] = useState(null)
  const [ownerName, setOwnerName] = useState(session.name)
  const [status, setStatus] = useState('')
  const [text, setText] = useState('')
  const [toDept, setToDept] = useState('Event & Workshop Cell')
  const [taskTitle, setTaskTitle] = useState('Verify workshop participation for this student')

  if (!caze || !staffCanSee(caze, session.department)) {
    return (
      <div className="page">
        <p>This case is outside your need-to-know access.</p>
        <Link to="/staff">Back to queue</Link>
      </div>
    )
  }

  const others = DEPARTMENTS.map((d) => d.name).filter((n) => n !== session.department)
  const myOpenTasks = caze.internalTasks.filter((t) => t.to === session.department && t.status === 'open')

  const close = () => {
    setModal(null)
    setText('')
  }

  return (
    <div className="page">
      <p className="kicker"><Link to="/staff">Queue</Link> · {caze.id} · {visibilityReason(caze, session.department)}</p>
      <h1 className="h1">{caze.title}</h1>
      <StatusBadge status={caze.status} />
      <p className="lede" style={{ marginTop: 12 }}>
        {caze.studentName} · {caze.studentProgramme}. Keep coordination on this file.
      </p>

      <div className="actions" style={{ marginBottom: 18 }}>
        <button className="btn" type="button" onClick={() => setModal('owner')}>Assign owner</button>
        <button className="btn secondary" type="button" onClick={() => { setStatus(caze.status); setModal('status') }}>Change status</button>
        <button className="btn secondary" type="button" onClick={() => setModal('request')}>Request from student</button>
        <button className="btn secondary" type="button" onClick={() => setModal('note')}>Internal note</button>
        <button className="btn teal" type="button" onClick={() => setModal('task')}>Internal task</button>
        <button className="btn secondary" type="button" onClick={() => setModal('access')}>Grant access</button>
        <button className="btn" type="button" onClick={() => setModal('resolve')}>Resolve case</button>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <p className="kicker">Issue</p>
          <p>{caze.description}</p>
          <p><strong>Help needed:</strong> {caze.helpNeeded}</p>
          <div className="meta" style={{ marginTop: 12 }}>
            <div className="meta-item"><span>Owner</span><strong>{caze.owner?.name || 'Unassigned'}</strong></div>
            <div className="meta-item"><span>Owning cell</span><strong>{caze.assignedDepartment}</strong></div>
            <div className="meta-item"><span>Next action</span><strong>{caze.nextAction}</strong></div>
            <div className="meta-item"><span>Updated</span><strong>{formatWhen(caze.updatedAt)}</strong></div>
          </div>
          <p className="kicker" style={{ marginTop: 18 }}>Documents</p>
          {caze.documents?.length ? caze.documents.map((d) => <p key={d.name}>{d.name} · {d.size}</p>) : <p className="hint">None yet</p>}
          <p className="kicker" style={{ marginTop: 18 }}>Permissions</p>
          <div className="perm-list">
            {caze.involvedDepartments.map((d) => (
              <span className="chip" key={d}>{d}</span>
            ))}
          </div>
          {caze.accessGrants.map((g) => (
            <p className="hint" key={g.department + g.grantedAt}>{g.department}: {g.reason}</p>
          ))}
        </section>
        <section className="card quiet">
          <p className="kicker">Internal tasks</p>
          {caze.internalTasks.length === 0 && <p className="hint">No internal tasks. Invite another cell instead of sending the student.</p>}
          {caze.internalTasks.map((t) => (
            <div key={t.id} className="card" style={{ marginBottom: 10, boxShadow: 'none' }}>
              <strong>{t.title}</strong>
              <p className="hint">{t.from} → {t.to} · {t.status}</p>
              <p>{t.detail}</p>
              {t.status === 'open' && t.to === session.department && (
                <button className="btn teal" type="button" onClick={() => { setModal('complete'); setText('Verified. Student attended the Industry Readiness Workshop on 18 Sep 2026.') }}>
                  Complete verification
                </button>
              )}
            </div>
          ))}
          {myOpenTasks.length === 0 && session.department !== caze.assignedDepartment && (
            <p className="hint">You have need-to-know access. Complete any task assigned to your cell.</p>
          )}
          <p className="kicker" style={{ marginTop: 16 }}>Full timeline</p>
          <Timeline events={caze.timeline} staff />
        </section>
      </div>

      {modal === 'owner' && (
        <Modal title="Assign a named owner" onClose={close} footer={<button className="btn" type="button" onClick={() => { ctx.assignOwner(caze.id, ownerName); close() }}>Save owner</button>}>
          <label>Owner name<input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} /></label>
        </Modal>
      )}
      {modal === 'status' && (
        <Modal title="Change status" onClose={close} footer={<button className="btn" type="button" onClick={() => { ctx.changeStatus(caze.id, status); close() }}>Update</button>}>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </Modal>
      )}
      {modal === 'request' && (
        <Modal title="Request information from the student" onClose={close} footer={<button className="btn" type="button" onClick={() => { ctx.requestFromStudent(caze.id, text || 'Please upload your participation certificate.'); close() }}>Send request</button>}>
          <label>
            Message
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Please upload the workshop participation certificate." />
          </label>
        </Modal>
      )}
      {modal === 'note' && (
        <Modal title="Add an internal note" onClose={close} footer={<button className="btn" type="button" onClick={() => { ctx.addInternalNote(caze.id, text || 'Reviewed internally.'); close() }}>Save note</button>}>
          <label>Note<textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
          <p className="hint">Students cannot see internal notes.</p>
        </Modal>
      )}
      {modal === 'task' && (
        <Modal title="Create an internal task" onClose={close} footer={<button className="btn" type="button" onClick={() => { ctx.createInternalTask(caze.id, { toDepartment: toDept, title: taskTitle, detail: text || 'Please verify attendance internally. Do not ask the student to visit.' }); close() }}>Create task</button>}>
          <label>
            Department
            <select value={toDept} onChange={(e) => setToDept(e.target.value)}>
              {others.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label>Task<input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} /></label>
          <label>Detail<textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
        </Modal>
      )}
      {modal === 'access' && (
        <Modal title="Grant need-to-know access" onClose={close} footer={<button className="btn" type="button" onClick={() => { ctx.grantAccess(caze.id, toDept, text || 'Need-to-know for this case only.'); close() }}>Grant</button>}>
          <label>
            Department
            <select value={toDept} onChange={(e) => setToDept(e.target.value)}>
              {others.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label>Reason<textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
        </Modal>
      )}
      {modal === 'resolve' && (
        <Modal title="Resolve this case" onClose={close} footer={<button className="btn" type="button" onClick={() => { ctx.resolveCase(caze.id, text || 'Attendance record updated. Workshop marked present.'); close() }}>Resolve</button>}>
          <label>Outcome for the student<textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Attendance record updated. Workshop marked present." /></label>
        </Modal>
      )}
      {modal === 'complete' && (
        <Modal title="Complete internal verification" onClose={close} footer={<button className="btn" type="button" onClick={() => { const task = myOpenTasks[0] || caze.internalTasks.find((t) => t.status === 'open'); if (task) ctx.completeTask(caze.id, task.id, text); close() }}>Mark complete</button>}>
          <label>Verification note<textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
        </Modal>
      )}
    </div>
  )
}
