import { Link } from 'react-router-dom'
import { UNIVERSITY } from './data'

export function Mark() {
  return <div className="mark" aria-hidden>C</div>
}

export function StatusBadge({ status }) {
  const cls = status.startsWith('UNDER')
    ? 'UNDER'
    : status.startsWith('WAITING')
      ? 'WAITING'
      : status.startsWith('INTERNAL')
        ? 'INTERNAL'
        : status.startsWith('ACTION')
          ? 'ACTION'
          : status
  return <span className={`badge ${cls}`}>{status}</span>
}

export function Header({ session, onLogout, onReset, extra }) {
  return (
    <header className="topbar">
      <Link to={session?.role === 'staff' ? '/staff' : session ? '/student' : '/'} className="brand">
        <Mark />
        <div>
          <div className="brand-name">Campus Case</div>
          <div className="brand-sub">{UNIVERSITY}</div>
        </div>
      </Link>
      <div className="topbar-actions">
        {session && (
          <span className="chip">
            {session.role === 'student' ? session.name : `${session.name} · ${session.department}`}
          </span>
        )}
        {extra}
        {session && (
          <button className="btn secondary" type="button" onClick={onLogout}>
            Switch role
          </button>
        )}
        <button className="btn ghost" type="button" onClick={onReset}>
          Reset demo
        </button>
      </div>
    </header>
  )
}

export function Modal({ title, children, onClose, footer }) {
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <p className="kicker">Campus Case</p>
        <h3 className="h1" style={{ fontSize: '1.4rem' }}>{title}</h3>
        <div className="form" style={{ marginTop: 12 }}>{children}</div>
        <div className="actions" style={{ marginTop: 16 }}>
          {footer}
          <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function Timeline({ events, staff }) {
  const items = staff ? events : events.filter((e) => e.visibility !== 'internal')
  return (
    <ol className="timeline">
      {[...items].reverse().map((e) => (
        <li key={e.id}>
          <div className="when">{new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {e.actor}</div>
          <h4>{e.title}{e.visibility === 'internal' ? ' · internal' : ''}</h4>
          <p>{e.body}</p>
        </li>
      ))}
    </ol>
  )
}

export function Toasts({ toasts }) {
  if (!toasts.length) return null
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>{t.message}</div>
      ))}
    </div>
  )
}

export function FilePicker({ onFiles, label = 'Optional document' }) {
  return (
    <label>
      {label}
      <input
        type="file"
        onChange={(e) => {
          const files = [...e.target.files].map((f) => ({
            name: f.name,
            size: `${Math.max(1, Math.round(f.size / 1024))} KB`,
            at: new Date().toISOString(),
            by: 'Upload',
          }))
          onFiles(files)
        }}
      />
    </label>
  )
}
