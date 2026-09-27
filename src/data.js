export const UNIVERSITY = 'Vasavi College of Engineering'
export const STORAGE_KEY = 'campus-case-prototype-v2'
export const ATTENTION_THRESHOLD_MS = 24 * 60 * 60 * 1000

export const STATUSES = [
  'NEW',
  'IN PROGRESS',
  'COORDINATION REQUIRED',
  'UNDER REVIEW',
  'RESOLVED',
]

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

export const CATEGORIES = [
  'Academics',
  'Attendance',
  'Examination',
  'Fees/Finance',
  'Marks/Results',
  'Hostel',
  'Student Wellbeing',
  'Scholarship',
  'Other',
]

export const CATEGORY_ROUTING = {
  Academics: 'Academic Support',
  'Student Wellbeing': 'Wellbeing Cell',
  Wellbeing: 'Wellbeing Cell',
  Attendance: 'Attendance Cell',
  Examination: 'Examinations Office',
  'Fees/Finance': 'Fees & Finance',
  'Marks/Results': 'Examinations Office',
  Hostel: 'Hostel Administration',
  Scholarship: 'Scholarships Office',
  Other: 'Student Support Hub',
}

export const COUNSELORS = [
  { id: 'counselor-ananya-rao', name: 'Ananya Rao', role: 'Student Counselor', department: 'Wellbeing Cell', availability: 'AVAILABLE' },
  { id: 'counselor-rohan-mehta', name: 'Rohan Mehta', role: 'Student Counselor', department: 'Wellbeing Cell', availability: 'AVAILABLE' },
  { id: 'counselor-priya-nair', name: 'Priya Nair', role: 'Student Counselor', department: 'Wellbeing Cell', availability: 'OFFLINE' },
  { id: 'counselor-arjun-kumar', name: 'Arjun Kumar', role: 'Student Counselor', department: 'Wellbeing Cell', availability: 'OFFLINE' },
]

export const DEPARTMENTS = [
  {
    id: 'attendance',
    name: 'Attendance Cell',
    staffName: 'Attendance Officer',
    title: 'Attendance Officer',
    blurb: 'Owns attendance corrections and workshop credit.',
  },
  {
    id: 'events',
    name: 'Event & Workshop Cell',
    staffName: 'Workshop Coordinator',
    title: 'Workshop Coordinator',
    blurb: 'Verifies participation for college events.',
  },
  {
    id: 'wellbeing',
    name: 'Wellbeing Cell',
    staffName: 'Wellbeing Officer',
    title: 'Wellbeing Officer',
    blurb: 'Coordinates joined-up student support cases.',
  },
  {
    id: 'fees',
    name: 'Fees & Finance',
    staffName: 'Finance Officer',
    title: 'Finance Officer',
    blurb: 'Fee waivers, receipts, and holds.',
  },
  {
    id: 'academic',
    name: 'Academic Support',
    staffName: 'Academic Support Officer',
    title: 'Academic Support Officer',
    blurb: 'Coursework, extensions, and faculty coordination.',
  },
  {
    id: 'examinations',
    name: 'Examinations Office',
    staffName: 'Examinations Officer',
    title: 'Examinations Officer',
    blurb: 'Examinations, marks, and results.',
  },
  {
    id: 'hostel',
    name: 'Hostel Administration',
    staffName: 'Hostel Administrator',
    title: 'Hostel Administrator',
    blurb: 'Hostel and accommodation services.',
  },
  {
    id: 'scholarships',
    name: 'Scholarships Office',
    staffName: 'Scholarships Officer',
    title: 'Scholarships Officer',
    blurb: 'Scholarship administration.',
  },
  {
    id: 'support',
    name: 'Student Support Hub',
    staffName: 'Student Support Officer',
    title: 'Student Support Officer',
    blurb: 'Routes requests that need an initial review.',
  },
]

