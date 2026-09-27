import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { DEPARTMENTS, STUDENT } from '../data'
import { useCampus } from '../CampusContext.jsx'

export default function Login() {
  const { session, loginStudent, loginStaff } = useCampus()
  const [staffOpen, setStaffOpen] = useState(false)

  if (session?.role === 'student') return <Navigate to="/student" replace />
  if (session?.role === 'staff') return <Navigate to="/staff" replace />

  return (
    <div className="login-hero">
      <p className="kicker">Vasavi College of Engineering · Student services</p>
      <h1 className="h1">One student. One case. One owner. One shared timeline.</h1>
      <p className="lede">
        Campus Case is a joined-up case file. Students submit once. Departments coordinate internally
        so nobody is sent from office to office.
      </p>
      <div className="login-grid">
        <button className="choice" type="button" onClick={loginStudent}>
          <p className="kicker">Student</p>
          <h2>Enter as {STUDENT.name}</h2>
          <p>{STUDENT.programme}. Create a case, track status, and reply without visiting another counter.</p>
        </button>
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
      <p className="demo-note">
        Judge path: sign in as Priya, open <strong>CC-1042</strong>, then switch to Attendance Cell.
        Request the certificate, create an internal task for Event & Workshop Cell, complete verification,
        and resolve — Priya never visits the coordinator.
      </p>
    </div>
  )
}
