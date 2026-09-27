import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatWhen, getJourneyCases } from '../data'
import { DocumentList, FilePicker, StatusBadge, Timeline } from '../ui.jsx'
import { useCampus } from '../CampusContext.jsx'

export default function StudentCase() {
  const { id } = useParams()
  const { cases, session, studentRespond } = useCampus()
  const caze = cases.find((c) => c.id === id && c.studentId.toLocaleUpperCase() === session.studentId.toLocaleUpperCase())
  const [message, setMessage] = useState('')
  const [documents, setDocuments] = useState([])
  const [responseError, setResponseError] = useState('')

  if (!caze) {
    return (
      <div className="page">
        <p>This case is not on your record.</p>
        <Link to="/student">Back</Link>
      </div>
    )
  }

  const coordinating = caze.status === 'COORDINATION REQUIRED' || caze.internalTasks.some((task) => task.status === 'open')
  const publicEvents = caze.timeline.filter((event) => event.visibility !== 'internal')
  const latestUpdate = [...publicEvents].sort((a, b) => new Date(b.at) - new Date(a.at))[0]
  const journey = getJourneyCases(cases, caze)

  return (
    <div className="page">
      <p className="kicker"><Link to="/student">Your cases</Link> · {caze.id}</p>
      <h1 className="h1">{caze.title}</h1>
      <StatusBadge status={caze.status} student />
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
            <div className="meta-item"><span>Issue</span><strong>{caze.issueCategory}</strong></div>
            <div className="meta-item"><span>Assigned department</span><strong>{caze.assignedDepartment}</strong></div>
            <div className="meta-item"><span>Handled by</span><strong>{caze.owner?.name || 'Not yet taken'}</strong></div>
            <div className="meta-item"><span>Next action</span><strong>{caze.nextAction}</strong></div>
            <div className="meta-item"><span>Latest update</span><strong>{latestUpdate ? formatWhen(latestUpdate.at) : 'No updates yet'}</strong></div>
          </div>
          {journey.length > 1 && (
            <div style={{ marginTop: 18 }}>
              <p className="kicker">Connected university teams</p>
              {journey.map((linked) => (
                <p key={linked.id}>
                  <Link to={`/student/cases/${linked.id}`}>{linked.id} · {linked.assignedDepartment}</Link>
                  {linked.parentCaseReference ? ' · connected case' : ' · starting case'}
                </p>
              ))}
            </div>
          )}
          <p style={{ marginTop: 16 }}>{caze.description}</p>
          <p className="kicker" style={{ marginTop: 18 }}>Documents</p>
          <DocumentList documents={caze.documents} />
          {caze.waitingOnStudent && caze.status !== 'RESOLVED' && (
            <form
              className="form"
              style={{ marginTop: 18 }}
              onSubmit={(e) => {
                e.preventDefault()
                setResponseError('')
                studentRespond(caze.id, { message, documents })
                  .then(() => { setMessage(''); setDocuments([]) })
                  .catch((error) => setResponseError(error.message || 'Your response could not be sent.'))
              }}
            >
              <p className="kicker">They asked you for</p>
              <p>{caze.waitingOnStudent?.message}</p>
              <label>
                Your reply
                <textarea required value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
              <FilePicker label="Upload requested document" onFiles={setDocuments} />
              {responseError && <p className="form-error" role="alert">{responseError}</p>}
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
