import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CATEGORIES, CATEGORY_ROUTING } from '../data'
import { FilePicker } from '../ui.jsx'
import { useCampus } from '../CampusContext.jsx'

export default function CreateCase() {
  const { createCase } = useCampus()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    category: 'Attendance',
    title: '',
    description: '',
    helpNeeded: '',
    documents: [],
  })
  const [done, setDone] = useState(null)

  const onSubmit = (e) => {
    e.preventDefault()
    const created = createCase(form)
    setDone(created)
  }

  if (done) {
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 640 }}>
          <p className="kicker">Submitted</p>
          <h1 className="h1">Your case is {done.id}</h1>
          <p className="lede">
            It has been routed to <strong>{done.assignedDepartment}</strong>. You will not be asked to
            carry this between offices.
          </p>
          <div className="actions">
            <button className="btn" type="button" onClick={() => navigate(`/student/cases/${done.id}`)}>
              Track this case
            </button>
            <button className="btn secondary" type="button" onClick={() => navigate('/student')}>
              Back to home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <p className="kicker">New case</p>
      <h1 className="h1">Tell us once</h1>
      <p className="lede">We route your request to the right cell. Other teams are invited internally if needed.</p>
      <form className="card form" onSubmit={onSubmit} style={{ maxWidth: 680 }}>
        <label>
          Category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span className="hint">Routes to {CATEGORY_ROUTING[form.category]}</span>
        </label>
        <label>
          Issue title
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          Description
          <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label>
          What help do you need?
          <textarea required value={form.helpNeeded} onChange={(e) => setForm({ ...form, helpNeeded: e.target.value })} />
        </label>
        <FilePicker onFiles={(documents) => setForm({ ...form, documents })} />
        {form.documents[0] && <span className="hint">Attached: {form.documents.map((d) => d.name).join(', ')}</span>}
        <div className="actions">
          <button className="btn" type="submit">Submit case</button>
          <button className="btn secondary" type="button" onClick={() => navigate('/student')}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
