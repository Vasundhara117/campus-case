import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORY_ROUTING,
  ATTENTION_THRESHOLD_MS,
  COUNSELORS,
  DEPARTMENTS,
  STORAGE_KEY,
  buildWellbeingTriage,
  buildFallbackSummary,
  chooseAvailableCounselor,
  expectedFor,
  getJourneyCases,
  isAttentionRequired,
  nextCaseId,
} from './data'
import { addDocumentCaseReference, saveDocument } from './documentStore'

const CampusContext = createContext(null)
const RECENT_CASE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_KEY = `${STORAGE_KEY}-client-session`
const NOTIFICATION_KEY = `${STORAGE_KEY}-notification`
const INBOX_KEY = `${SESSION_KEY}-notifications`

function loadNotifications() {
  try {
    const saved = sessionStorage.getItem(INBOX_KEY)
    const parsed = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Unable to load this client notification center.', error)
    return []
  }
}

function normalizeWorkflowStatus(caze) {
  const legacyDepartments = {
    'Wellbeing & Counselling': 'Wellbeing Cell',
    'Academic Services': 'Academic Support',
  }
  let normalized = caze
  if (caze.status === 'ASSIGNED') normalized = { ...normalized, status: 'IN PROGRESS' }
  if (caze.status === 'INTERNAL COORDINATION') normalized = { ...normalized, status: 'COORDINATION REQUIRED' }
  if (caze.status === 'WAITING FOR STUDENT') normalized = { ...normalized, status: 'IN PROGRESS' }
  if (caze.status === 'ACTION COMPLETED') normalized = { ...normalized, status: 'UNDER REVIEW' }
  if (legacyDepartments[normalized.assignedDepartment]) {
    normalized = { ...normalized, assignedDepartment: legacyDepartments[normalized.assignedDepartment] }
  }
  if (legacyDepartments[normalized.department]) {
    normalized = { ...normalized, department: legacyDepartments[normalized.department] }
  }
  return normalized
}

function nowIso() {
  return new Date().toISOString()
}

function isAssignedOwner(caze, session) {
  if (!caze || !session || caze.assignedDepartment !== session.department) return false
  if (caze.assignedDepartment === 'Wellbeing Cell') {
    return caze.assignedCounselor?.id === session.staffId
  }
  return true
}

function event(partial) {
  return {
    id: crypto.randomUUID(),
    at: nowIso(),
    visibility: 'student',
    ...partial,
  }
}

function normalizeCounselorAvailability(cases, counselors) {
  const activeCounselors = new Set(cases
    .filter((caze) => ['IN PROGRESS', 'COORDINATION REQUIRED', 'UNDER REVIEW'].includes(caze.status))
    .map((caze) => caze.assignedCounselor?.id)
    .filter(Boolean))
  return counselors.map((counselor) => ({
    ...counselor,
    availability: activeCounselors.has(counselor.id)
      ? 'BUSY'
      : counselor.availability === 'BUSY'
        ? 'OFFLINE'
        : counselor.availability,
  }))
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const cases = Array.isArray(parsed.cases) ? parsed.cases : []
    const normalizedCases = cases.map((rawCase) => {
      const caze = normalizeWorkflowStatus(rawCase)
      const updatedAt = new Date(caze.updatedAt).getTime()
      const notifiedAt = new Date(caze.attentionNotifiedAt || 0).getTime()
      const prematureAttention = (caze.timeline || []).some((item) =>
        item.type === 'attention' &&
        new Date(item.at).getTime() - updatedAt < ATTENTION_THRESHOLD_MS,
      )
      const prematureNotice = Number.isFinite(notifiedAt) &&
        notifiedAt > 0 &&
        notifiedAt - updatedAt < ATTENTION_THRESHOLD_MS
      if (!prematureAttention && !prematureNotice) return caze
      return {
        ...caze,
        attentionNotifiedAt: undefined,
        timeline: caze.timeline.filter((item) =>
          item.type !== 'attention' ||
          new Date(item.at).getTime() - updatedAt >= ATTENTION_THRESHOLD_MS,
        ),
      }
    })
    const savedCounselors = Array.isArray(parsed.counselors)
      ? COUNSELORS.map((counselor) => ({
          ...counselor,
          ...(parsed.counselors.find((item) => item.id === counselor.id) || {}),
        }))
      : COUNSELORS
    return {
      revision: parsed.revision || { time: 0, clientId: '' },
      counselors: normalizeCounselorAvailability(normalizedCases, savedCounselors),
      cases: normalizedCases,
    }
  } catch (error) {
    console.error('Unable to load the saved Campus Case data.', error)
    return { cases: [], counselors: COUNSELORS, revision: { time: 0, clientId: '' } }
  }
}

function addDepartmentAccess(caze, department, reason, at) {
  const involvedDepartments = caze.involvedDepartments.includes(department)
    ? caze.involvedDepartments
    : [...caze.involvedDepartments, department]
  const accessGrants = caze.accessGrants.some((grant) => grant.department === department)
    ? caze.accessGrants
    : [...caze.accessGrants, { department, reason, grantedAt: at }]
  return { ...caze, involvedDepartments, accessGrants }
}

