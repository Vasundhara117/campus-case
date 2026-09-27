import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CATEGORIES, CATEGORY_ROUTING, DEPARTMENTS } from '../data'
import { FilePicker } from '../ui.jsx'
import { useCampus } from '../CampusContext.jsx'

export default function CreateCase() {
  const { createCase, session } = useCampus()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    issueCategory: 'Attendance',
    departments: [CATEGORY_ROUTING.Attendance],
    title: '',
    description: '',
    helpNeeded: '',
    documents: [],
  })
  const [done, setDone] = useState(null)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const titleRef = useRef(null)
  const descriptionRef = useRef(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    if (form.departments.length === 0) {
      setFormError('Choose at least one department so we know where to route your request.')
      return
    }
    if (!form.title.trim()) {
      setFormError('Enter an issue title before submitting.')
      titleRef.current?.focus()
      return
    }
    if (!form.description.trim()) {
      setFormError('Add a short description before submitting.')
      descriptionRef.current?.focus()
      return
    }
    setFormError('')
    setSubmitting(true)
    try {
      const created = await createCase({
        ...form,
        studentId: session.studentId,
        studentName: session.name,
        studentProgramme: session.programme,
      })
      setDone(created)
    } catch (error) {
      setFormError(error.message || 'The case could not be submitted. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 640 }}>
          <p className="kicker">Submitted</p>
          <h1 className="h1">
            {done.createdCases.length > 1
              ? 'Your requests are connected'
              : done.isDuplicate
                ? 'Request added to your existing case'
                : `Your case is ${done.id}`}
          </h1>
          <p className="lede">
            {done.createdCases.length > 1
              ? `${done.createdCases.length} department cases were created as one connected student journey.`
              : done.isDuplicate
              ? <>This request was added to <strong>{done.id}</strong> for {done.assignedDepartment}.</>
              : <>It has been routed to <strong>{done.assignedDepartment}</strong>. You will not be asked to carry this between offices.</>}
          </p>
          {done.parentCaseReference && (
            <p className="callout">Connected to the existing student journey under {done.parentCaseReference}.</p>
          )}
          <div className="actions">
            <button className="btn" type="button" onClick={() => navigate(`/student/cases/${done.id}`)}>
              Track {done.createdCases.length > 1 ? 'journey' : 'this case'}
            </button>
            <button className="btn secondary" type="button" onClick={() => navigate('/student')}>
              Back to home
            </button>
          </div>
          {done.createdCases.length > 1 && (
            <div className="created-case-list">
              <p className="kicker">Cases in this journey</p>
              {done.createdCases.map((createdCase) => (
                <p key={createdCase.id}>
                  <Link to={`/student/cases/${createdCase.id}`}>{createdCase.id} · {createdCase.assignedDepartment}</Link>
                  {createdCase.parentCaseReference ? ` · linked to ${createdCase.parentCaseReference}` : ' · starting case'}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <p className="kicker">New case</p>
      <h1 className="h1">Tell us once</h1>
      <p className="lede">Choose every department that needs to help. We create connected department cases so you don’t have to carry your story between offices.</p>
      <form className="card form" onSubmit={onSubmit} style={{ maxWidth: 680 }}>
        <label>
          Issue category
          <select
            value={form.issueCategory}
            onChange={(e) => {
              const issueCategory = e.target.value
              const previousDefault = CATEGORY_ROUTING[form.issueCategory]
              const nextDefault = CATEGORY_ROUTING[issueCategory]
              setForm((previous) => ({
                ...previous,
                issueCategory,
                departments: previous.departments.includes(previousDefault)
                  ? [...new Set(previous.departments.map((department) => department === previousDefault ? nextDefault : department))]
                  : [...new Set([...previous.departments, nextDefault])],
              }))
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <fieldset className="department-choices">
          <legend>Departments that should help</legend>
          <p className="hint">Select one or more. For example, choose both Attendance Cell and Academic Services.</p>
          <div className="department-checklist">
            {DEPARTMENTS.map((department) => (
              <label className="department-option" key={department.id}>
                <input
                  type="checkbox"
                  checked={form.departments.includes(department.name)}
                  onChange={(e) => {
                    setForm((previous) => ({
                      ...previous,
                      departments: e.target.checked
                        ? [...new Set([...previous.departments, department.name])]
                        : previous.departments.filter((name) => name !== department.name),
                    }))
                    setFormError('')
                  }}
                />
                <span>{department.name}</span>
              </label>
            ))}
          </div>
          {form.departments.length === 0 && (
            <span className="form-error" role="status">Choose at least one department to enable submission.</span>
          )}
          <span className="hint">Each selected department receives a case connected to the same student journey.</span>
        </fieldset>
        <label>
          Issue title
          <input
            ref={titleRef}
            aria-required="true"
            aria-invalid={formError.includes('title')}
            value={form.title}
            onChange={(e) => { setForm({ ...form, title: e.target.value }); setFormError('') }}
          />
        </label>
        <label>
          Description
          <textarea
            ref={descriptionRef}
            aria-required="true"
            aria-invalid={formError.includes('description')}
            value={form.description}
            onChange={(e) => { setForm({ ...form, description: e.target.value }); setFormError('') }}
          />
        </label>
        <label>
          What help do you need? (optional)
          <textarea value={form.helpNeeded} onChange={(e) => setForm({ ...form, helpNeeded: e.target.value })} />
        </label>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <FilePicker onFiles={(documents) => setForm({ ...form, documents })} />
        {form.documents[0] && <span className="hint">Attached: {form.documents.map((d) => d.name).join(', ')}</span>}
        <div className="actions">
          <button className="btn" type="submit" disabled={form.departments.length === 0 || submitting}>
            {submitting ? 'Submitting…' : 'Submit case'}
          </button>
          <button className="btn secondary" type="button" onClick={() => navigate('/student')}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
