export const UNIVERSITY = 'Vasavi College of Engineering'
export const STORAGE_KEY = 'campus-case-prototype-v1'

export const STATUSES = [
  'NEW',
  'ASSIGNED',
  'UNDER REVIEW',
  'WAITING FOR STUDENT',
  'INTERNAL COORDINATION',
  'ACTION COMPLETED',
  'RESOLVED',
]

export const CATEGORIES = [
  'Academics',
  'Attendance',
  'Examination',
  'Fees/Finance',
  'Marks/Results',
  'Hostel',
  'Wellbeing',
  'Scholarship',
  'Other',
]

export const CATEGORY_ROUTING = {
  Academics: 'Academic Services',
  Attendance: 'Attendance Cell',
  Examination: 'Examinations Office',
  'Fees/Finance': 'Fees & Finance',
  'Marks/Results': 'Examinations Office',
  Hostel: 'Hostel Administration',
  Wellbeing: 'Wellbeing & Counselling',
  Scholarship: 'Scholarships Office',
  Other: 'Student Support Hub',
}

export const DEPARTMENTS = [
  {
    id: 'attendance',
    name: 'Attendance Cell',
    staffName: 'Meera Iyer',
    title: 'Attendance Officer',
    blurb: 'Owns attendance corrections and workshop credit.',
  },
  {
    id: 'events',
    name: 'Event & Workshop Cell',
    staffName: 'Rahul Desai',
    title: 'Workshop Coordinator',
    blurb: 'Verifies participation for college events.',
  },
  {
    id: 'wellbeing',
    name: 'Wellbeing & Counselling',
    staffName: 'Dr Kavita Nair',
    title: 'Wellbeing Advisor',
    blurb: 'Lead for student support cases.',
  },
  {
    id: 'fees',
    name: 'Fees & Finance',
    staffName: 'Sanjay Kapoor',
    title: 'Finance Officer',
    blurb: 'Fee waivers, receipts, and holds.',
  },
  {
    id: 'academic',
    name: 'Academic Services',
    staffName: 'Leela Menon',
    title: 'Academic Support Lead',
    blurb: 'Coursework, extensions, and faculty coordination.',
  },
]

export const STUDENT = {
  id: 'STU-2024-118',
  name: 'Priya Sharma',
  programme: 'B.Tech Computer Science · Year 2',
  hall: 'Maple Hall, Room 214',
  email: 'priya.sharma@vce.ac.in',
}

export function formatWhen(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function expectedFor(status) {
  if (status === 'RESOLVED') return 'Complete'
  if (status === 'WAITING FOR STUDENT') return 'Waiting on the student'
  if (status === 'INTERNAL COORDINATION') return '1–2 working days'
  if (status === 'NEW') return 'First contact within 2 working days'
  return 'Update within 2 working days'
}

function ev(partial) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    ...partial,
  }
}

