import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  CATEGORY_ROUTING,
  DEPARTMENTS,
  STORAGE_KEY,
  STUDENT,
  createSeedCases,
  expectedFor,
  nextCaseId,
} from './data'

const CampusContext = createContext(null)

function nowIso() {
  return new Date().toISOString()
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
    if (!raw) return { cases: createSeedCases(), session: null }
    const parsed = JSON.parse(raw)
    return {
      cases: parsed.cases?.length ? parsed.cases : createSeedCases(),
      session: parsed.session || null,
    }
  } catch {
    return { cases: createSeedCases(), session: null }
  }
}

export function CampusProvider({ children }) {
  const initial = loadState()
  const [cases, setCases] = useState(initial.cases)
  const [session, setSession] = useState(initial.session)
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cases, session }))
  }, [cases, session])

  const toast = (message) => {
    const id = crypto.randomUUID()
    setToasts((t) => [...t, { id, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }

  const updateCase = (id, updater) => {
    setCases((prev) => prev.map((c) => (c.id === id ? updater(c) : c)))
  }

  const loginStudent = () => {
    setSession({ role: 'student', ...STUDENT })
    toast(`Signed in as ${STUDENT.name}`)
  }

  const loginStaff = (departmentId) => {
    const dept = DEPARTMENTS.find((d) => d.id === departmentId)
    setSession({
      role: 'staff',
      departmentId: dept.id,
      department: dept.name,
      name: dept.staffName,
      title: dept.title,
    })
    toast(`Signed in to ${dept.name}`)
  }

  const logout = () => setSession(null)

  const resetDemo = () => {
    setCases(createSeedCases())
    toast('Demo reset. CC-1042 is a new attendance case again.')
  }

  const createCase = (payload) => {
    const assignedDepartment = CATEGORY_ROUTING[payload.category] || 'Student Support Hub'
    const id = nextCaseId(cases)
    const createdAt = nowIso()
    const next = {
      id,
      studentId: STUDENT.id,
      studentName: STUDENT.name,
      studentProgramme: STUDENT.programme,
      category: payload.category,
      title: payload.title,
      description: payload.description,
      helpNeeded: payload.helpNeeded,
      documents: payload.documents || [],
      status: 'NEW',
      assignedDepartment,
      owner: null,
      nextAction: `${assignedDepartment} to assign an owner and review the request.`,
      expectedResponse: expectedFor('NEW'),
      createdAt,
      updatedAt: createdAt,
      involvedDepartments: [assignedDepartment],
      accessGrants: [],
      waitingOnStudent: null,
      internalTasks: [],
      timeline: [
        event({
          at: createdAt,
          actor: STUDENT.name,
          actorRole: 'Student',
          type: 'submitted',
          title: 'Case submitted',
          body: `Automatically routed to ${assignedDepartment}. You do not need to visit another office.`,
        }),
      ],
    }
    setCases((prev) => [next, ...prev])
    toast(`Case ${id} created and routed to ${assignedDepartment}`)
    return next
  }

  const studentRespond = (id, { message, documents }) => {
    updateCase(id, (c) => ({
      ...c,
      status: 'UNDER REVIEW',
      waitingOnStudent: null,
      documents: [...(c.documents || []), ...(documents || [])],
      nextAction: `${c.assignedDepartment} to continue review.`,
      expectedResponse: expectedFor('UNDER REVIEW'),
      updatedAt: nowIso(),
      timeline: [
        ...c.timeline,
        event({
          actor: STUDENT.name,
          actorRole: 'Student',
          type: 'reply',
          title: 'Student responded',
          body: message,
        }),
      ],
    }))
    toast('Your response was added to the case')
  }

  const assignOwner = (id, ownerName) => {
    const dept = session?.department
    updateCase(id, (c) => ({
      ...c,
      owner: { name: ownerName, department: dept },
      status: c.status === 'NEW' ? 'ASSIGNED' : c.status,
      nextAction: `${ownerName} is reviewing the case.`,
      expectedResponse: expectedFor(c.status === 'NEW' ? 'ASSIGNED' : c.status),
      updatedAt: nowIso(),
      timeline: [
        ...c.timeline,
        event({
          actor: ownerName,
          actorRole: dept,
          type: 'owner',
          title: 'Owner assigned',
          body: `${ownerName} (${dept}) is the named lead.`,
        }),
      ],
    }))
    toast('Case owner assigned')
  }

  const changeStatus = (id, status) => {
    updateCase(id, (c) => ({
      ...c,
      status,
      expectedResponse: expectedFor(status),
      nextAction:
        status === 'RESOLVED'
          ? 'None — case closed.'
          : status === 'WAITING FOR STUDENT'
            ? 'Waiting for the student to reply.'
            : c.nextAction,
      updatedAt: nowIso(),
      timeline: [
        ...c.timeline,
        event({
          actor: session.name,
          actorRole: session.department,
          type: 'status',
          title: `Status changed to ${status.toLowerCase()}`,
          body: `The case is now ${status}.`,
        }),
      ],
    }))
    toast(`Status updated to ${status}`)
  }

  const requestFromStudent = (id, message) => {
    updateCase(id, (c) => ({
      ...c,
      status: 'WAITING FOR STUDENT',
      waitingOnStudent: { message, requestedAt: nowIso() },
      nextAction: 'Waiting for the student to reply or upload a document.',
      expectedResponse: expectedFor('WAITING FOR STUDENT'),
      updatedAt: nowIso(),
      timeline: [
        ...c.timeline,
        event({
          actor: session.name,
          actorRole: session.department,
          type: 'request',
          title: 'Information requested from student',
          body: message,
        }),
      ],
    }))
    toast('Request sent to the student inside this case')
  }

  const addInternalNote = (id, body) => {
    updateCase(id, (c) => ({
      ...c,
      updatedAt: nowIso(),
      timeline: [
        ...c.timeline,
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
  }

  const createInternalTask = (id, { toDepartment, title, detail }) => {
    updateCase(id, (c) => {
      const grants = c.accessGrants.some((g) => g.department === toDepartment)
        ? c.accessGrants
        : [
            ...c.accessGrants,
            {
              department: toDepartment,
              reason: `Need-to-know: ${title}`,
              grantedAt: nowIso(),
            },
          ]
      const involved = c.involvedDepartments.includes(toDepartment)
        ? c.involvedDepartments
        : [...c.involvedDepartments, toDepartment]
      return {
        ...c,
        status: 'INTERNAL COORDINATION',
        involvedDepartments: involved,
        accessGrants: grants,
        nextAction: `${toDepartment} to complete an internal task. Student is not asked to visit them.`,
        expectedResponse: expectedFor('INTERNAL COORDINATION'),
        updatedAt: nowIso(),
        internalTasks: [
          ...c.internalTasks,
          {
            id: crypto.randomUUID(),
            from: session.department,
            to: toDepartment,
            title,
            detail,
            status: 'open',
            createdAt: nowIso(),
          },
        ],
        timeline: [
          ...c.timeline,
          event({
            actor: session.name,
            actorRole: session.department,
            type: 'coordinate',
            title: 'Internal coordination started',
            body: `${toDepartment} has been asked to help inside this case. You do not need to visit another office.`,
          }),
          event({
            actor: session.name,
            actorRole: session.department,
            type: 'task',
            title: `Internal task for ${toDepartment}`,
            body: title,
            visibility: 'internal',
          }),
        ],
      }
    })
    toast(`Internal task created for ${toDepartment}`)
  }

  const completeTask = (caseId, taskId, note) => {
    updateCase(caseId, (c) => ({
      ...c,
      status: 'UNDER REVIEW',
      nextAction: `${c.assignedDepartment} to apply the verified outcome.`,
      expectedResponse: expectedFor('UNDER REVIEW'),
      updatedAt: nowIso(),
      internalTasks: c.internalTasks.map((t) =>
        t.id === taskId ? { ...t, status: 'done', completedAt: nowIso(), completionNote: note } : t,
      ),
      timeline: [
        ...c.timeline,
        event({
          actor: session.name,
          actorRole: session.department,
          type: 'task-done',
          title: 'Internal task completed',
          body: note,
          visibility: 'internal',
        }),
        event({
          actor: session.name,
          actorRole: session.department,
          type: 'coordinate',
          title: 'Internal verification complete',
          body: 'Another university team confirmed details on this case. You still do not need to visit another office.',
        }),
      ],
    }))
    toast('Internal task completed')
  }

  const resolveCase = (id, outcome) => {
    updateCase(id, (c) => ({
      ...c,
      status: 'RESOLVED',
      nextAction: 'None — case closed.',
      expectedResponse: 'Complete',
      updatedAt: nowIso(),
      timeline: [
        ...c.timeline,
        event({
          actor: session.name,
          actorRole: session.department,
          type: 'resolved',
          title: 'Case resolved',
          body: outcome,
        }),
      ],
    }))
    toast('Case resolved')
  }

  const grantAccess = (id, department, reason) => {
    updateCase(id, (c) => ({
      ...c,
      involvedDepartments: c.involvedDepartments.includes(department)
        ? c.involvedDepartments
        : [...c.involvedDepartments, department],
      accessGrants: [
        ...c.accessGrants,
        { department, reason, grantedAt: nowIso() },
      ],
      updatedAt: nowIso(),
      timeline: [
        ...c.timeline,
        event({
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
  }

  const value = useMemo(
    () => ({
      cases,
      session,
      toasts,
      toast,
      loginStudent,
      loginStaff,
      logout,
      resetDemo,
      createCase,
      studentRespond,
      assignOwner,
      changeStatus,
      requestFromStudent,
      addInternalNote,
      createInternalTask,
      completeTask,
      resolveCase,
      grantAccess,
    }),
    [cases, session, toasts],
  )

  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>
}

export function useCampus() {
  const ctx = useContext(CampusContext)
  if (!ctx) throw new Error('useCampus must be used within CampusProvider')
  return ctx
}
