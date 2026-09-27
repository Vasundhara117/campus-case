import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { STUDENT, formatWhen } from '../data'
import { FilePicker, StatusBadge, Timeline } from '../ui.jsx'
import { useCampus } from '../CampusContext.jsx'

export default function StudentCase() {
  const { id } = useParams()
  const { cases, studentRespond } = useCampus()
  const caze = cases.find((c) => c.id === id && c.studentId === STUDENT.id)
  const [message, setMessage] = useState('')
  const [documents, setDocuments] = useState([])

  if (!caze) {
    return (
      <div className="page">
        <p>This case is not on your record.</p>
        <Link to="/student">Back</Link>
      </div>
    )
  }

  const coordinating = caze.status === 'INTERNAL COORDINATION' || caze.internalTasks.length > 0

  return (
    <div className="page">
      <p className="kicker"><Link to="/student">Your cases</Link> · {caze.id}</p>
      <h1 className="h1">{caze.title}</h1>
      <StatusBadge status={caze.status} />
      {coordinating && caze.status !== 'RESOLVED' && (
        <p className="callout" style={{ marginTop: 16 }}>
          Another university team is helping on this case. You do not need to visit another office.
        </p>
      )}
      <div className="grid grid-2" style={{ marginTop: 20 }}>
        <section className="card">
          <p className="kicker">Case details</p>
          <div className="meta">
            <div className="meta-item"><span>Case ID</span><strong>{caze.id}</strong></div>
            <div className="meta-item"><span>Issue</span><strong>{caze.category}</strong></div>
            <div className="meta-item"><span>Assigned department</span><strong>{caze.assignedDepartment}</strong></div>
            <div className="meta-item"><span>Current owner</span><strong>{caze.owner?.name || 'Not yet assigned'}</strong></div>
            <div className="meta-item"><span>Next action</span><strong>{caze.nextAction}</strong></div>
            <div className="meta-item"><span>Expected response</span><strong>{caze.expectedResponse}</strong></div>
          </div>
          <p style={{ marginTop: 16 }}>{caze.description}</p>
          {caze.documents?.length > 0 && (
            <p className="hint">Documents: {caze.documents.map((d) => d.name).join(', ')}</p>
          )}
          {caze.status === 'WAITING FOR STUDENT' && (
            <form
              className="form"
              style={{ marginTop: 18 }}
              onSubmit={(e) => {
                e.preventDefault()
                studentRespond(caze.id, { message, documents })
                setMessage('')
                setDocuments([])
              }}
            >
              <p className="kicker">They asked you for</p>
              <p>{caze.waitingOnStudent?.message}</p>
              <label>
                Your reply
                <textarea required value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
              <FilePicker label="Upload requested document" onFiles={setDocuments} />
              <button className="btn" type="submit">Send reply</button>
            </form>
          )}
        </section>
        <section className="card quiet">
          <p className="kicker">Timeline</p>
          <Timeline events={caze.timeline} />
          <p className="hint">Opened {formatWhen(caze.createdAt)}</p>
        </section>
      </div>
    </div>
  )
}
