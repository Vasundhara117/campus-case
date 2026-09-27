import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UNIVERSITY } from './data'
import { loadDocument, validateDocument } from './documentStore'

export function Mark() {
  return <div className="mark" aria-hidden>C</div>
}

export function StatusBadge({ status, student = false, counselorAssigned = false }) {
  const displayStatus = student
    ? status === 'NEW' && counselorAssigned
      ? 'COUNSELOR ASSIGNED'
      : status === 'IN PROGRESS'
        ? 'BEING HANDLED'
        : status === 'COORDINATION REQUIRED'
          ? 'INTERNAL COORDINATION'
          : status
    : status
  const cls = displayStatus === 'IN PROGRESS' || displayStatus === 'BEING HANDLED'
    ? 'PROGRESS'
    : displayStatus === 'COUNSELOR ASSIGNED'
      ? 'ASSIGNED'
    : displayStatus.startsWith('UNDER')
      ? 'UNDER'
      : displayStatus.startsWith('WAITING')
        ? 'WAITING'
        : displayStatus.startsWith('INTERNAL') || displayStatus.startsWith('COORDINATION')
          ? 'INTERNAL'
          : displayStatus.startsWith('ACTION')
            ? 'ACTION'
            : displayStatus
  return <span className={`badge ${cls}`}>{displayStatus}</span>
}

export function Header({ session, onLogout, onReset, extra, unreadNotifications, onNotifications, notificationsOpen }) {
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
          <button className="btn secondary notification-bell" type="button" onClick={onNotifications} aria-label="Notifications" aria-expanded={notificationsOpen}>
            🔔 Notifications{unreadNotifications > 0 && <span className="unread-count">{unreadNotifications}</span>}
          </button>
        )}
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

export function NotificationCenter({ notifications, onRead }) {
  return (
    <section className="notification-center" aria-label="Notification center">
      <div className="notification-center-heading">
        <div>
          <p className="kicker">Updates</p>
          <h2 className="section-title">Notifications</h2>
        </div>
      </div>
      {notifications.length === 0
        ? <p className="hint">No notifications yet. Important case events will appear here.</p>
        : <ol className="notification-list">
            {[...notifications].reverse().map((notification) => (
              <li key={notification.id} className={notification.readAt ? '' : 'unread'}>
                <strong>{notification.title}</strong>
                <p>{notification.message}</p>
                <div className="notification-meta">
                  <span>{new Date(notification.createdAt).toLocaleString()}</span>
                  {notification.actionHref && <Link to={notification.actionHref}>Open case</Link>}
                  {!notification.readAt && (
                    <button type="button" className="text-button" onClick={() => onRead(notification.id)}>Mark read</button>
                  )}
                </div>
              </li>
            ))}
          </ol>}
    </section>
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
          <div className="when">
            {new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {' · '}{staff || e.type === 'COUNSELOR_UPDATE' ? e.actor : e.actorRole === 'Student' ? 'You' : 'Campus Case team'}{e.caseId ? ` · ${e.caseId}` : ''}
          </div>
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
        <div className={`toast${t.title ? ' notification-toast' : ''}`} key={t.id} role={t.title ? 'status' : undefined}>
          {t.title && <strong className="toast-title">{t.title}</strong>}
          <span>{t.message}</span>
          {t.actionHref && <Link to={t.actionHref}>Open case</Link>}
        </div>
      ))}
    </div>
  )
}

export function FilePicker({ onFiles, label = 'Optional document' }) {
  const [error, setError] = useState('')
  return (
    <label>
      {label}
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files || [])]
          const invalid = files.find(validateDocument)
          if (invalid) {
            setError(validateDocument(invalid))
            event.target.value = ''
            return
          }
          setError('')
          onFiles(files)
        }}
      />
      {error && <span className="form-error" role="alert">{error}</span>}
    </label>
  )
}

function documentSize(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function documentTypeLabel(mimeType) {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'image/jpeg') return 'JPEG'
  if (mimeType === 'image/png') return 'PNG'
  return 'FILE'
}

export function DocumentList({ documents = [] }) {
  const [error, setError] = useState('')
  const openDocument = async (item, download) => {
    const preview = download ? null : window.open('about:blank', '_blank')
    try {
      const file = await loadDocument(item.storageRef)
      const url = URL.createObjectURL(file)
      if (preview) {
        preview.location.href = url
      } else {
        const anchor = document.createElement('a')
        anchor.href = url
        if (download) anchor.download = item.name
        else anchor.target = '_blank'
        anchor.rel = 'noopener'
        anchor.click()
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setError('')
    } catch (cause) {
      preview?.close()
      setError(cause.message || 'This document could not be loaded.')
    }
  }

  if (documents.length === 0) return <p className="hint">No documents attached.</p>
  return (
    <div className="document-list">
      {documents.map((item) => (
        <div className="document-row" key={item.id || item.storageRef}>
          <div>
            <strong>{item.name}</strong>
            <div className="hint">{documentTypeLabel(item.type)} · {documentSize(item.size)}</div>
          </div>
          {item.storageRef && (
            <div className="actions">
              <button className="btn secondary" type="button" onClick={() => openDocument(item, false)}>View</button>
              <button className="btn secondary" type="button" onClick={() => openDocument(item, true)}>Download</button>
            </div>
          )}
        </div>
      ))}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}
