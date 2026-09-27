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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const cases = Array.isArray(parsed.cases) ? parsed.cases : []
    return {
      revision: parsed.revision || { time: 0, clientId: '' },
      counselors: Array.isArray(parsed.counselors)
        ? COUNSELORS.map((counselor) => ({
            ...counselor,
            ...(parsed.counselors.find((item) => item.id === counselor.id) || {}),
          }))
        : COUNSELORS,
      cases: cases.map((rawCase) => {
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
      }),
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
      counselorsRef.current = mergedCounselors
      setCounselorsState(mergedCounselors)
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
    const eventId = crypto.randomUUID()
    const timestamp = nowIso()
    const notification = {
      id: eventId,
      eventId,
      eventType: details.eventType || 'CASE_EVENT',
      createdAt: timestamp,
      timestamp,
      sourceClient: clientId.current,
      sourceRole: session?.role,
      sourceDepartment: session?.department || null,
      ...details,
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
      notification.readAt ? notification : { ...notification, readAt },
    ))
  }

  const markNotificationRead = (id) => {
    const readAt = nowIso()
    setNotifications((current) => current.map((notification) =>
      notification.id === id && !notification.readAt ? { ...notification, readAt } : notification,
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
      reason: 'Available counselor with the lowest active workload.',
    }
    updateCase(target.id, (caze) => ({
      ...caze,
      assignedCounselor: assignment,
      assignmentStatus: 'ASSIGNED',
      assignmentReason: assignment.reason,
      nextAction: 'Your request has been assigned to a counselor. You do not need to contact another office.',
      updatedAt: at,
      timeline: [
        ...caze.timeline,
        event({
          at,
          actor: 'Campus Case',
          actorRole: 'Assignment service',
          type: 'COUNSELOR_ASSIGNED',
          title: 'Counselor assigned',
          body: 'Your request has been assigned to a counselor. You do not need to contact another office.',
        }),
      ],
    }))
    notify({
      eventType: 'COUNSELOR_ASSIGNED',
      title: 'COUNSELOR ASSIGNED',
      message: `Your support request ${target.id} has been assigned to ${counselor.name}.`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
      caseId: target.id,
      actionHref: `/student/cases/${target.id}`,
    })
    notify({
      eventType: 'COUNSELOR_ASSIGNED',
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
            reason: 'Available counselor with the lowest active workload.',
          }
        : null
      const timeline = [
        event({
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
        }),
      ]
      if (assignedCounselor) {
        timeline.push(event({
          at: createdAt,
          actor: 'Campus Case',
          actorRole: 'Assignment service',
          type: 'COUNSELOR_ASSIGNED',
          title: 'Counselor assigned',
          body: 'Your request has been assigned to a counselor. You do not need to contact another office.',
        }))
      } else if (wellbeingTriage) {
        timeline.push(event({
          at: createdAt,
          actor: 'Campus Case',
          actorRole: 'Assignment service',
          type: 'ASSIGNMENT_PENDING',
          title: 'Awaiting counselor assignment',
          body: 'The Wellbeing Cell will assign an available counselor.',
        }))
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
        eventType: 'CASE_CREATED',
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
          eventType: 'COUNSELOR_ASSIGNED',
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
    updateCase(id, (caze) => ({
      ...caze,
      owner: { name: session.name, department: session.department },
      status: 'IN PROGRESS',
      nextAction: `${session.name} is reviewing the request.`,
      expectedResponse: expectedFor('IN PROGRESS'),
      updatedAt: at,
      timeline: [...caze.timeline, event({
        at,
        actor: session.name,
        actorRole: session.department,
        type: 'CASE_STARTED',
        title: 'Case started',
        body: target.assignedDepartment === 'Wellbeing Cell'
          ? `${session.name} has started reviewing your support request.`
          : `${staffLabel} started working on this case.`,
      })],
    }))
    if (target.assignedCounselor) {
      persistCounselors(counselorsRef.current.map((counselor) =>
        counselor.id === target.assignedCounselor.id
          ? { ...counselor, availability: 'BUSY' }
          : counselor,
      ))
    }
    notify({
      eventType: 'CASE_STARTED',
      title: target.assignedDepartment === 'Wellbeing Cell' ? 'YOUR CASE IS BEING HANDLED' : 'Case update',
      message: target.assignedDepartment === 'Wellbeing Cell'
        ? `${session.name} has started reviewing your support request for case ${id}.`
        : `${staffLabel} started working on your case ${id}.`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
      caseId: id,
      actionHref: `/student/cases/${id}`,
    })
    return true
  }

  const moveToUnderReview = (id) => {
    const target = casesRef.current.find((caze) => caze.id === id)
    if (!target || !isAssignedOwner(target, session) || target.status === 'RESOLVED') return false
    if (!['IN PROGRESS', 'COORDINATION REQUIRED'].includes(target.status)) return false
    if (target.internalTasks.some((task) => task.status === 'open')) {
      toast('Complete the open coordination task before moving this case to review.')
      return false
    }
    const at = nowIso()
    updateCase(id, (caze) => ({
      ...caze,
      status: 'UNDER REVIEW',
      outcomeVerified: false,
      nextAction: target.assignedDepartment === 'Wellbeing Cell'
        ? 'Your support request has been reviewed.'
        : `${session.department} to verify the outcome before resolution.`,
      expectedResponse: expectedFor('UNDER REVIEW'),
      updatedAt: at,
      timeline: [...caze.timeline, event({
        at,
        actor: session.name,
        actorRole: session.department,
        type: 'CASE_MOVED_TO_REVIEW',
        title: 'Case moved to under review',
        body: target.assignedDepartment === 'Wellbeing Cell'
          ? 'Your support request has been reviewed.'
          : `${session.department} is reviewing the work completed before resolving the case.`,
      })],
    }))
    notify({
      eventType: 'CASE_MOVED_TO_REVIEW',
      title: 'Case under review',
      message: target.assignedDepartment === 'Wellbeing Cell'
        ? `Your support request for case ${id} has been reviewed. The Wellbeing Cell is verifying the next steps.`
        : `${session.department} moved case ${id} to under review and is verifying the outcome.`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
      caseId: id,
      actionHref: `/student/cases/${id}`,
    })
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
    updateCase(id, (caze) => ({
      ...caze,
      studentUpdates: [...(caze.studentUpdates || []), update],
      updatedAt: at,
      timeline: [
        ...caze.timeline,
        event({
          at,
          actor: session.name,
          actorRole: session.title,
          type: 'COUNSELOR_UPDATE',
          title: 'Counselor update',
          body: `${session.name} sent you an update.`,
        }),
      ],
    }))
    notify({
      eventType: 'COUNSELOR_UPDATE',
      title: 'Counselor update',
      message: `${session.name} sent you an update about case ${id}.`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
      caseId: id,
      actionHref: `/student/cases/${id}`,
    })
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
          ? `Your support team is coordinating with ${toDepartment}. You do not need to visit another office or repeat your situation.`
          : `${toDepartment} to complete an internal task. The student does not need to visit another office.`,
        expectedResponse: expectedFor('COORDINATION REQUIRED'),
        updatedAt: at,
        internalTasks: [...caze.internalTasks, task],
        timeline: [
          ...caze.timeline,
          event({
            at,
            actor: session.name,
            actorRole: session.department,
            type: 'COORDINATION_STARTED',
            title: 'Internal coordination started',
            body: target.assignedDepartment === 'Wellbeing Cell'
              ? `Your support team is coordinating with ${toDepartment}. You do not need to visit another office or repeat your situation.`
              : `${toDepartment} has been asked to help inside this case. The student does not need to visit another office.`,
          }),
          event({
            at,
            actor: session.name,
            actorRole: session.department,
            type: 'COORDINATION_TASK_CREATED',
            title: `Internal task for ${toDepartment}`,
            body: title,
            visibility: 'internal',
          }),
        ],
      }
    }))
    notify({
      eventType: 'COORDINATION_TASK_CREATED',
      title: 'New coordination task',
      message: target.assignedDepartment === 'Wellbeing Cell' && toDepartment === 'Academic Support'
        ? `A wellbeing support task for case ${id} has been assigned to Academic Support. Review the limited support request and report the next step to Wellbeing Cell.`
        : `${session.department} asked ${toDepartment} to help with ${target.issueCategory.toLowerCase()} case ${id}: ${title.trim().replace(/[.!?]+$/, '')}.`,
      recipientRole: 'staff',
      recipientDepartment: toDepartment,
      caseId: id,
      actionHref: `/staff/cases/${id}`,
    })
    notify({
      eventType: 'COORDINATION_STARTED',
      title: 'University coordination',
      message: target.assignedDepartment === 'Wellbeing Cell'
      ? `Your support team is coordinating with ${toDepartment} on case ${id}. You do not need to visit another office.`
        : `${session.department} has started internal coordination for case ${id}. You do not need to visit another office.`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
      caseId: id,
      actionHref: `/student/cases/${id}`,
    })
    toast(`Internal task created for ${toDepartment}`)
    return true
  }

  const completeTask = (caseId, taskId, note) => {
    const source = casesRef.current.find((caze) => caze.id === caseId)
    const task = source?.internalTasks.find((item) => item.id === taskId)
    if (!source || source.status !== 'COORDINATION REQUIRED' || !task || task.status !== 'open') {
      toast('This internal task is missing or has already been completed.')
      return false
    }
    if (task.to !== session?.department) {
      toast(`Only ${task.to} can complete this internal task.`)
      return false
    }

    const at = nowIso()
    setCases((previous) => {
      const current = previous.find((caze) => caze.id === caseId)
      const currentTask = current?.internalTasks.find((item) => item.id === taskId)
      if (!current || !currentTask || currentTask.status !== 'open') return previous
      return previous.map((caze) => caze.id === caseId
        ? {
            ...caze,
            status: 'COORDINATION REQUIRED',
            nextAction: `${caze.assignedDepartment} to review the completed coordination task.`,
            updatedAt: at,
            internalTasks: caze.internalTasks.map((item) => item.id === taskId
              ? { ...item, status: 'done', completedAt: at, completionNote: note.trim() }
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
              event({
                at,
                actor: session.name,
                actorRole: session.department,
                type: 'COORDINATION_COMPLETED',
                title: 'Internal verification completed',
                body: `${session.department} completed the assigned internal task.`,
                visibility: 'internal',
              }),
              event({
                at,
                actor: session.name,
                actorRole: session.department,
                type: 'COORDINATION_UPDATED',
                title: source.assignedDepartment === 'Wellbeing Cell' && session.department === 'Academic Support'
                  ? 'Academic Support responded'
                  : 'University coordination updated',
                body: source.assignedDepartment === 'Wellbeing Cell' && session.department === 'Academic Support'
                  ? 'Academic Support has responded. Your counselor will review the update.'
                  : 'The university team has completed its internal step. The owning department will continue your case.',
              }),
            ],
          }
        : caze)
    })
    notify({
      eventType: 'COORDINATION_COMPLETED',
      title: 'Coordination complete',
      message: source.assignedDepartment === 'Wellbeing Cell' && session.department === 'Academic Support'
        ? `Academic Support completed the requested task for ${caseId}. Review the result and decide the next case action.`
        : `${session.department} completed the requested verification for ${caseId}. Review the result and decide the next case action.`,
      recipientRole: 'staff',
      recipientDepartment: source.assignedDepartment,
      recipientStaffId: source.assignedCounselor?.id,
      caseId,
      actionHref: `/staff/cases/${caseId}`,
    })
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
    if (target.internalTasks.some((task) => task.status === 'open')) {
      toast('Complete the open coordination task before resolving this case.')
      return false
    }
    const at = nowIso()
    updateCase(id, (caze) => ({
      ...caze,
      status: 'RESOLVED',
      nextAction: target.assignedDepartment === 'Wellbeing Cell'
        ? 'Your support request has been coordinated and your next steps have been shared with you.'
        : 'None — case closed.',
      expectedResponse: expectedFor('RESOLVED'),
      updatedAt: at,
      timeline: [
        ...caze.timeline,
        event({
          at,
          actor: session.name,
          actorRole: session.department,
          type: 'CASE_RESOLVED',
          title: 'Case resolved',
          body: caze.assignedDepartment === 'Wellbeing Cell'
            ? 'Your support request has been coordinated and your next steps have been shared with you.'
            : outcome || caze.outcomeVerification || 'The requested action has been completed.',
        }),
      ],
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
    notify({
      eventType: 'CASE_RESOLVED',
      title: target.assignedDepartment === 'Wellbeing Cell' ? 'CASE RESOLVED' : 'Case resolved',
      message: target.assignedDepartment === 'Wellbeing Cell'
        ? `Your support request ${id} has been resolved.`
        : `Your case ${id} has been resolved by ${session.department}. ${outcome || target.outcomeVerification || 'The requested action has been completed.'}`,
      recipientRole: 'student',
      recipientStudentId: target.studentId,
      caseId: id,
      actionHref: `/student/cases/${id}`,
    })
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