export function formatWhen(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function expectedFor(status) {
  if (status === 'RESOLVED') return 'Complete'
  if (status === 'COORDINATION REQUIRED') return 'A university team is coordinating internally'
  if (status === 'COORDINATION REQUIRED') return 'A university team is coordinating internally'
  if (status === 'NEW') return 'The assigned department will review the request'
  return 'The assigned department will provide an update'
}

export function nextCaseId(cases) {
  const nums = cases.map((c) => Number(String(c.id).match(/^CC-(\d+)$/)?.[1])).filter(Number.isFinite)
  const max = nums.length ? Math.max(...nums) : 0
  return `CC-${String(max + 1).padStart(4, '0')}`
}

export function getJourneyCases(cases, caze) {
  const rootId = caze.parentCaseReference || caze.id
  return cases
    .filter((candidate) => candidate.id === rootId || candidate.parentCaseReference === rootId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

export function buildFallbackSummary(caze, journeyCases) {
  const linked = journeyCases.filter((item) => item.id !== caze.id)
  const latestEvent = [...caze.timeline].sort((a, b) => new Date(b.at) - new Date(a.at))[0]
  const current = `${caze.studentName} contacted ${caze.assignedDepartment} about ${caze.issueCategory.toLowerCase()}: “${caze.title}”. The case is ${caze.status.toLowerCase().replaceAll('_', ' ')}${latestEvent ? `; the latest update is ${latestEvent.title.toLowerCase()}` : ''}.`
  if (!linked.length) return `${current} No other case is currently connected to this student journey.`
  const departments = [...new Set(journeyCases.flatMap((item) => [
    item.assignedDepartment,
    ...(item.involvedDepartments || []),
  ]))]
  return `${current} It is connected to ${linked.length} ${linked.length === 1 ? 'other case' : 'other cases'} across ${departments.join(', ')}, so the student’s context is carried forward.`
}

export function buildWellbeingTriage(description) {
  const content = description.trim().replace(/\s+/g, ' ')
  const lower = content.toLocaleLowerCase()
  const areas = []
  if (/class|academ|assignment|course|study|learning/.test(lower)) areas.push('Academic Support')
  if (/attend|missed|absence|class/.test(lower)) areas.push('Attendance Support')
  const supportAreas = ['Wellbeing / Counseling', ...new Set(areas)]
  const difficulties = [
    /class|academ|assignment|course|study|learning/.test(lower) && 'academics and assignments',
    /attend|missed|absence/.test(lower) && 'attendance',
  ].filter(Boolean)
  const hasContactedWellbeing = /already contacted|contacted.*wellbeing|wellbeing team/.test(lower)
  const summary = difficulties.length
    ? `Student reports difficulty managing ${difficulties.join(' and ')}${hasContactedWellbeing ? ' and has already contacted the wellbeing team' : ''}.`
    : content
      ? `Student support request: ${content.slice(0, 220).replace(/[.!?]+$/, '')}${content.length > 220 ? '…' : ''}.`
      : 'The student submitted a wellbeing support request.'
  return {
    summary,
    supportAreas,
    primaryDepartment: 'Wellbeing / Counseling Cell',
    suggestedDepartment: supportAreas.includes('Academic Support') ? 'Academic Support' : null,
    suggestedNextAction: 'Assign the case to an available counselor for initial review.',
    source: 'deterministic-fallback',
  }
}

const ACTIVE_COUNSELOR_STATUSES = ['IN PROGRESS', 'COORDINATION REQUIRED', 'UNDER REVIEW']

export function counselorWorkload(cases, counselors) {
  return counselors.map((counselor) => ({
    ...counselor,
    activeCaseCount: cases.filter((caze) =>
      caze.assignedCounselor?.id === counselor.id && ACTIVE_COUNSELOR_STATUSES.includes(caze.status),
    ).length,
    assignedCases: cases
      .filter((caze) => caze.assignedCounselor?.id === counselor.id && ACTIVE_COUNSELOR_STATUSES.includes(caze.status))
      .map((caze) => caze.id),
    availability: cases.some((caze) =>
      caze.assignedCounselor?.id === counselor.id && ACTIVE_COUNSELOR_STATUSES.includes(caze.status),
    ) ? 'BUSY' : counselor.availability === 'BUSY' ? 'OFFLINE' : counselor.availability,
  }))
}

export function chooseAvailableCounselor(cases, counselors) {
  return counselorWorkload(cases, counselors)
    .filter((counselor) => counselor.availability === 'AVAILABLE')
    .sort((a, b) => a.activeCaseCount - b.activeCaseCount || a.id.localeCompare(b.id))[0] || null
}

export function isAttentionRequired(caze, now = Date.now()) {
  if (caze.status === 'RESOLVED') return false
  const updatedAt = new Date(caze.updatedAt).getTime()
  return Number.isFinite(updatedAt) && now - updatedAt >= ATTENTION_THRESHOLD_MS
}

export function staffCanSee(caze, departmentName) {
  if (!departmentName) return false
  if (caze.assignedDepartment === departmentName) return true
  if (caze.accessGrants?.some((grant) => grant.department === departmentName)) return true
  return false
}

export function visibilityReason(caze, departmentName) {
  if (caze.assignedDepartment === departmentName) return 'Owning department'
  if (caze.accessGrants?.some((grant) => grant.department === departmentName)) return 'Need-to-know access'
  if (caze.involvedDepartments?.includes(departmentName)) return 'Supporting access'
  return 'No access'
}