export function CampusProvider({ children }) {
  const initial = loadState()
  const [cases, setCasesState] = useState(initial.cases)
  const [counselors, setCounselorsState] = useState(initial.counselors)
  const [session, setSession] = useState(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      return saved ? JSON.parse(saved) : null
    } catch (error) {
      console.error('Unable to load this client session.', error)
      return null
    }
  })
  const [toasts, setToasts] = useState([])
  const [notifications, setNotifications] = useState(loadNotifications)
  const clientId = useRef(crypto.randomUUID())
  const channelRef = useRef(null)
  const seenNotifications = useRef(new Set(notifications.map((notification) => notification.id)))
  const casesRef = useRef(initial.cases)
  const counselorsRef = useRef(initial.counselors)
  const revisionRef = useRef(initial.revision)
  const unreadNotifications = notifications.filter((notification) => !notification.readAt).length

  const setCases = (nextOrUpdater, { broadcast = true } = {}) => {
    const previous = casesRef.current
    const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(previous) : nextOrUpdater
    if (next === previous) return
    casesRef.current = next
    setCasesState(next)

    const revision = {
      time: Math.max(Date.now(), revisionRef.current.time + 1),
      clientId: clientId.current,
    }
    revisionRef.current = revision
    const stateUpdate = {
      type: 'shared-state',
      sourceClient: clientId.current,
      revision,
      cases: next,
      counselors: counselorsRef.current,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cases: next, counselors: counselorsRef.current, revision }))
    } catch (error) {
      console.error('Unable to persist shared Campus Case data.', error)
    }
    if (broadcast) channelRef.current?.postMessage(stateUpdate)
  }

  const persistCounselors = (nextCounselors) => {
    counselorsRef.current = nextCounselors
    setCounselorsState(nextCounselors)
    const revision = {
      time: Math.max(Date.now(), revisionRef.current.time + 1),
      clientId: clientId.current,
    }
    revisionRef.current = revision
    const stateUpdate = {
      type: 'shared-state',
      sourceClient: clientId.current,
      revision,
      cases: casesRef.current,
      counselors: nextCounselors,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cases: casesRef.current,
        counselors: nextCounselors,
        revision,
      }))
    } catch (error) {
      console.error('Unable to persist counselor availability.', error)
    }
    channelRef.current?.postMessage(stateUpdate)
  }

  const receiveSharedState = (incoming, sourceClient) => {
    if (!Array.isArray(incoming?.cases) || sourceClient === clientId.current) return
    const revision = incoming.revision || { time: Date.now(), clientId: 'legacy' }
    const currentRevision = revisionRef.current
    const newer = revision.time > currentRevision.time ||
      (revision.time === currentRevision.time && revision.clientId > currentRevision.clientId)
    if (!newer) return
    revisionRef.current = revision
    casesRef.current = incoming.cases
    setCasesState(incoming.cases)
    if (Array.isArray(incoming.counselors)) {
      const mergedCounselors = COUNSELORS.map((counselor) => ({
        ...counselor,
        ...(incoming.counselors.find((item) => item.id === counselor.id) || {}),
      }))
      const normalizedCounselors = normalizeCounselorAvailability(incoming.cases, mergedCounselors)
      counselorsRef.current = normalizedCounselors
      setCounselorsState(normalizedCounselors)
    }
  }

  useEffect(() => {
    const channel = typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(`${STORAGE_KEY}-events`)
    channelRef.current = channel
    if (channel) {
      channel.onmessage = (message) => {
        const data = message.data
        if (data?.type === 'shared-state') {
          receiveSharedState(data, data.sourceClient)
          return
        }
        onNotification(data)
      }
    }
    const onStorage = (storageEvent) => {
      if (storageEvent.key === STORAGE_KEY && storageEvent.newValue) {
        try {
          const incoming = JSON.parse(storageEvent.newValue)
          receiveSharedState(incoming, incoming.sourceClient)
        } catch (error) {
          console.error('Unable to synchronize shared case data.', error)
        }
      }
      if (storageEvent.key === NOTIFICATION_KEY && storageEvent.newValue) {
        try {
          onNotification(JSON.parse(storageEvent.newValue))
        } catch (error) {
          console.error('Unable to read a live notification.', error)
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      channel?.close()
      channelRef.current = null
    }
  }, [session])

  useEffect(() => {
    try {
      if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      else sessionStorage.removeItem(SESSION_KEY)
    } catch (error) {
      console.error('Unable to persist this client session.', error)
    }
  }, [session])

  useEffect(() => {
    try {
      sessionStorage.setItem(INBOX_KEY, JSON.stringify(notifications.slice(-100)))
    } catch (error) {
      console.error('Unable to persist this client notification center.', error)
    }
  }, [notifications])

  const addToast = (toast) => {
    if (toast.id && seenNotifications.current.has(toast.id)) return
    if (toast.id) {
      seenNotifications.current.add(toast.id)
      setNotifications((current) => [...current, { ...toast, readAt: null }].slice(-100))
    }
    const id = toast.id || crypto.randomUUID()
    setToasts((current) => [...current, { ...toast, id }])
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), toast.id ? 5500 : 4200)
  }

  const onNotification = (notification, local = false) => {
    if (!notification || (!local && notification.sourceClient === clientId.current)) return
    if (notification.recipientRole && notification.recipientRole !== session?.role) return
    if (notification.recipientDepartment && notification.recipientDepartment !== session?.department) return
    if (notification.recipientStaffId && notification.recipientStaffId !== session?.staffId) return
    if (notification.recipientStudentId &&
        notification.recipientStudentId.toLocaleUpperCase() !== session?.studentId?.toLocaleUpperCase()) return
    addToast(notification)
  }

  const notify = (details) => {
    const eventId = details.eventId || crypto.randomUUID()
    const recipientIdentity = details.recipientStaffId || details.recipientStudentId ||
      details.recipientDepartment || details.recipientRole || 'broadcast'
    const recipientKey = `${details.recipientRole || 'any'}:${recipientIdentity}`
    const notificationId = `${eventId}:${recipientKey}`
    const caseRecord = details.caseId
      ? casesRef.current.find((caze) => caze.id === details.caseId)
      : null
    if (caseRecord?.status === 'RESOLVED' && details.eventType !== 'CASE_RESOLVED') return
    const timestamp = nowIso()
    const notification = {
      id: notificationId,
      eventId,
      eventType: details.eventType || 'CASE_EVENT',
      createdAt: timestamp,
      timestamp,
      sourceClient: clientId.current,
      sourceRole: session?.role,
      sourceDepartment: session?.department || null,
      ...details,
      recipientType: details.recipientRole || null,
      recipientId: details.recipientStudentId || details.recipientStaffId || details.recipientDepartment || null,
      departmentId: details.recipientDepartment || null,
      visibility: details.visibility || 'private',
      read: false,
      recipient: {
        role: details.recipientRole || null,
        department: details.recipientDepartment || null,
        staffId: details.recipientStaffId || null,
        studentId: details.recipientStudentId || null,
      },
    }
    onNotification(notification, true)
    channelRef.current?.postMessage(notification)
    try {
      localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notification))
    } catch (error) {
      console.error('Unable to publish a live notification.', error)
    }
  }

  const notifyForCaseEvent = (caseEvent, caseId, recipients) => {
    if (!caseEvent || !caseId) return
    for (const recipient of recipients) {
      notify({
        ...recipient,
        eventId: caseEvent.id,
        eventType: caseEvent.type,
        caseId,
        actionHref: recipient.actionHref || (recipient.recipientRole === 'student'
          ? `/student/cases/${caseId}`
          : `/staff/cases/${caseId}`),
      })
    }
  }

  useEffect(() => {
    const checkAttention = () => {
      const now = Date.now()
      setCases((current) => {
        let changed = false
        const checked = current.map((caze) => {
          if (!isAttentionRequired(caze, now)) return caze
          const updatedAt = new Date(caze.updatedAt).getTime()
          const notifiedAt = new Date(caze.attentionNotifiedAt || 0).getTime()
          if (Number.isFinite(notifiedAt) && notifiedAt >= updatedAt) return caze
          changed = true
          const at = new Date(now).toISOString()
          return {
            ...caze,
            attentionNotifiedAt: at,
            timeline: [
              ...caze.timeline,
              event({
                at,
                actor: 'Campus Case',
                actorRole: 'Attention signal',
                type: 'attention',
                title: 'Attention required',
                body: 'This case has had no update within the configured attention window.',
                visibility: 'internal',
              }),
            ],
          }
        })
        return changed ? checked : current
      })
    }
    checkAttention()
    const timer = setInterval(checkAttention, 30 * 1000)
    return () => clearInterval(timer)
  }, [])

  const toast = (message) => {
    addToast({ message })
  }

  const clearUnreadNotifications = () => {
    const readAt = nowIso()
    setNotifications((current) => current.map((notification) =>
      notification.readAt ? notification : { ...notification, read: true, readAt },
    ))
  }

  const markNotificationRead = (id) => {
    const readAt = nowIso()
    setNotifications((current) => current.map((notification) =>
      notification.id === id && !notification.readAt ? { ...notification, read: true, readAt } : notification,
    ))
  }

  const updateCase = (id, updater) => {
    setCases((previous) => {
      let changed = false
      const updated = previous.map((caze) => {
        if (caze.id !== id || caze.status === 'RESOLVED') return caze
        const next = updater(caze)
        if (next !== caze) changed = true
        return next
      })
      return changed ? updated : previous
    })
  }

  const loginStudent = (profile) => {
    const student = {
      role: 'student',
      studentId: profile.studentId.trim(),
      name: profile.studentName.trim(),
      programme: profile.studentProgramme.trim(),
    }
    setSession(student)
    toast(`Signed in as ${student.name}`)
  }

  const loginStaff = (departmentId, counselorId) => {
    const department = DEPARTMENTS.find((item) => item.id === departmentId)
    if (!department) {
      toast('Choose a valid department to continue')
      return
    }
    const counselor = counselorsRef.current.find((item) =>
      item.id === counselorId && item.department === department.name,
    )
    setSession({
      role: 'staff',
      departmentId: department.id,
      department: department.name,
      staffId: counselor?.id || `department-staff-${department.id}`,
      name: counselor?.name || department.staffName,
      title: counselor?.role || department.title,
    })
    toast(`Signed in to ${department.name}`)
  }

  const updateCounselorAvailability = (counselorId, availability) => {
    if (!['AVAILABLE', 'OFFLINE'].includes(availability) ||
        session?.department !== 'Wellbeing Cell' ||
        session.staffId !== counselorId) return false
    const counselor = counselorsRef.current.find((item) => item.id === counselorId)
    if (!counselor) return false
    const activeCaseCount = casesRef.current.filter((caze) =>
      caze.assignedCounselor?.id === counselorId &&
      ['IN PROGRESS', 'COORDINATION REQUIRED', 'UNDER REVIEW'].includes(caze.status),
    ).length
    if (activeCaseCount > 0) {
      toast('Availability is BUSY while you have active cases.')
      return false
    }
    persistCounselors(counselorsRef.current.map((item) =>
      item.id === counselorId ? { ...item, availability } : item,
    ))
    toast(`${counselor.name} availability set to ${availability.toLowerCase()}`)
    return true
  }

  const assignAvailableCounselor = (caseId) => {
    const target = casesRef.current.find((caze) => caze.id === caseId)
    if (!target || target.assignedDepartment !== 'Wellbeing Cell' ||
        target.status !== 'NEW' || target.assignedCounselor) return false
    const counselor = chooseAvailableCounselor(
      casesRef.current,
      counselorsRef.current.filter((item) => item.department === target.assignedDepartment),
    )
    if (!counselor) {
      toast('No counselors are currently available. The case remains awaiting assignment.')
      return false
    }
    assignCounselorToCase(target, counselor)
    return true
  }

  const assignCounselorToCase = (target, counselor) => {
    if (!target || target.status !== 'NEW' || target.assignedCounselor ||
        target.assignedDepartment !== counselor.department || counselor.availability !== 'AVAILABLE') return false
    const at = nowIso()
    const assignment = {
      id: counselor.id,
      name: counselor.name,
      role: counselor.role,
      assignedAt: at,
      reason: 'Assigned automatically because you were available and had the lowest active workload in the Counseling Cell.',
    }
    const assignmentEvent = event({
      at,
      actor: 'Campus Case',
      actorRole: 'Assignment service',
      type: 'CASE_ASSIGNED',
      title: 'Counselor assigned',
      body: 'Your request has been assigned to a counselor. You do not need to contact another office.',
    })
    updateCase(target.id, (caze) => ({
      ...caze,
      assignedCounselor: assignment,
      assignmentStatus: 'ASSIGNED',
      assignmentReason: assignment.reason,
      nextAction: 'Your request has been assigned to a counselor. You do not need to contact another office.',
      updatedAt: at,
      timeline: [...caze.timeline, assignmentEvent],
    }))
    notify({
      eventId: assignmentEvent.id,
      eventType: 'CASE_ASSIGNED',
      title: 'COUNSELOR ASSIGNED',
      message: `Your support request ${target.id} has been assigned to ${counselor.name}.`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
      caseId: target.id,
      actionHref: `/student/cases/${target.id}`,
    })
    notify({
      eventId: assignmentEvent.id,
      eventType: 'CASE_ASSIGNED',
      title: 'NEW CASE ASSIGNED',
      message: `A new student wellbeing case has been assigned to you.\nCase: ${target.id}\nStudent: ${target.studentName}\nSummary: ${target.triage?.summary || target.aiSummary}`,
      recipientRole: 'staff',
      recipientDepartment: 'Wellbeing Cell',
      recipientStaffId: counselor.id,
      caseId: target.id,
      actionHref: `/staff/cases/${target.id}`,
    })
    return true
  }

  const logout = () => setSession(null)

  const resetDemo = () => {
    setCases([])
    persistCounselors(COUNSELORS)
    setSession(null)
    toast('Cases, counselor availability, and the current session have been reset.')
  }

  const createCase = async (payload) => {
    const studentId = payload.studentId.trim()
    const studentKey = studentId.toLocaleUpperCase()
    const defaultDepartment = CATEGORY_ROUTING[payload.issueCategory] || 'Student Support Hub'
    const departments = payload.issueCategory === 'Student Wellbeing'
      ? [defaultDepartment]
      : [...new Set(payload.departments?.length ? payload.departments : [defaultDepartment])]
    const uploadedDocuments = await Promise.all((payload.documents || []).map(saveDocument))
    let nextCases = casesRef.current
    const submissions = []
    const notifications = []

    for (const assignedDepartment of departments) {
      const createdAt = nowIso()
      const eligibleCases = nextCases
        .filter((caze) => caze.studentId.trim().toLocaleUpperCase() === studentKey)
        .filter((caze) => caze.status !== 'RESOLVED' || Date.now() - new Date(caze.createdAt).getTime() <= RECENT_CASE_WINDOW_MS)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      const duplicate = eligibleCases.find(
        (caze) => caze.assignedDepartment === assignedDepartment && caze.status !== 'RESOLVED',
      )

      if (duplicate) {
        const documents = uploadedDocuments.map((document) => ({ ...document, caseId: duplicate.id }))
        await Promise.all(documents.map((document) => addDocumentCaseReference(document.storageRef, duplicate.id)))
        const updatedDuplicate = {
          ...duplicate,
          description: `${duplicate.description}\n\nAdditional information: ${payload.description}`,
          helpNeeded: payload.helpNeeded || duplicate.helpNeeded,
          documents: [...(duplicate.documents || []), ...documents],
          updatedAt: createdAt,
          timeline: [
            ...duplicate.timeline,
            event({
              at: createdAt,
              actor: payload.studentName,
              actorRole: 'Student',
              type: 'duplicate-intake',
              title: 'Additional information received',
              body: `The student submitted another request for ${assignedDepartment}; it has been added to the existing departmental case.`,
            }),
          ],
        }
        nextCases = nextCases.map((caze) => caze.id === duplicate.id ? updatedDuplicate : caze)
        submissions.push({ ...updatedDuplicate, isDuplicate: true })
        notifications.push({
          eventType: 'CASE_UPDATED',
          title: 'Student case updated',
          message: `New information was added to case ${duplicate.id}.`,
          recipientRole: 'staff',
          recipientDepartment: assignedDepartment,
          caseId: duplicate.id,
          actionHref: `/staff/cases/${duplicate.id}`,
        })
        continue
      }

      const previousCase = eligibleCases.find((caze) => caze.assignedDepartment !== assignedDepartment)
      const rootId = previousCase ? (previousCase.parentCaseReference || previousCase.id) : null
      const rootCase = rootId ? nextCases.find((caze) => caze.id === rootId) : null
      const id = nextCaseId(nextCases)
      const wellbeingTriage = assignedDepartment === 'Wellbeing Cell'
        ? buildWellbeingTriage(payload.description)
        : null
      const selectedCounselor = wellbeingTriage
        ? chooseAvailableCounselor(
            nextCases,
            counselorsRef.current.filter((counselor) => counselor.department === assignedDepartment),
          )
        : null
      const assignedCounselor = selectedCounselor
        ? {
            id: selectedCounselor.id,
            name: selectedCounselor.name,
            role: selectedCounselor.role,
            assignedAt: createdAt,
            reason: 'Assigned automatically because the counselor was available and had the lowest active workload in the Counseling Cell.',
          }
        : null
      const caseCreatedEvent = event({
        at: createdAt,
        actor: payload.studentName,
        actorRole: 'Student',
        type: 'CASE_CREATED',
        title: 'Case submitted',
        body: assignedDepartment === 'Wellbeing Cell'
          ? selectedCounselor
            ? 'Your support request has been received.'
            : 'Your support request has been received and is awaiting counselor assignment.'
          : `Automatically routed to ${assignedDepartment}. The university will coordinate internally if another team is needed.`,
      })
      const timeline = [caseCreatedEvent]
      let assignmentEvent = null
      if (assignedCounselor) {
        assignmentEvent = event({
          at: createdAt,
          actor: 'Campus Case',
          actorRole: 'Assignment service',
          type: 'CASE_ASSIGNED',
          title: 'Counselor assigned',
          body: 'Your request has been assigned to a counselor. You do not need to contact another office.',
        })
        timeline.push(assignmentEvent)
      } else if (wellbeingTriage) {
        assignmentEvent = event({
          at: createdAt,
          actor: 'Campus Case',
          actorRole: 'Assignment service',
          type: 'ASSIGNMENT_PENDING',
          title: 'Awaiting counselor assignment',
          body: 'The Wellbeing Cell will assign an available counselor.',
        })
        timeline.push(assignmentEvent)
      }
      if (rootCase) {
        timeline.push(event({
          at: createdAt,
          actor: 'Campus Case',
          actorRole: 'Joined-up case management',
          type: 'case-linked',
          title: 'Connected to the existing student journey',
          body: `Linked to ${rootCase.id} (${rootCase.assignedDepartment}) using the matching student ID. Relevant context is carried forward.`,
        }))
      }

      const caze = {
        id,
        studentId,
        studentName: payload.studentName.trim(),
        studentProgramme: payload.studentProgramme.trim(),
        department: assignedDepartment,
        issueCategory: payload.issueCategory,
        title: payload.title.trim(),
        description: payload.description.trim(),
        helpNeeded: (payload.helpNeeded || '').trim(),
        documents: uploadedDocuments.map((document) => ({ ...document, caseId: id })),
        parentCaseReference: rootCase?.id || null,
        status: 'NEW',
        priority: 'MEDIUM',
        aiSummary: wellbeingTriage?.summary || '',
        triage: wellbeingTriage,
        assignedCounselor,
        assignmentStatus: wellbeingTriage
          ? assignedCounselor ? 'ASSIGNED' : 'AWAITING'
          : null,
        assignmentReason: assignedCounselor?.reason || null,
        patternFlagCount: 0,
        owner: null,
        assignedDepartment,
        nextAction: assignedDepartment === 'Wellbeing Cell'
          ? assignedCounselor
            ? 'Your request has been assigned to a counselor. You do not need to contact another office.'
            : 'Your support request has been received and is awaiting counselor assignment.'
          : `${assignedDepartment} to triage and start working on the request.`,
        expectedResponse: expectedFor('NEW'),
        createdAt,
        updatedAt: createdAt,
        internalTasks: [],
        timeline,
        involvedDepartments: [assignedDepartment],
        accessGrants: [],
        waitingOnStudent: null,
        outcomeVerified: false,
        outcomeVerification: '',
      }
      const currentJourney = rootCase ? getJourneyCases(nextCases, rootCase) : []
      const journeyDepartments = [...new Set([
        ...currentJourney.flatMap((item) => [item.assignedDepartment, ...(item.involvedDepartments || [])]),
        assignedDepartment,
      ])]
      caze.involvedDepartments = journeyDepartments
      caze.accessGrants = journeyDepartments
        .filter((department) => department !== assignedDepartment)
        .map((department) => ({
          department,
          reason: `Shared context for connected student journey ${rootCase.id}`,
          grantedAt: createdAt,
        }))
      caze.aiSummary = wellbeingTriage?.summary || buildFallbackSummary(caze, [...currentJourney, caze])
      const connectedIds = new Set(currentJourney.map((item) => item.id))

      nextCases = [
        caze,
        ...nextCases.map((existing) => {
          if (!connectedIds.has(existing.id)) return existing
          let connected = existing
          for (const department of journeyDepartments) {
            if (department !== connected.assignedDepartment) {
              connected = addDepartmentAccess(
                connected,
                department,
                `Shared context for connected student journey ${rootCase.id}`,
                createdAt,
              )
            }
          }
          if (existing.id === rootCase.id) {
            connected = {
              ...connected,
              updatedAt: createdAt,
              timeline: [
                ...connected.timeline,
                event({
                  at: createdAt,
                  actor: 'Campus Case',
                  actorRole: 'Joined-up case management',
                  type: 'case-linked',
                  title: 'A department joined this student journey',
                  body: `${id} was linked from ${assignedDepartment}. The student ID matched an existing case in this journey.`,
                }),
              ],
            }
          }
          return connected
        }),
      ]
      submissions.push(caze)
      await Promise.all(caze.documents.map((document) =>
        addDocumentCaseReference(document.storageRef, id),
      ))
      notifications.push({
        eventId: assignedCounselor || assignedDepartment === 'Wellbeing Cell' ? assignmentEvent?.id : caseCreatedEvent.id,
        eventType: assignedCounselor ? 'CASE_ASSIGNED' : assignedDepartment === 'Wellbeing Cell' ? 'ASSIGNMENT_PENDING' : 'CASE_CREATED',
        title: assignedCounselor ? 'NEW CASE ASSIGNED' : 'New case received',
        message: assignedCounselor
          ? `A new student wellbeing case has been assigned to you.\nCase: ${id}\nStudent: ${caze.studentName}\nSummary: ${caze.triage.summary}`
          : assignedDepartment === 'Wellbeing Cell'
            ? `A new student wellbeing case ${id} is awaiting counselor assignment. Review the case and assign an available counselor.`
            : `A new ${payload.issueCategory} case ${id} has been submitted to ${assignedDepartment}. Review the case and start triage.`,
        recipientRole: 'staff',
        recipientDepartment: assignedDepartment,
        recipientStaffId: assignedCounselor?.id,
        caseId: id,
        actionHref: `/staff/cases/${id}`,
      })
      if (assignedCounselor) {
        notifications.push({
          eventId: assignmentEvent.id,
          eventType: 'CASE_ASSIGNED',
          title: 'COUNSELOR ASSIGNED',
          message: `Your support request ${id} has been assigned to ${assignedCounselor.name}.`,
          recipientRole: 'student',
          recipientStudentId: studentId,
          caseId: id,
          actionHref: `/student/cases/${id}`,
        })
      }
    }

    setCases(nextCases)
    notifications.forEach(notify)
    const created = submissions[0]
    const result = { ...created, createdCases: submissions }
    toast(submissions.length > 1
      ? `${submissions.length} department requests added to the student journey`
      : created.isDuplicate
        ? `Added to existing case ${created.id} for ${created.assignedDepartment}`
        : created.parentCaseReference
          ? `Case ${created.id} linked to journey ${created.parentCaseReference}`
          : `Case ${created.id} created and routed to ${created.assignedDepartment}`)
    return result
  }

  const studentRespond = async (id, { message, documents }) => {
    const caze = casesRef.current.find((item) => item.id === id)
    if (!caze || !caze.waitingOnStudent || caze.status === 'RESOLVED') return
    const uploadedDocuments = await Promise.all((documents || []).map(saveDocument))
    const linkedDocuments = uploadedDocuments.map((document) => ({ ...document, caseId: id }))
    await Promise.all(linkedDocuments.map((document) =>
      addDocumentCaseReference(document.storageRef, id),
    ))
    updateCase(id, (caze) => ({
      ...caze,
      status: caze.status === 'COORDINATION REQUIRED' ? caze.status : 'IN PROGRESS',
      waitingOnStudent: null,
      documents: [...(caze.documents || []), ...linkedDocuments],
      nextAction: `${caze.assignedDepartment} to continue review.`,
      expectedResponse: expectedFor('IN PROGRESS'),
      updatedAt: nowIso(),
      timeline: [
        ...caze.timeline,
        event({
          actor: session.name,
          actorRole: 'Student',
          type: 'STUDENT_RESPONDED',
          title: 'Student responded',
          body: message || (linkedDocuments.length ? 'The student uploaded a requested document.' : 'The student responded to the request.'),
        }),
        ...linkedDocuments.map((document) => event({
          actor: session.name,
          actorRole: 'Student',
          type: 'DOCUMENT_UPLOADED',
          title: 'Document uploaded',
          body: `The student uploaded ${document.name}.`,
        })),
      ],
    }))
    notify({
      eventType: 'STUDENT_RESPONDED',
      title: 'Student responded',
      message: `The student added information to case ${id}. Review the updated timeline and continue the case.`,
      recipientRole: 'staff',
      recipientDepartment: caze.assignedDepartment,
      caseId: id,
      actionHref: `/staff/cases/${id}`,
    })
    for (const document of linkedDocuments) {
      for (const department of new Set([caze.assignedDepartment, ...caze.involvedDepartments])) {
        notify({
          eventType: 'DOCUMENT_UPLOADED',
          title: 'Document received',
          message: `The student uploaded ${document.name} to case ${id}. Review the document in the case record.`,
          recipientRole: 'staff',
          recipientDepartment: department,
          caseId: id,
          actionHref: `/staff/cases/${id}`,
        })
      }
    }
    toast('Your response was added to the case')
  }

  const startCase = (id) => {
    const target = casesRef.current.find((caze) => caze.id === id)
    if (!target || !isAssignedOwner(target, session) || target.status !== 'NEW') {
      if (target?.assignedDepartment === 'Wellbeing Cell' && target.status === 'NEW') {
      toast('Only the assigned counselor can start working on this case.')
      }
      return false
    }
    const at = nowIso()
    const staffLabel = session.name || DEPARTMENTS.find((department) => department.name === session.department)?.staffName || `${session.department} team`
    const startedEvent = event({
      at,
      actor: session.name,
      actorRole: session.department,
      type: 'CASE_STARTED',
      title: 'Case started',
      body: target.assignedDepartment === 'Wellbeing Cell'
        ? `${session.name} has started reviewing your support request.`
        : `${staffLabel} started working on this case.`,
    })
    updateCase(id, (caze) => ({
      ...caze,
      owner: { name: session.name, department: session.department },
      status: 'IN PROGRESS',
      nextAction: `${session.name} is reviewing the request.`,
      expectedResponse: expectedFor('IN PROGRESS'),
      updatedAt: at,
      timeline: [...caze.timeline, startedEvent],
    }))
    if (target.assignedCounselor) {
      persistCounselors(counselorsRef.current.map((counselor) =>
        counselor.id === target.assignedCounselor.id
          ? { ...counselor, availability: 'BUSY' }
          : counselor,
      ))
    }
    notifyForCaseEvent(startedEvent, id, [{
      title: target.assignedDepartment === 'Wellbeing Cell' ? 'YOUR CASE IS BEING HANDLED' : 'Case update',
      message: target.assignedDepartment === 'Wellbeing Cell'
        ? `${session.name} has started reviewing your support request for case ${id}.`
        : `${staffLabel} started working on your case ${id}.`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
    }])
    return true
  }

  const moveToUnderReview = (id) => {
    const target = casesRef.current.find((caze) => caze.id === id)
    if (!target || !isAssignedOwner(target, session) || target.status === 'RESOLVED') return false
    if (!['IN PROGRESS', 'COORDINATION REQUIRED'].includes(target.status)) return false
    if (target.internalTasks.some((task) => task.status !== 'done')) {
      toast('Complete the open coordination task before moving this case to review.')
      return false
    }
    const at = nowIso()
    const reviewEvent = event({
      at,
      actor: session.name,
      actorRole: session.department,
      type: 'CASE_UNDER_REVIEW',
      title: 'Case moved to under review',
      body: target.assignedDepartment === 'Wellbeing Cell'
        ? 'Your support request is under review. Your counselor will share the next step with you.'
        : `${session.department} is reviewing the work completed before resolving the case.`,
    })
    updateCase(id, (caze) => ({
      ...caze,
      status: 'UNDER REVIEW',
      outcomeVerified: false,
      nextAction: target.assignedDepartment === 'Wellbeing Cell'
        ? 'Your support request is under review. Your counselor will share the next step with you.'
        : `${session.department} to verify the outcome before resolution.`,
      expectedResponse: expectedFor('UNDER REVIEW'),
      updatedAt: at,
      timeline: [...caze.timeline, reviewEvent],
    }))
    notifyForCaseEvent(reviewEvent, id, [{
      title: 'Case under review',
      message: target.assignedDepartment === 'Wellbeing Cell'
        ? 'Your support request is under review. Your counselor will share the next step with you.'
        : `${session.department} moved case ${id} to under review and is verifying the outcome.`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
    }])
    return true
  }

  const verifyOutcome = (id, detail) => {
    const target = casesRef.current.find((caze) => caze.id === id)
    if (!target || !isAssignedOwner(target, session) || target.status !== 'UNDER REVIEW' || target.outcomeVerified) return false
    const at = nowIso()
    updateCase(id, (caze) => ({
      ...caze,
      outcomeVerified: true,
      outcomeVerification: detail.trim(),
      nextAction: target.assignedDepartment === 'Wellbeing Cell'
        ? 'Your support team is preparing the next steps.'
        : 'Outcome verified. The owning department can resolve the case.',
      updatedAt: at,
      timeline: [...caze.timeline, event({
        at,
        actor: session.name,
        actorRole: session.department,
        type: 'OUTCOME_VERIFIED',
        title: 'Outcome verified',
        body: detail.trim() || 'The owning department verified the outcome.',
        visibility: 'internal',
      })],
    }))
    return true
  }

  const changePriority = (id, priority) => {
    const target = casesRef.current.find((caze) => caze.id === id)
    if (!target || !isAssignedOwner(target, session) || target.status === 'RESOLVED') return false
    updateCase(id, (caze) => ({
      ...caze,
      priority,
      updatedAt: nowIso(),
      timeline: [
        ...caze.timeline,
        event({
          actor: session.name,
          actorRole: session.department,
          type: 'priority',
          title: `Priority set to ${priority}`,
          body: `Staff updated the case priority to ${priority}.`,
          visibility: 'internal',
        }),
      ],
    }))
    toast(`Priority updated to ${priority}`)
    return true
  }

  const requestFromStudent = (id, message) => {
    const target = casesRef.current.find((item) => item.id === id)
    if (!target || !isAssignedOwner(target, session) || target.status !== 'IN PROGRESS') return false
    const at = nowIso()
    updateCase(id, (caze) => ({
      ...caze,
      waitingOnStudent: { message, requestedAt: at },
      nextAction: 'Waiting for the student to reply or upload a document.',
      expectedResponse: expectedFor('IN PROGRESS'),
      updatedAt: at,
      timeline: [
        ...caze.timeline,
        event({
          at,
          actor: session.name,
          actorRole: session.department,
          type: 'INFO_REQUESTED',
          title: 'Information requested from student',
          body: message,
        }),
      ],
    }))
    notify({
      eventType: 'INFO_REQUESTED',
      title: 'Information requested',
      message: target.assignedDepartment === 'Wellbeing Cell'
        ? `Your counselor needs some additional information for case ${id}: ${message}`
        : `${session.department} needs additional information for case ${id}: ${message}`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
      caseId: id,
      actionHref: `/student/cases/${id}`,
    })
    toast('Request sent to the student inside this case')
    return true
  }

  const addInternalNote = (id, body) => {
    const target = casesRef.current.find((caze) => caze.id === id)
    if (!target || !isAssignedOwner(target, session) || target.status !== 'IN PROGRESS') return false
    updateCase(id, (caze) => ({
      ...caze,
      updatedAt: nowIso(),
      timeline: [
        ...caze.timeline,
        event({
          actor: session.name,
          actorRole: session.department,
          type: 'note',
          title: 'Internal note',
          body,
          visibility: 'internal',
        }),
      ],
    }))
    toast('Internal note added — the student cannot see this')
    return true
  }

  const addStudentUpdate = (id, body) => {
    const target = casesRef.current.find((caze) => caze.id === id)
    const message = body.trim()
    if (!target || target.status === 'RESOLVED' || !message || !isAssignedOwner(target, session) ||
        target.assignedDepartment !== 'Wellbeing Cell') return false
    const at = nowIso()
    const update = {
      id: crypto.randomUUID(),
      at,
      author: session.name,
      authorRole: session.title,
      message,
    }
    const studentUpdateEvent = event({
      at,
      actor: session.name,
      actorRole: session.title,
      type: 'STUDENT_UPDATE_SENT',
      title: 'Counselor update',
      body: `${session.name} sent you an update.`,
    })
    updateCase(id, (caze) => ({
      ...caze,
      studentUpdates: [...(caze.studentUpdates || []), update],
      updatedAt: at,
      timeline: [...caze.timeline, studentUpdateEvent],
    }))
    notifyForCaseEvent(studentUpdateEvent, id, [{
      title: 'Counselor update',
      message: `Your counselor has shared an update for case ${id}.`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
    }])
    toast('Update sent to the student')
    return true
  }

  const createInternalTask = (id, { toDepartment, title, detail }) => {
    const target = casesRef.current.find((caze) => caze.id === id)
    if (!target || !isAssignedOwner(target, session) || target.status !== 'IN PROGRESS' ||
        !DEPARTMENTS.some((department) => department.name === toDepartment && department.name !== session.department)) {
      toast('Only the owning department can coordinate a case that is in progress.')
      return false
    }
    const at = nowIso()
    const task = {
      id: crypto.randomUUID(),
      caseId: id,
      from: session.department,
      to: toDepartment,
      title: title.trim(),
      detail: detail.trim(),
      status: 'open',
      createdAt: at,
      journeyRootId: cases.find((caze) => caze.id === id)?.parentCaseReference || id,
    }
    const studentCoordinationEvent = event({
      at,
      actor: 'Campus Case team',
      actorRole: 'Campus Case team',
      type: 'COORDINATION_STARTED',
      title: 'Support team coordinating',
      body: 'Your support team is coordinating with another campus service. You do not need to contact another office.',
    })
    const coordinationRequestedEvent = event({
      at,
      actor: session.name,
      actorRole: session.department,
      type: 'COORDINATION_REQUESTED',
      title: `Internal coordination requested → ${toDepartment}`,
      body: [title.trim(), detail.trim()].filter(Boolean).join('\n\n'),
      visibility: 'internal',
    })
    const journeyIds = new Set(getJourneyCases(casesRef.current, target).map((caze) => caze.id))
    setCases((previous) => previous.map((caze) => {
      if (!journeyIds.has(caze.id)) return caze
      const connected = addDepartmentAccess(
        caze,
        toDepartment,
        `Assigned an internal task: ${task.title}`,
        at,
      )
      if (caze.id !== id) return connected
      return {
        ...connected,
        status: 'COORDINATION REQUIRED',
        nextAction: target.assignedDepartment === 'Wellbeing Cell'
          ? 'Your support team is coordinating internally. You do not need to visit another office or repeat your situation.'
          : `${toDepartment} to complete an internal task. The student does not need to visit another office.`,
        expectedResponse: expectedFor('COORDINATION REQUIRED'),
        updatedAt: at,
        internalTasks: [...caze.internalTasks, task],
        timeline: [
          ...caze.timeline,
          studentCoordinationEvent,
          coordinationRequestedEvent,
        ],
      }
    }))
    notifyForCaseEvent(coordinationRequestedEvent, id, [
      {
        title: 'New coordination request',
        message: `New coordination request for case ${id}. Open the assigned task to review and respond.`,
        recipientRole: 'staff',
        recipientDepartment: toDepartment,
      },
      ...(target.assignedCounselor ? [{
        title: 'Internal coordination requested',
        message: `${session.name} sent a coordination request to ${toDepartment} for case ${id}.`,
        recipientRole: 'staff',
        recipientDepartment: target.assignedDepartment,
        recipientStaffId: target.assignedCounselor.id,
      }] : []),
    ])
    notifyForCaseEvent(studentCoordinationEvent, id, [{
      title: 'University coordination',
      message: `Your support team is coordinating internally on case ${id}. You do not need to visit another office.`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
    }])
    toast(`Internal task created for ${toDepartment}`)
    return true
  }

  const startInternalTask = (caseId, taskId) => {
    const source = casesRef.current.find((caze) => caze.id === caseId)
    const task = source?.internalTasks.find((item) => item.id === taskId)
    if (!source || source.status === 'RESOLVED' || !task || task.status !== 'open' ||
        task.to !== session?.department) {
      toast('This coordination request is no longer available to your department.')
      return false
    }
    const at = nowIso()
    const startedEvent = event({
      at,
      actor: session.name,
      actorRole: session.department,
      type: 'COORDINATION_ACKNOWLEDGED',
      title: `${session.department} started the request`,
      body: `${session.department} started work on the assigned coordination request.`,
      visibility: 'internal',
    })
    updateCase(caseId, (caze) => ({
      ...caze,
      updatedAt: at,
      internalTasks: caze.internalTasks.map((item) => item.id === taskId
        ? { ...item, status: 'in-progress', startedAt: at }
        : item),
      timeline: [...caze.timeline, startedEvent],
    }))
    toast('Coordination request acknowledged')
    return true
  }

  const completeTask = (caseId, taskId, note) => {
    const source = casesRef.current.find((caze) => caze.id === caseId)
    const task = source?.internalTasks.find((item) => item.id === taskId)
    if (!source || source.status === 'RESOLVED' ||
        source.status !== 'COORDINATION REQUIRED' || !task || task.status === 'done') {
      toast('This internal task is missing or has already been completed.')
      return false
    }
    if (task.to !== session?.department) {
      toast(`Only ${task.to} can complete this internal task.`)
      return false
    }

    const at = nowIso()
    const completionEvent = event({
      at,
      actor: session.name,
      actorRole: session.department,
      type: 'COORDINATION_COMPLETED',
      title: `${session.department} completed request`,
      body: note.trim() || `${session.department} completed the assigned coordination request.`,
      visibility: 'internal',
    })
    const studentCoordinationUpdate = event({
      at,
      actor: 'Campus Case team',
      actorRole: 'Campus Case team',
      type: 'COORDINATION_UPDATED',
      title: 'Internal coordination update received',
      body: 'Your support team has received an update from another campus service.',
    })
    setCases((previous) => {
      const current = previous.find((caze) => caze.id === caseId)
      const currentTask = current?.internalTasks.find((item) => item.id === taskId)
      if (!current || current.status === 'RESOLVED' || !currentTask || currentTask.status === 'done') return previous
      return previous.map((caze) => caze.id === caseId
        ? {
            ...caze,
            status: 'COORDINATION REQUIRED',
            nextAction: `${caze.assignedDepartment} to review the completed coordination task.`,
            updatedAt: at,
            internalTasks: caze.internalTasks.map((item) => item.id === taskId
              ? { ...item, status: 'done', completedAt: at, completedBy: session.name, completionNote: note.trim() }
              : item),
            timeline: [
              ...caze.timeline,
              ...(note.trim()
                ? [event({
                    at,
                    actor: session.name,
                    actorRole: session.department,
                    type: 'task-done-note',
                    title: 'Internal task completion note',
                    body: note.trim(),
                    visibility: 'internal',
                  })]
                : []),
              completionEvent,
              studentCoordinationUpdate,
            ],
          }
        : caze)
    })
    notifyForCaseEvent(completionEvent, caseId, [{
      title: 'Coordination complete',
      message: `${session.department} completed the coordination request for case ${caseId}. Review the result and choose the next step.`,
      recipientRole: 'staff',
      recipientDepartment: source.assignedDepartment,
      recipientStaffId: source.assignedCounselor?.id,
    }])
    toast('Internal task completed')
    return true
  }

  const resolveCase = (id, outcome) => {
    const target = casesRef.current.find((caze) => caze.id === id)
    if (!target) {
      toast('This case could not be found.')
      return false
    }
    if (!isAssignedOwner(target, session)) {
      toast(`Only ${target.assignedDepartment} can resolve this case.`)
      return false
    }
    if (target.status === 'RESOLVED') {
      toast('This case is already resolved.')
      return false
    }
    if (target.status !== 'UNDER REVIEW' || !target.outcomeVerified) {
      toast('Move the case to under review and verify the outcome before resolving it.')
      return false
    }
    if (target.internalTasks.some((task) => task.status !== 'done')) {
      toast('Complete the open coordination task before resolving this case.')
      return false
    }
    const at = nowIso()
    const finalStudentMessage = target.assignedDepartment === 'Wellbeing Cell'
      ? 'Your support request has been reviewed. Your counselor has shared your next step with you.'
      : `Your case ${id} has been resolved by ${session.department}. ${outcome || target.outcomeVerification || 'The requested action has been completed.'}`
    const resolvedEvent = event({
      at,
      actor: session.name,
      actorRole: session.department,
      type: 'CASE_RESOLVED',
      title: 'Case resolved',
      body: target.assignedDepartment === 'Wellbeing Cell'
        ? finalStudentMessage
        : outcome || target.outcomeVerification || 'The requested action has been completed.',
    })
    updateCase(id, (caze) => ({
      ...caze,
      status: 'RESOLVED',
      nextAction: target.assignedDepartment === 'Wellbeing Cell'
        ? finalStudentMessage
        : 'None — case closed.',
      resolutionNotificationEventId: resolvedEvent.id,
      expectedResponse: expectedFor('RESOLVED'),
      updatedAt: at,
      timeline: [...caze.timeline, resolvedEvent],
    }))
    if (target.assignedCounselor) {
      const stillActive = casesRef.current.some((caze) =>
        caze.id !== id &&
        caze.assignedCounselor?.id === target.assignedCounselor.id &&
        ['IN PROGRESS', 'COORDINATION REQUIRED', 'UNDER REVIEW'].includes(caze.status),
      )
      persistCounselors(counselorsRef.current.map((counselor) =>
        counselor.id === target.assignedCounselor.id
          ? { ...counselor, availability: stillActive ? 'BUSY' : 'OFFLINE' }
          : counselor,
      ))
    }
    notifyForCaseEvent(resolvedEvent, id, [
      {
        title: target.assignedDepartment === 'Wellbeing Cell' ? 'CASE RESOLVED' : 'Case resolved',
        message: finalStudentMessage,
        recipientRole: 'student',
        recipientStudentId: target.studentId,
      },
      ...(target.assignedCounselor ? [{
        title: 'Case workflow resolved',
        message: `Case ${id} is resolved. No further workflow action is available.`,
        recipientRole: 'staff',
        recipientDepartment: target.assignedDepartment,
        recipientStaffId: target.assignedCounselor.id,
      }] : []),
    ])
    toast('Case resolved')
    return true
  }

  const grantAccess = (id, department, reason) => {
    const target = casesRef.current.find((caze) => caze.id === id)
    if (!target || target.status === 'RESOLVED' || !isAssignedOwner(target, session)) return false
    const at = nowIso()
    updateCase(id, (caze) => ({
      ...addDepartmentAccess(caze, department, reason, at),
      updatedAt: at,
      timeline: [
        ...caze.timeline,
        event({
          at,
          actor: session.name,
          actorRole: session.department,
          type: 'access',
          title: `Need-to-know access granted to ${department}`,
          body: reason,
          visibility: 'internal',
        }),
      ],
    }))
    toast(`${department} can now see this case`)
    return true
  }

  const value = useMemo(
    () => ({
      cases,
      counselors,
      session,
      toasts,
      notifications,
      unreadNotifications,
      clearUnreadNotifications,
      markNotificationRead,
      toast,
      loginStudent,
      loginStaff,
      updateCounselorAvailability,
      assignAvailableCounselor,
      logout,
      resetDemo,
      createCase,
      studentRespond,
      startCase,
      moveToUnderReview,
      verifyOutcome,
      changePriority,
      requestFromStudent,
      addInternalNote,
      addStudentUpdate,
      createInternalTask,
      startInternalTask,
      completeTask,
      resolveCase,
      grantAccess,
    }),
    [cases, counselors, session, toasts, notifications, unreadNotifications],
  )

  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>
}

export function useCampus() {
  const ctx = useContext(CampusContext)
  if (!ctx) throw new Error('useCampus must be used within CampusProvider')
  return ctx
}