export function createSeedCases() {
  return [
    {
      id: 'CC-1042',
      studentId: STUDENT.id,
      studentName: STUDENT.name,
      studentProgramme: STUDENT.programme,
      category: 'Attendance',
      title: 'My attendance for a college workshop is missing even though I attended.',
      description:
        'I attended the Industry Readiness Workshop on 18 September 2026 in Lecture Theatre 2. My attendance still shows as absent. I have the participation certificate issued at the end of the session.',
      helpNeeded: 'Please update my attendance record so the workshop is counted.',
      documents: [],
      status: 'NEW',
      assignedDepartment: 'Attendance Cell',
      owner: null,
      nextAction: 'Attendance Cell to assign an owner and review the request.',
      expectedResponse: 'First contact within 2 working days',
      createdAt: '2026-09-24T09:12:00',
      updatedAt: '2026-09-24T09:12:00',
      involvedDepartments: ['Attendance Cell'],
      accessGrants: [],
      waitingOnStudent: null,
      internalTasks: [],
      timeline: [
        ev({
          at: '2026-09-24T09:12:00',
          actor: 'Priya Sharma',
          actorRole: 'Student',
          type: 'submitted',
          title: 'Case submitted',
          body: 'Automatically routed to Attendance Cell from category: Attendance. Priya does not need to visit another office.',
          visibility: 'student',
        }),
      ],
    },
    {
      id: 'CC-1039',
      studentId: STUDENT.id,
      studentName: STUDENT.name,
      studentProgramme: STUDENT.programme,
      category: 'Wellbeing',
      title: 'Requesting a check-in after a difficult assessment week.',
      description:
        'I am coping, but I would like a short conversation about sleep and workload. I do not need an emergency appointment.',
      helpNeeded: 'A first wellbeing conversation and, if useful, a link to academic support.',
      documents: [],
      status: 'UNDER REVIEW',
      assignedDepartment: 'Wellbeing & Counselling',
      owner: { name: 'Dr Kavita Nair', department: 'Wellbeing & Counselling' },
      nextAction: 'Wellbeing advisor to confirm a 20-minute first contact slot.',
      expectedResponse: 'Update within 2 working days',
      createdAt: '2026-09-19T14:40:00',
      updatedAt: '2026-09-22T11:05:00',
      involvedDepartments: ['Wellbeing & Counselling', 'Academic Services'],
      accessGrants: [
        {
          department: 'Academic Services',
          reason: 'Need-to-know: possible extension conversation, no clinical notes shared.',
          grantedAt: '2026-09-22T11:05:00',
        },
      ],
      waitingOnStudent: null,
      internalTasks: [
        {
          id: 'task-1039-1',
          from: 'Wellbeing & Counselling',
          to: 'Academic Services',
          title: 'Confirm whether an assessment extension conversation is appropriate',
          detail: 'Student consented to share workload context only. Do not request a new student visit.',
          status: 'open',
          createdAt: '2026-09-22T11:05:00',
        },
      ],
      timeline: [
        ev({
          at: '2026-09-19T14:40:00',
          actor: 'Priya Sharma',
          actorRole: 'Student',
          type: 'submitted',
          title: 'Case submitted',
          body: 'Routed to Wellbeing & Counselling.',
          visibility: 'student',
        }),
        ev({
          at: '2026-09-20T09:10:00',
          actor: 'Dr Kavita Nair',
          actorRole: 'Wellbeing & Counselling',
          type: 'owner',
          title: 'Owner assigned',
          body: 'Dr Kavita Nair is the named lead.',
          visibility: 'student',
        }),
        ev({
          at: '2026-09-22T11:05:00',
          actor: 'Dr Kavita Nair',
          actorRole: 'Wellbeing & Counselling',
          type: 'coordinate',
          title: 'Internal coordination started',
          body: 'Academic Services invited with need-to-know access. You do not need to visit another office.',
          visibility: 'student',
        }),
        ev({
          at: '2026-09-22T11:06:00',
          actor: 'Dr Kavita Nair',
          actorRole: 'Wellbeing & Counselling',
          type: 'note',
          title: 'Internal note',
          body: 'Low-intensity request. Keep clinical detail in counselling record; share only workload flags.',
          visibility: 'internal',
        }),
      ],
    },
    {
      id: 'CC-1021',
      studentId: STUDENT.id,
      studentName: STUDENT.name,
      studentProgramme: STUDENT.programme,
      category: 'Scholarship',
      title: 'Scholarship stipend letter for bank update.',
      description: 'Needed an official letter confirming my 2026 bursary for a new bank account.',
      helpNeeded: 'A signed stipend confirmation letter.',
      documents: [{ name: 'Bank-details-form.pdf', size: '180 KB', at: '2026-09-08T10:00:00', by: 'Student' }],
      status: 'RESOLVED',
      assignedDepartment: 'Scholarships Office',
      owner: { name: 'Aisha Rahman', department: 'Scholarships Office' },
      nextAction: 'None — case closed.',
      expectedResponse: 'Complete',
      createdAt: '2026-09-08T10:02:00',
      updatedAt: '2026-09-11T16:20:00',
      involvedDepartments: ['Scholarships Office'],
      accessGrants: [],
      waitingOnStudent: null,
      internalTasks: [],
      timeline: [
        ev({
          at: '2026-09-08T10:02:00',
          actor: 'Priya Sharma',
          actorRole: 'Student',
          type: 'submitted',
          title: 'Case submitted',
          body: 'Routed to Scholarships Office.',
          visibility: 'student',
        }),
        ev({
          at: '2026-09-11T16:20:00',
          actor: 'Aisha Rahman',
          actorRole: 'Scholarships Office',
          type: 'resolved',
          title: 'Case resolved',
          body: 'Letter issued and emailed to Priya.',
          visibility: 'student',
        }),
      ],
    },
    {
      id: 'CC-1044',
      studentId: 'STU-2023-077',
      studentName: 'Arjun Mehta',
      studentProgramme: 'BA Economics · Year 3',
      category: 'Examination',
      title: 'Clash between two module exams on 3 October.',
      description: 'EC301 and ST210 are scheduled in overlapping slots.',
      helpNeeded: 'An alternative sitting for one paper.',
      documents: [],
      status: 'WAITING FOR STUDENT',
      assignedDepartment: 'Examinations Office',
      owner: { name: 'Helen Crowe', department: 'Examinations Office' },
      nextAction: 'Waiting for Arjun to confirm which paper he can sit in the afternoon slot.',
      expectedResponse: 'Waiting on the student',
      createdAt: '2026-09-21T08:30:00',
      updatedAt: '2026-09-23T15:00:00',
      involvedDepartments: ['Examinations Office'],
      accessGrants: [],
      waitingOnStudent: {
        message: 'Please confirm whether you can sit ST210 in the 14:00 sitting on 3 October.',
        requestedAt: '2026-09-23T15:00:00',
      },
      internalTasks: [],
      timeline: [
        ev({
          at: '2026-09-21T08:30:00',
          actor: 'Arjun Mehta',
          actorRole: 'Student',
          type: 'submitted',
          title: 'Case submitted',
          body: 'Routed to Examinations Office.',
          visibility: 'student',
        }),
        ev({
          at: '2026-09-23T15:00:00',
          actor: 'Helen Crowe',
          actorRole: 'Examinations Office',
          type: 'request',
          title: 'Information requested from student',
          body: 'Please confirm whether you can sit ST210 in the 14:00 sitting on 3 October.',
          visibility: 'student',
        }),
      ],
    },
    {
      id: 'CC-1040',
      studentId: 'STU-2025-302',
      studentName: 'Noah Williams',
      studentProgramme: 'BSc Biology · Year 1',
      category: 'Fees/Finance',
      title: 'Tuition fee hold blocking library access.',
      description: 'Payment was made on 16 September but the hold is still showing.',
      helpNeeded: 'Clear the hold or confirm the payment posting.',
      documents: [{ name: 'Bank-transfer-receipt.pdf', size: '92 KB', at: '2026-09-20T12:10:00', by: 'Student' }],
      status: 'ASSIGNED',
      assignedDepartment: 'Fees & Finance',
      owner: { name: 'Sanjay Kapoor', department: 'Fees & Finance' },
      nextAction: 'Finance to match the payment reference and lift the hold.',
      expectedResponse: 'Update within 2 working days',
      createdAt: '2026-09-20T12:12:00',
      updatedAt: '2026-09-20T13:40:00',
      involvedDepartments: ['Fees & Finance'],
      accessGrants: [],
      waitingOnStudent: null,
      internalTasks: [],
      timeline: [
        ev({
          at: '2026-09-20T12:12:00',
          actor: 'Noah Williams',
          actorRole: 'Student',
          type: 'submitted',
          title: 'Case submitted',
          body: 'Routed to Fees & Finance.',
          visibility: 'student',
        }),
        ev({
          at: '2026-09-20T13:40:00',
          actor: 'Sanjay Kapoor',
          actorRole: 'Fees & Finance',
          type: 'owner',
          title: 'Owner assigned',
          body: 'Sanjay Kapoor is the named lead.',
          visibility: 'student',
        }),
      ],
    },
    {
      id: 'CC-1035',
      studentId: 'STU-2024-441',
      studentName: 'Sara Benali',
      studentProgramme: 'MEng Mechanical · Year 2',
      category: 'Hostel',
      title: 'Broken heater in North Court 19.',
      description: 'Room has been cold for four nights.',
      helpNeeded: 'Repair or a temporary room move.',
      documents: [],
      status: 'RESOLVED',
      assignedDepartment: 'Hostel Administration',
      owner: { name: 'Tom Hale', department: 'Hostel Administration' },
      nextAction: 'None — case closed.',
      expectedResponse: 'Complete',
      createdAt: '2026-09-12T18:00:00',
      updatedAt: '2026-09-14T11:30:00',
      involvedDepartments: ['Hostel Administration'],
      accessGrants: [],
      waitingOnStudent: null,
      internalTasks: [],
      timeline: [
        ev({
          at: '2026-09-12T18:00:00',
          actor: 'Sara Benali',
          actorRole: 'Student',
          type: 'submitted',
          title: 'Case submitted',
          body: 'Routed to Hostel Administration.',
          visibility: 'student',
        }),
        ev({
          at: '2026-09-14T11:30:00',
          actor: 'Tom Hale',
          actorRole: 'Hostel Administration',
          type: 'resolved',
          title: 'Case resolved',
          body: 'Heater replaced. Student confirmed the room is warm.',
          visibility: 'student',
        }),
      ],
    },
    {
      id: 'CC-1031',
      studentId: 'STU-2022-019',
      studentName: 'Daniel Okonkwo',
      studentProgramme: 'LLB · Year 3',
      category: 'Academics',
      title: 'Missed seminar due to hospital appointment.',
      description: 'Need the missed seminar marked as authorised absence and notes shared.',
      helpNeeded: 'Authorised absence and seminar notes.',
      documents: [{ name: 'Appointment-letter.jpg', size: '1.1 MB', at: '2026-09-17T09:00:00', by: 'Student' }],
      status: 'UNDER REVIEW',
      assignedDepartment: 'Academic Services',
      owner: { name: 'Leela Menon', department: 'Academic Services' },
      nextAction: 'Academic Services reviewing evidence with the module convenor internally.',
      expectedResponse: 'Update within 2 working days',
      createdAt: '2026-09-17T09:05:00',
      updatedAt: '2026-09-18T10:22:00',
      involvedDepartments: ['Academic Services'],
      accessGrants: [],
      waitingOnStudent: null,
      internalTasks: [],
      timeline: [
        ev({
          at: '2026-09-17T09:05:00',
          actor: 'Daniel Okonkwo',
          actorRole: 'Student',
          type: 'submitted',
          title: 'Case submitted',
          body: 'Routed to Academic Services.',
          visibility: 'student',
        }),
        ev({
          at: '2026-09-18T10:22:00',
          actor: 'Leela Menon',
          actorRole: 'Academic Services',
          type: 'status',
          title: 'Status changed to Under review',
          body: 'Evidence received. Convenor will be contacted inside this case.',
          visibility: 'student',
        }),
      ],
    },
    {
      id: 'CC-1028',
      studentId: 'STU-2025-088',
      studentName: 'Mia Chen',
      studentProgramme: 'BSc Psychology · Year 1',
      category: 'Attendance',
      title: 'Guest lecture attendance not showing.',
      description: 'Attended Careers in Psychology guest lecture.',
      helpNeeded: 'Mark attendance present.',
      documents: [],
      status: 'INTERNAL COORDINATION',
      assignedDepartment: 'Attendance Cell',
      owner: { name: 'Meera Iyer', department: 'Attendance Cell' },
      nextAction: 'Event & Workshop Cell to confirm the guest-lecture register.',
      expectedResponse: '1–2 working days',
      createdAt: '2026-09-16T11:00:00',
      updatedAt: '2026-09-18T09:45:00',
      involvedDepartments: ['Attendance Cell', 'Event & Workshop Cell'],
      accessGrants: [
        {
          department: 'Event & Workshop Cell',
          reason: 'Need-to-know: verify guest lecture sign-in sheet.',
          grantedAt: '2026-09-18T09:45:00',
        },
      ],
      waitingOnStudent: null,
      internalTasks: [
        {
          id: 'task-1028-1',
          from: 'Attendance Cell',
          to: 'Event & Workshop Cell',
          title: 'Confirm Mia Chen on 15 Sep guest lecture register',
          detail: 'Do not ask the student to visit the events office.',
          status: 'open',
          createdAt: '2026-09-18T09:45:00',
        },
      ],
      timeline: [
        ev({
          at: '2026-09-16T11:00:00',
          actor: 'Mia Chen',
          actorRole: 'Student',
          type: 'submitted',
          title: 'Case submitted',
          body: 'Routed to Attendance Cell.',
          visibility: 'student',
        }),
        ev({
          at: '2026-09-18T09:45:00',
          actor: 'Meera Iyer',
          actorRole: 'Attendance Cell',
          type: 'coordinate',
          title: 'Internal coordination started',
          body: 'Event & Workshop Cell asked to verify the register. You do not need to visit another office.',
          visibility: 'student',
        }),
      ],
    },
  ]
}

export function nextCaseId(cases) {
  const nums = cases.map((c) => Number(String(c.id).replace('CC-', ''))).filter((n) => !Number.isNaN(n))
  const max = nums.length ? Math.max(...nums) : 1042
  return `CC-${max + 1}`
}

export function staffCanSee(caze, departmentName) {
  if (!departmentName) return false
  if (caze.assignedDepartment === departmentName) return true
  if (caze.involvedDepartments?.includes(departmentName)) return true
  if (caze.accessGrants?.some((g) => g.department === departmentName)) return true
  return false
}

export function visibilityReason(caze, departmentName) {
  if (caze.assignedDepartment === departmentName) return 'Owning department'
  if (caze.accessGrants?.some((g) => g.department === departmentName)) return 'Need-to-know access'
  if (caze.involvedDepartments?.includes(departmentName)) return 'Invited on case'
  return 'No access'
}
