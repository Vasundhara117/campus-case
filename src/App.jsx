import { Navigate, Route, Routes } from 'react-router-dom'
import { useCampus } from './CampusContext.jsx'
import { Header, Toasts } from './ui.jsx'
import Login from './pages/Login.jsx'
import StudentHome from './pages/StudentHome.jsx'
import CreateCase from './pages/CreateCase.jsx'
import StudentCase from './pages/StudentCase.jsx'
import StaffHome from './pages/StaffHome.jsx'
import StaffCase from './pages/StaffCase.jsx'

function Guard({ role, children }) {
  const { session } = useCampus()
  if (!session) return <Navigate to="/" replace />
  if (session.role !== role) return <Navigate to={session.role === 'staff' ? '/staff' : '/student'} replace />
  return children
}

export default function App() {
  const { session, logout, resetDemo, toasts } = useCampus()
  return (
    <div className="app-shell">
      <a className="skip" href="#main">Skip to content</a>
      <Header session={session} onLogout={logout} onReset={resetDemo} />
      <main id="main">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/student" element={<Guard role="student"><StudentHome /></Guard>} />
          <Route path="/student/new" element={<Guard role="student"><CreateCase /></Guard>} />
          <Route path="/student/cases/:id" element={<Guard role="student"><StudentCase /></Guard>} />
          <Route path="/staff" element={<Guard role="staff"><StaffHome /></Guard>} />
          <Route path="/staff/cases/:id" element={<Guard role="staff"><StaffCase /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toasts toasts={toasts} />
    </div>
  )
}
