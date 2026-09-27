import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { DEPARTMENTS } from '../data'
import { useCampus } from '../CampusContext.jsx'

export default function Login() {
  const { session, loginStudent, loginStaff } = useCampus()
  const [staffOpen, setStaffOpen] = useState(false)
  const [studentOpen, setStudentOpen] = useState(false)
  const [profile, setProfile] = useState({ studentId: '', studentName: '', studentProgramme: '' })

  if (session?.role === 'student') return <Navigate to="/student" replace />
  if (session?.role === 'staff') return <Navigate to="/staff" replace />

  return (
    <div className="login-hero">
      <p className="kicker">Vasavi College of Engineering · Student services</p>
      <h1 className="h1">One student. One case. One journey to resolution.</h1>
      <p className="lede">
        Campus Case is a joined-up case file. Students submit once. Departments coordinate internally
        so nobody is sent from office to office.
      </p>
      <div className="login-grid">
        <div className="choice">
          <p className="kicker">Student</p>
          <h2>Enter your student details</h2>
          <p>Use your student ID to create or return to your cases. Your departments will share the journey.</p>
          {!studentOpen ? (
            <button className="btn" type="button" style={{ marginTop: 12 }} onClick={() => setStudentOpen(true)}>
              Continue as student
            </button>
          ) : (
            <form
              className="form"
              style={{ marginTop: 12 }}
              onSubmit={(event) => {
                event.preventDefault()
                loginStudent(profile)
              }}
            >
              <label>
                Student ID
                <input required value={profile.studentId} onChange={(event) => setProfile({ ...profile, studentId: event.target.value })} />
              </label>
              <label>
                Name
                <input required value={profile.studentName} onChange={(event) => setProfile({ ...profile, studentName: event.target.value })} />
              </label>
              <label>
                Programme
                <input required value={profile.studentProgramme} onChange={(event) => setProfile({ ...profile, studentProgramme: event.target.value })} />
              </label>
              <button className="btn" type="submit">Open student home</button>
            </form>
          )}
        </div>
        <div className="choice" as="div">
          <p className="kicker">Department staff</p>
          <h2>Enter a cell</h2>
          <p>Work your queue, assign an owner, and invite another department with need-to-know access.</p>
          <button className="btn teal" type="button" style={{ marginTop: 12 }} onClick={() => setStaffOpen((v) => !v)}>
            {staffOpen ? 'Hide departments' : 'Choose department'}
          </button>
          {staffOpen && (
            <div className="staff-list">
              {DEPARTMENTS.map((d) => (
                <button key={d.id} type="button" onClick={() => loginStaff(d.id)}>
                  <strong>{d.name}</strong>
                  <div className="hint">{d.staffName} · {d.title}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
